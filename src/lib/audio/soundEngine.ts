/**
 * Obsidian Code Audio Synthesizer Engine
 * Pure Web Audio API tone synthesis with zero external assets.
 * Respects user mute preferences, lazy gesture initialization,
 * and produces subtle, non-intrusive sound cues.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('obsidian_audio_muted');
      this.isMuted = saved === 'true';
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('obsidian_audio_muted', String(muted));
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, gainVal: number = 0.08, startTimeOffset: number = 0) {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);

      gain.gain.setValueAtTime(0, ctx.currentTime + startTimeOffset);
      gain.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + startTimeOffset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTimeOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startTimeOffset);
      osc.stop(ctx.currentTime + startTimeOffset + duration);
    } catch {
      // Audio playback fails gracefully if blocked by autoplay policy
    }
  }

  // --- Sound Presets ---

  /** Checkpoint saved: pleasant soft double chime */
  public checkpointSaved() {
    this.playTone(587.33, 'sine', 0.12, 0.06, 0);     // D5
    this.playTone(880.00, 'sine', 0.20, 0.08, 0.09);  // A5
  }

  /** Code execution succeeded: bright ascending chord */
  public executionSuccess() {
    this.playTone(523.25, 'triangle', 0.10, 0.06, 0);    // C5
    this.playTone(659.25, 'triangle', 0.10, 0.06, 0.08); // E5
    this.playTone(783.99, 'triangle', 0.18, 0.07, 0.16); // G5
  }

  /** Code execution failed: soft low downward step */
  public executionFailed() {
    this.playTone(349.23, 'sine', 0.14, 0.08, 0);    // F4
    this.playTone(261.63, 'sine', 0.22, 0.09, 0.10); // C4
  }

  /** Network disconnected: warning blip */
  public networkDisconnected() {
    this.playTone(440, 'sawtooth', 0.08, 0.04, 0);
    this.playTone(370, 'sawtooth', 0.14, 0.04, 0.07);
  }

  /** Network reconnected: rising bell */
  public networkReconnected() {
    this.playTone(440, 'sine', 0.10, 0.06, 0);
    this.playTone(659.25, 'sine', 0.18, 0.07, 0.08);
  }

  /** Role changed: short harmonic chime */
  public roleChanged() {
    this.playTone(523.25, 'sine', 0.12, 0.06, 0);
    this.playTone(698.46, 'sine', 0.18, 0.06, 0.10);
  }

  /** Follow mode activated or deactivated: gentle blip */
  public followMode(active: boolean) {
    if (active) {
      this.playTone(659.25, 'sine', 0.08, 0.05, 0);
      this.playTone(880.00, 'sine', 0.12, 0.06, 0.06);
    } else {
      this.playTone(783.99, 'sine', 0.08, 0.04, 0);
      this.playTone(587.33, 'sine', 0.10, 0.04, 0.06);
    }
  }
}

export const sound = new SoundEngine();
