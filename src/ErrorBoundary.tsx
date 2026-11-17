import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

interface Props {
  children: React.ReactNode;
  /** short name shown in the message, e.g. "Piano roll" */
  label?: string;
  /** called by the Reset button (wipe saved data); the boundary re-renders its children afterwards */
  onReset?: () => void | Promise<void>;
  /** compact in-place fallback (for one screen) instead of a full-screen one */
  inline?: boolean;
}
interface State { error: Error | null }

/**
 * Last line of defence: a render error in one component shows a message with Retry / Reset instead of closing the app.
 * (Hard-coded colours on purpose: the theme store itself may be what failed.)
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null};
  static getDerivedStateFromError(error: Error): State { return {error: error ?? new Error('Unknown error')}; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[ErrorBoundary]', this.props.label ?? 'app', error, info?.componentStack); }

  private retry = () => this.setState({error: null});
  private reset = async () => { try { await this.props.onReset?.(); } catch { /* ignore */ } this.setState({error: null}); };

  render() {
    const {error} = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{flex: 1, backgroundColor: '#0A0A0C', padding: 20, justifyContent: 'center'}}>
        <Text style={{color: '#FF5A36', fontWeight: '900', letterSpacing: 2, fontSize: this.props.inline ? 13 : 15}}>
          {(this.props.label ?? 'METAL GUITAR PRO').toUpperCase()} COULD NOT START
        </Text>
        <ScrollView style={{maxHeight: 200, marginVertical: 12}}>
          <Text selectable style={{color: '#A0A0AD', fontSize: 12}}>{String(error.message || error).slice(0, 800)}</Text>
        </ScrollView>
        <View style={{flexDirection: 'row', gap: 10}}>
          <Pressable accessibilityRole="button" onPress={this.retry} style={{backgroundColor: '#FF5A36', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12}}>
            <Text style={{color: '#fff', fontWeight: '800'}}>Try again</Text>
          </Pressable>
          {this.props.onReset ? (
            <Pressable accessibilityRole="button" onPress={this.reset} style={{backgroundColor: '#272730', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12}}>
              <Text style={{color: '#F3F3F6', fontWeight: '800'}}>Reset saved data</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
}
