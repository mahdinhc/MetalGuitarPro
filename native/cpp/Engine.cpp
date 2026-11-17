#include "Engine.h"
#include <chrono>

namespace mgp {

static inline double midiHz(double m) { return 440.0 * std::pow(2.0, (m - 69.0) / 12.0); }

// ------------------------------------------------------------------------------------------------
std::unique_ptr<SeqData> buildSequence(const float* flat, int count, double length, bool loop) {
  auto d = std::make_unique<SeqData>();
  d->length = (std::isfinite(length) && length > 0) ? length : 4.0; d->loop = loop;
  if (count < 0 || !flat) count = 0;
  d->ev.reserve(count);
  for (int i = 0; i < count; ++i) {
    const float* e = flat + (size_t)i * kEvStride;
    SeqEvent ev;
    ev.beat = e[0]; ev.type = (uint8_t)e[1]; ev.str = (int8_t)e[2]; ev.fret = (int16_t)e[3];
    ev.vel = e[4]; ev.flags = (int32_t)e[5]; ev.arg = e[6]; ev.id = (int32_t)e[7];
    if (!(ev.beat >= 0) || ev.type > EV_VIB_OFF) continue;
    if (ev.type != EV_VIB_ON && ev.type != EV_VIB_OFF && (ev.str < 0 || ev.str >= kStrings)) continue;
    if (loop) { if (ev.beat >= d->length) ev.beat = std::fmod(ev.beat, d->length); }
    else if (ev.beat >= d->length + 0.25) continue;
    d->ev.push_back(ev);
  }
  auto prio = [](const SeqEvent& e) { return (e.type == EV_OFF || e.type == EV_VIB_OFF) ? 0 : 1; };
  std::stable_sort(d->ev.begin(), d->ev.end(), [&](const SeqEvent& a, const SeqEvent& b) {
    return a.beat != b.beat ? a.beat < b.beat : prio(a) < prio(b); });
  return d;
}

// ------------------------------------------------------------------------------------------------
Engine::Engine() {
  for (int i = 0; i < P_COUNT; ++i) { params_[i].store(kParamMeta[i].def); p_[i] = kParamMeta[i].def; }
  static const int std_tuning[6] = {40, 45, 50, 55, 59, 64};
  for (int i = 0; i < kStrings; ++i) tuning_[i].store(std_tuning[i]);
  voices_ = new StringVoice[kVoices];
  pend_.reserve(256);
}

Engine::~Engine() {
  Cmd c;
  while (pop(c)) if (c.type == C_SEQ) delete (SeqData*)c.ptr;
  delete seq_;
  for (uint32_t i = gt_; i < gh_; ++i) delete garb_[i % 16];
  delete[] voices_;
}

void Engine::collectGarbage() {
  std::lock_guard<std::mutex> g(gm_);
  uint32_t t = gt_.load();
  while (t != gh_.load(std::memory_order_acquire)) { delete garb_[t % 16]; garb_[t % 16] = nullptr; ++t; }
  gt_.store(t, std::memory_order_release);
}

void Engine::prepare(double sr) {
  ready_ = false;
  sr_ = sr;
  alpha_ = (float)(1.0 - std::exp(-(double)kBlock / (sr * 0.02)));
  const double s4 = sr * 4.0;
  for (int i = 0; i < kVoices; ++i) { voices_[i].clear(); voices_[i].on = false; voices_[i].vol = voices_[i].volT = 0; }
  for (int i = 0; i < kStrings; ++i) { slot_[i] = 0; live_[i] = Live(); }
  vibCount_ = 0; bendC_ = 0; gateEnv_ = 0; gateG_ = 0; clock_ = 0; pend_.clear();
  pu_.init(FT::Peaking, 3200, 1.4, 5, sr);
  wah_.init(FT::Peaking, 900, 5, 0, sr);
  hp_.init(FT::HighPass, 220, .7, 0, s4);   bst_.init(FT::Peaking, 720, .9, 9, s4);
  lp1_.init(FT::LowPass, 6500, .7, 0, s4);  hp2_.init(FT::HighPass, 90, .7, 0, s4);
  lp2_.init(FT::LowPass, 5500, .7, 0, s4);  hp3_.init(FT::HighPass, 35, .7, 0, s4);
  bass_.init(FT::LowShelf, 100, .7, 0, s4); mid_.init(FT::Peaking, 650, .8, 0, s4);
  treb_.init(FT::HighShelf, 3200, .7, 0, s4); pres_.init(FT::HighShelf, 5000, .7, 0, s4);
  dp_.init(FT::Peaking, 95, 1.2, 0, s4);
  os_.init(kBlock); os_.reset();
  up_.assign(kBlock * 4, 0.f); dn_.assign(kBlock * 4, 0.f);
  sag_.prepare(s4); comp_.prepare(sr);
  comp_.set(-10, 30, 12, 0.003f, 0.25f);
  for (int t = 0; t < 5; ++t) { cabs_[t].init(t, sr); cabScale_[t] = cabs_[t].normalisation(); cabs_[t].reset(); }
  cabCur_ = 0; cabPrev_ = -1; cabFade_ = 1.f;
  rev_.prepare(sr);
  dL_.init((int)sr + 8); dR_.init((int)sr + 8); ch_[0].init((int)(sr * 0.1)); ch_[1].init((int)(sr * 0.1));
  dLp_.init(FT::LowPass, 3200, .7, 0, sr); dHp_.init(FT::HighPass, 180, .7, 0, sr);
  lfoPh_[0] = lfoPh_[1] = 0;
  for (int i = 0; i < P_COUNT; ++i) p_[i] = params_[i].load(std::memory_order_relaxed);
  cabCur_ = (int)clampf(p_[P_cabT], 0, 4);
  updateAmp(true);
  stagePos_ = kBlock; ready_ = true;
}

// ---- control API ---------------------------------------------------------------------------------
void Engine::setParam(int id, float v) {
  if (id < 0 || id >= P_COUNT || !std::isfinite(v)) return;   // a NaN would poison every filter state
  params_[id].store(clampf(v, kParamMeta[id].min, kParamMeta[id].max), std::memory_order_relaxed);
}
void Engine::setParams(const float* v, int n) { for (int i = 0; i < n && i < P_COUNT; ++i) setParam(i, v[i]); }
void Engine::setTuning(const int* m) { for (int i = 0; i < kStrings; ++i) tuning_[i].store(m[i] < 0 ? 0 : (m[i] > 127 ? 127 : m[i]), std::memory_order_relaxed); }

void Engine::push(const Cmd& c) {
  std::lock_guard<std::mutex> g(qm_);
  const uint32_t h = qh_.load(std::memory_order_relaxed);
  if (h - qt_.load(std::memory_order_acquire) >= (uint32_t)kQ) { if (c.type == C_SEQ) delete (SeqData*)c.ptr; return; }
  q_[h % kQ] = c;
  qh_.store(h + 1, std::memory_order_release);
}
bool Engine::pop(Cmd& c) {
  const uint32_t t = qt_.load(std::memory_order_relaxed);
  if (t == qh_.load(std::memory_order_acquire)) return false;
  c = q_[t % kQ];
  qt_.store(t + 1, std::memory_order_release);
  return true;
}

void Engine::noteOn(int s, int f, float vel, int flags, float delayMs) { Cmd c{}; c.type = C_ON; c.str = (int8_t)s; c.fret = (int16_t)f; c.f0 = vel; c.f1 = delayMs; c.flags = flags; c.d0 = -1; push(c); }
void Engine::noteOff(int s, int flags, float delayMs) { Cmd c{}; c.type = C_OFF; c.str = (int8_t)s; c.flags = flags; c.f1 = delayMs; c.d0 = -1; push(c); }
void Engine::move(int s, int f, int flags) { Cmd c{}; c.type = C_MOVE; c.str = (int8_t)s; c.fret = (int16_t)f; c.flags = flags; push(c); }
void Engine::muteAll(float ms) { Cmd c{}; c.type = C_MUTE_ALL; c.f0 = ms; push(c); }
void Engine::play(double b) { Cmd c{}; c.type = C_PLAY; c.d0 = std::isfinite(b) ? b : 0.0; push(c); }
void Engine::stopPlay() { Cmd c{}; c.type = C_STOP; push(c); }
void Engine::seek(double b) { Cmd c{}; c.type = C_SEEK; c.d0 = std::isfinite(b) ? b : 0.0; push(c); }
void Engine::setSequence(const float* flat, int count, double len, bool loop) {
  collectGarbage();
  Cmd c{}; c.type = C_SEQ; c.ptr = buildSequence(flat, count, len, loop).release(); push(c);
}
EngineStats Engine::stats(bool resetPeak) {
  EngineStats s;
  s.peak = resetPeak ? peak_.exchange(0.f) : peak_.load();
  s.cpu = cpu_.load(); s.beat = (float)beatOut_.load(); s.playing = playOut_.load() ? 1.f : 0.f; s.blocks = blocks_.load();
  return s;
}

// ---- audio-thread command execution ---------------------------------------------------------------
void Engine::exec(const Cmd& c) {
  switch (c.type) {
    case C_ON: startNote(c.str, c.fret, c.f0 > 0 ? c.f0 : 0.85f, c.flags, (int)c.d0, c.d0 < 0); break;
    case C_OFF: releaseString(c.str, c.flags); break;
    case C_MOVE: {   // flags: bit0 = slide (else legato), bit1 = only if the string is currently ringing
      if (c.str < 0 || c.str >= kStrings) break;
      if (c.flags & 2) { const StringVoice& v = voices_[c.str * 2 + slot_[c.str]]; if (!v.on || v.volT == 0.f) break; }
      moveString(c.str, c.fret, (c.flags & 1) != 0, 0);
      break;
    }
    case C_MUTE_ALL: releaseAll(c.f0 > 0 ? c.f0 : 30.f); for (auto& l : live_) l.held = false; break;
    case C_PLAY: playing_ = true; beat_ = std::max(0.0, c.d0); vibCount_ = 0; playOut_.store(true); beatOut_.store(beat_); break;
    case C_STOP: playing_ = false; releaseAll(30.f); vibCount_ = 0; playOut_.store(false); break;
    case C_SEEK: beat_ = std::max(0.0, c.d0); releaseAll(30.f); beatOut_.store(beat_); break;
    case C_SEQ: {
      SeqData* old = seq_; seq_ = (SeqData*)c.ptr;
      if (old) {
        const uint32_t h = gh_.load(std::memory_order_relaxed);
        if (h - gt_.load(std::memory_order_acquire) < 16) { garb_[h % 16] = old; gh_.store(h + 1, std::memory_order_release); }
      }
      break;
    }
  }
}

void Engine::runCommands() {
  Cmd c;
  while (pop(c)) {
    if ((c.type == C_ON || c.type == C_OFF) && c.f1 > 0.f && pend_.size() < pend_.capacity()) {
      pend_.push_back({clock_ + (int64_t)(c.f1 * sr_ / 1000.0), c});
    } else exec(c);
  }
  for (size_t i = 0; i < pend_.size();) {
    if (pend_[i].due <= clock_) { const Cmd cc = pend_[i].c; pend_[i] = pend_.back(); pend_.pop_back(); exec(cc); }
    else ++i;
  }
}

// ---- strings -------------------------------------------------------------------------------------
void Engine::startNote(int str, int fret, float vel, int flags, int owner, bool live) {
  if (str < 0 || str >= kStrings) return;
  const double T = tuning_[str].load(std::memory_order_relaxed);
  const float pk = p_[P_pick] / 100.f;
  const int fl = flags | (p_[P_mute] > .5f ? NF_MUTE : 0) | (p_[P_harm] > .5f ? NF_HARM : 0);
  const bool mute = fl & NF_MUTE, harm = fl & NF_HARM;
  double f = midiHz(T + fret);
  if (harm) {
    int nat = 0;
    switch (fret) { case 5: nat = 4; break; case 7: nat = 3; break; case 12: nat = 2; break; case 19: nat = 3; break; case 24: nat = 4; break; default: break; }
    f = nat ? midiHz(T) * nat : f * 2;
  }
  f = clampd(f, 20.0, sr_ * 0.2);
  StringVoice* cur = &voices_[str * 2 + slot_[str]];
  if (cur->on) { cur->release(sr_, 0.004f); slot_[str] ^= 1; }
  StringVoice& v = voices_[str * 2 + slot_[str]];
  v.a = mute ? .3f : harm ? .65f : .5f + .2f * pk;
  v.t60 = std::max(.12f, (float)(p_[P_sus] * std::pow(110.0 / f, .25) * (mute ? .1 : harm ? .55 : 1.)));
  v.ft = f * (1.0 + (rng_.unipolar() - .5) * .003);
  if (p_[P_slin] > .5f) { v.fc = v.ft * std::pow(2.0, -4.0 / 12.0); v.gl = 1.0 - std::exp(-32.0 / (sr_ * .03)); }
  else { v.fc = v.ft; v.gl = 1; }
  v.clear(); v.age = 0; v.on = true; v.vp = rng_.unipolar() * 6.28318; v.vol = 0; v.volT = 1; v.k = .08f; v.lf = fret; v.owner = owner;
  const int L = (int)std::lround(sr_ / f);
  v.excite(rng_, L, .45f * vel, std::max(2, (int)std::lround(L * (p_[P_bridge] > .5f ? .11 : .26))), .2f + .75f * pk);
  if (live) {
    Live& l = live_[str];
    l.held = true; l.fret = fret; l.flags = flags; l.vel = vel; l.owner = owner;
    l.trem = (flags & NF_TREM) || p_[P_trem] > .5f; l.next = clock_ + (int64_t)(sr_ / 15.0); l.alt = false;
  }
}

void Engine::releaseString(int str, int flags) {
  if (str < 0 || str >= kStrings) return;
  live_[str].held = false;
  const bool ring = (flags & NF_RING) || p_[P_ring] > .5f, mute = (flags & NF_MUTE) || p_[P_mute] > .5f;
  StringVoice& v = voices_[str * 2 + slot_[str]];
  v.release(sr_, ring ? .9f : mute ? .02f : .07f);
}

void Engine::moveString(int str, int fret, bool slide, int flags) {
  if (str < 0 || str >= kStrings) return;
  StringVoice& v = voices_[str * 2 + slot_[str]];
  if (!v.on || v.volT == 0.f) { startNote(str, fret, .85f, flags, -1, false); return; }
  const double f = midiHz(tuning_[str].load(std::memory_order_relaxed) + fret);
  const bool up = fret > v.lf;
  if (slide) { v.ft = f; v.gl = 1.0 - std::exp(-32.0 / (sr_ * p_[P_slide] / 3000.0)); }
  else {
    v.ft = v.fc = f; v.gl = 1;
    const int L = (int)std::lround(sr_ / f);
    v.excite(rng_, L, up ? .22f : .12f, (int)std::lround(L * .2), .5f);
  }
  v.lf = fret; live_[str].fret = fret;
}

void Engine::releaseAll(float ms) {
  for (int i = 0; i < kVoices; ++i) if (voices_[i].on) voices_[i].release(sr_, ms / 1000.f);
  for (auto& l : live_) l.held = false;
}

// ---- sequencer ---------------------------------------------------------------------------------------
void Engine::fireRange(const SeqData* d, double a, double b) {
  if (!d || b <= a) return;
  const auto& ev = d->ev;
  size_t lo = 0, hi = ev.size();
  while (lo < hi) { const size_t m = (lo + hi) / 2; if (ev[m].beat < a) lo = m + 1; else hi = m; }
  for (size_t i = lo; i < ev.size() && ev[i].beat < b; ++i) {
    const SeqEvent& e = ev[i];
    switch (e.type) {
      case EV_ON: {
        Cmd c{}; c.type = C_ON; c.str = e.str; c.fret = e.fret; c.f0 = e.vel; c.flags = e.flags; c.f1 = e.arg; c.d0 = e.id;
        if (e.arg > 0.f && pend_.size() < pend_.capacity()) pend_.push_back({clock_ + (int64_t)(e.arg * sr_ / 1000.0), c});
        else startNote(e.str, e.fret, e.vel > 0 ? e.vel : .85f, e.flags, e.id, false);
        break;
      }
      case EV_OFF: if (voices_[e.str * 2 + slot_[e.str]].owner == e.id) releaseString(e.str, e.flags); break;
      case EV_MOVE: moveString(e.str, e.fret, e.arg > .5f, e.flags); voices_[e.str * 2 + slot_[e.str]].owner = e.id; break;
      case EV_BEND: {
        StringVoice& v = voices_[e.str * 2 + slot_[e.str]];
        if (v.on && v.owner == e.id) { v.ft = midiHz(tuning_[e.str].load(std::memory_order_relaxed) + e.fret + e.arg); v.gl = 1.0 - std::exp(-32.0 / (sr_ * .15)); }
        break;
      }
      case EV_VIB_ON: ++vibCount_; break;
      case EV_VIB_OFF: vibCount_ = std::max(0, vibCount_ - 1); break;
    }
  }
}

void Engine::clicks(double a, double b, double len, bool loop) {
  if (!metro_.load(std::memory_order_relaxed) || b <= a) return;
  for (long i = (long)std::ceil(a - 1e-6); (double)i < b; ++i) {
    if (!loop && (double)i >= len) break;
    for (auto& c : click_) if (!c.on) { c.on = true; c.t = 0; c.ph = 0; c.freq = (i % 4 == 0) ? 1500.f : 1000.f; break; }
  }
}

void Engine::stepSequencer() {
  if (!playing_) return;
  const double db = kBlock * (bpm_.load(std::memory_order_relaxed) / 60.0) / sr_;
  const SeqData* d = seq_;
  const double len = d ? d->length : 4.0; const bool loop = d ? d->loop : true;
  const double a = beat_, b = a + db;
  if (loop) {
    if (b >= len) {
      fireRange(d, a, len); clicks(a, len, len, true);
      double nb = b - len; if (nb >= len) nb = std::fmod(nb, len);
      fireRange(d, 0, nb); clicks(0, nb, len, true);
      beat_ = nb;
    } else { fireRange(d, a, b); clicks(a, b, len, true); beat_ = b; }
  } else {
    fireRange(d, a, b); clicks(a, b, len, false); beat_ = b;
    if (beat_ >= len + .25) { playing_ = false; releaseAll(30.f); vibCount_ = 0; playOut_.store(false); }
  }
  beatOut_.store(beat_, std::memory_order_relaxed);
}

// ---- amp parameters -------------------------------------------------------------------------------
void Engine::updateAmp(bool force) {
  preG_.t = 1.f + std::pow(p_[P_gain] / 100.f, 1.6f) * 80.f;
  const bool boost = p_[P_boost] > .5f;
  hpF_.t = (60.f + p_[P_tight] * 3.f) * (boost ? 1.f : .45f);
  bstG_.t = boost ? 9.f : 0.f;
  bassG_.t = p_[P_bass]; midG_.t = p_[P_mid]; trebG_.t = p_[P_treb]; presG_.t = p_[P_pres];
  master_.t = std::pow(p_[P_master] / 100.f, 2.f) * 1.5f;
  const bool cab = p_[P_cab] > .5f;
  cabG_.t = cab ? 2.5f : 0.f; dryG_.t = cab ? 0.f : .5f;
  revG_.t = p_[P_room] / 100.f * .8f;
  const bool br = p_[P_bridge] > .5f;
  puF_.t = br ? 3200.f : 1900.f; puG_.t = br ? 5.f : 3.f;
  wahF_.t = 350.f * std::pow(6.f, p_[P_wah] / 100.f); wahG_.t = p_[P_wahOn] > .5f ? 15.f : 0.f;
  dlyT_.t = p_[P_dtime] / 1000.f; dlyG_.t = p_[P_dly] / 100.f * .7f;
  chorG_.t = p_[P_chor] / 100.f * .9f;
  midF_.t = p_[P_mfreq]; depG_.t = p_[P_depth] / 100.f * 8.f;
  sag_.set(-20, 18, 1.f + p_[P_sag] / 100.f * 7.f, .004f, .18f);
  const int ct = (int)clampf(p_[P_cabT], 0, 4);
  if (ct != cabCur_) { cabPrev_ = cabCur_; cabCur_ = ct; cabFade_ = 0.f; cabs_[ct].reset(); }
  if (force) {
    for (Sm* s : {&preG_, &hpF_, &bstG_, &bassG_, &midG_, &trebG_, &presG_, &master_, &cabG_, &dryG_, &revG_, &puF_, &puG_, &wahF_, &wahG_, &dlyT_, &dlyG_, &chorG_, &midF_, &depG_}) s->v = s->t;
    pu_.tune(puF_.v, puG_.v); wah_.tune(wahF_.v, wahG_.v);
    hp_.tune(hpF_.v, 0); bst_.tune(720, bstG_.v); bass_.tune(100, bassG_.v); mid_.tune(midF_.v, midG_.v);
    treb_.tune(3200, trebG_.v); pres_.tune(5000, presG_.v); dp_.tune(95, depG_.v);
  }
}

// ---- main render -----------------------------------------------------------------------------------
void Engine::renderBlock(float* outL, float* outR) {
  for (int i = 0; i < P_COUNT; ++i) p_[i] = params_[i].load(std::memory_order_relaxed);
  runCommands();
  stepSequencer();
  updateAmp(false);

  // smoothing + filter retune (only for parameters still moving)
  auto mv = [](const Sm& s) { return s.v != s.t; };
  const bool mPu = mv(puF_) || mv(puG_), mWah = mv(wahF_) || mv(wahG_), mHp = mv(hpF_), mBst = mv(bstG_),
             mBass = mv(bassG_), mMid = mv(midF_) || mv(midG_), mTreb = mv(trebG_), mPres = mv(presG_), mDp = mv(depG_);
  for (Sm* s : {&preG_, &hpF_, &bstG_, &bassG_, &midG_, &trebG_, &presG_, &master_, &cabG_, &dryG_, &revG_, &puF_, &puG_, &wahF_, &wahG_, &dlyT_, &dlyG_, &chorG_, &midF_, &depG_}) smooth(*s);
  if (mPu) pu_.tune(puF_.v, puG_.v);
  if (mWah) wah_.tune(wahF_.v, wahG_.v);
  if (mHp) hp_.tune(hpF_.v, 0);
  if (mBst) bst_.tune(720, bstG_.v);
  if (mBass) bass_.tune(100, bassG_.v);
  if (mMid) mid_.tune(midF_.v, midG_.v);
  if (mTreb) treb_.tune(3200, trebG_.v);
  if (mPres) pres_.tune(5000, presG_.v);
  if (mDp) dp_.tune(95, depG_.v);

  // live tremolo picking
  for (int s = 0; s < kStrings; ++s) {
    Live& l = live_[s];
    if (l.held && l.trem && clock_ >= l.next) {
      const float v = l.vel * (l.alt ? .8f : 1.f);
      const bool alt = !l.alt; const int fr = l.fret, fl = l.flags, ow = l.owner;
      startNote(s, fr, v, fl, ow, true);
      live_[s].alt = alt;
    }
  }

  // strings
  std::fill(mono_, mono_ + kBlock, 0.f);
  bendC_ += (p_[P_bend] - bendC_) * .06f;
  const float bm = std::pow(2.f, bendC_ / 12.f);
  const bool vibOn = p_[P_vib] > .5f || vibCount_ > 0;
  for (int i = 0; i < kVoices; ++i) if (voices_[i].on) voices_[i].render(kBlock, sr_, p_[P_vrate], p_[P_vdep], p_[P_stiff], vibOn, bm, mono_);
  const float thr = std::pow(p_[P_gate] / 100.f, 2.f) * .05f;
  for (int i = 0; i < kBlock; ++i) {
    const float x = mono_[i];
    gateEnv_ = std::max(std::fabs(x), gateEnv_ * .9997f);
    const float o = gateEnv_ > thr ? 1.f : 0.f;
    gateG_ += (o - gateG_) * (o > 0 ? .01f : .0015f);
    mono_[i] = pu_.process(wah_.process(x * gateG_));
  }

  // 4x oversampled amp
  os_.up(mono_, kBlock, up_.data());
  static const float b1 = std::tanh(.18f), b2 = std::tanh(.1f), b3 = std::tanh(.05f);
  const float pre = preG_.v;
  for (int i = 0; i < kBlock * 4; ++i) {
    float x = hp_.process(up_[i]);
    x = bst_.process(x) * pre;
    x = fastTanh(clampf(x, -1.f, 1.f) * 1.0f + .18f) - b1;
    x = hp2_.process(lp1_.process(x)) * 4.f;
    x = fastTanh(clampf(x, -1.f, 1.f) * 1.2f + .1f) - b2;
    x = hp3_.process(lp2_.process(x));
    x = sag_.process(x);
    x = treb_.process(mid_.process(bass_.process(x))) * 1.6f;
    x = fastTanh(clampf(x, -1.f, 1.f) * .9f + .05f) - b3;
    up_[i] = dp_.process(pres_.process(x));
  }
  os_.down(up_.data(), kBlock, dn_.data());

  // cabinet / dry, reverb, delay, chorus, master
  const float alphaLfo = (float)(kTwoPi / sr_);
  const double fadeStep = 1.0 / (sr_ * .04);
  for (int i = 0; i < kBlock; ++i) {
    const float y = dn_[i];
    float cl = 0, cr = 0;
    if (cabG_.v > 0.f) {
      float l, r;
      cabs_[cabCur_].process(y, l, r);
      cl = l * cabScale_[cabCur_]; cr = r * cabScale_[cabCur_];
      if (cabPrev_ >= 0) {
        float pl, pr; cabs_[cabPrev_].process(y, pl, pr);
        const float f = cabFade_;
        cl = cl * f + pl * cabScale_[cabPrev_] * (1.f - f); cr = cr * f + pr * cabScale_[cabPrev_] * (1.f - f);
        cabFade_ += (float)fadeStep; if (cabFade_ >= 1.f) { cabFade_ = 1.f; cabPrev_ = -1; }
      }
    }
    const float mixL = cl * cabG_.v + y * dryG_.v, mixR = cr * cabG_.v + y * dryG_.v;
    const float m = .5f * (mixL + mixR);
    float rl, rr; rev_.process(m, rl, rr);
    float oL = mixL + rl * revG_.v, oR = mixR + rr * revG_.v;
    // ping-pong delay
    if (dlyG_.v > 1e-4f || dlyG_.t > 0.f) {
      const float d = std::max(2.f, dlyT_.v * (float)sr_);
      const float dl = dL_.read(d), dr = dR_.read(d);
      dL_.write(m + dr);
      dR_.write(dHp_.process(dLp_.process(dl)) * .4f);
      oL += dlyG_.v * (dl * .951f + dr * .309f); oR += dlyG_.v * (dl * .309f + dr * .951f);
    }
    // chorus
    if (chorG_.v > 1e-4f || chorG_.t > 0.f) {
      static const float gl[2] = {.988f, .156f}, gr[2] = {.156f, .988f};
      for (int k = 0; k < 2; ++k) {
        ch_[k].write(m);
        const float lfo = std::sin((float)lfoPh_[k]);
        const float v = ch_[k].read(((.017f + .007f * k) + .0035f * lfo) * (float)sr_);
        oL += chorG_.v * v * gl[k]; oR += chorG_.v * v * gr[k];
        lfoPh_[k] += alphaLfo * (.7 + .35 * k); if (lfoPh_[k] > kTwoPi) lfoPh_[k] -= kTwoPi;
      }
    }
    oL *= master_.v; oR *= master_.v;
    const float g = comp_.gainFor(std::max(std::fabs(oL), std::fabs(oR)));
    oL *= g; oR *= g;
    outL[i] = oL; outR[i] = oR;
  }

  // metronome (post-compressor, like the original)
  for (auto& c : click_) {
    if (!c.on) continue;
    for (int i = 0; i < kBlock; ++i) {
      const float env = .12f * std::pow(.001f / .12f, c.t / .05f);
      const float s = std::sin(c.ph) * env;
      outL[i] += s; outR[i] += s;
      c.ph += (float)(kTwoPi * c.freq / sr_); c.t += (float)(1.0 / sr_);
    }
    if (c.t > .06f) c.on = false;
  }

  // soft limiter + NaN guard + peak meter
  float pk = 0;
  for (int i = 0; i < kBlock; ++i) {
    for (float* p : {&outL[i], &outR[i]}) {
      float x = *p;
      if (!(std::fabs(x) < 16.f)) x = 0.f;
      const float ax = std::fabs(x);
      if (ax > .9f) x = (x < 0 ? -1.f : 1.f) * (.9f + .1f * fastTanh((ax - .9f) * 10.f));
      *p = x; pk = std::max(pk, std::fabs(x));
    }
  }
  float old = peak_.load(std::memory_order_relaxed);
  if (pk > old) peak_.store(pk, std::memory_order_relaxed);
  clock_ += kBlock;
  blocks_.fetch_add(1, std::memory_order_relaxed);
}

void Engine::process(float* out, int frames) {
  if (!ready_) { std::memset(out, 0, sizeof(float) * 2 * frames); return; }
  ScopedNoDenormals nd;
  const auto t0 = std::chrono::steady_clock::now();
  int done = 0;
  while (done < frames) {
    if (stagePos_ >= kBlock) {
      renderBlock(lbuf_, rbuf_);
      for (int i = 0; i < kBlock; ++i) { stage_[2 * i] = lbuf_[i]; stage_[2 * i + 1] = rbuf_[i]; }
      stagePos_ = 0;
    }
    const int n = std::min(frames - done, kBlock - stagePos_);
    std::memcpy(out + 2 * done, stage_ + 2 * stagePos_, sizeof(float) * 2 * n);
    stagePos_ += n; done += n;
  }
  const double dt = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  const float load = (float)(dt / (frames / sr_));
  cpu_.store(cpu_.load(std::memory_order_relaxed) * .9f + load * .1f, std::memory_order_relaxed);
}

}  // namespace mgp
