/**
 * Web Audio synthesizer for UI sound effects with no external audio files.
 */

const MUTE_STORAGE_KEY = 'obsidian_audio_muted';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
      } catch {
        this.isMuted = false;
      }
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
      } catch {
        // Ignore storage errors
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    gainVal: number = 0.08,
    startTimeOffset: number = 0
  ): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + startTimeOffset;

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainVal, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch {
      // Fail gracefully if autoplay policy blocks Web Audio
    }
  }

  public checkpointSaved(): void {
    this.playTone(587.33, 'sine', 0.12, 0.06, 0);
    this.playTone(880.0, 'sine', 0.2, 0.08, 0.09);
  }

  public executionSuccess(): void {
    this.playTone(523.25, 'triangle', 0.1, 0.06, 0);
    this.playTone(659.25, 'triangle', 0.1, 0.06, 0.08);
    this.playTone(783.99, 'triangle', 0.18, 0.07, 0.16);
  }

  public executionFailed(): void {
    this.playTone(349.23, 'sine', 0.14, 0.08, 0);
    this.playTone(261.63, 'sine', 0.22, 0.09, 0.1);
  }

  public networkDisconnected(): void {
    this.playTone(440, 'sawtooth', 0.08, 0.04, 0);
    this.playTone(370, 'sawtooth', 0.14, 0.04, 0.07);
  }

  public networkReconnected(): void {
    this.playTone(440, 'sine', 0.1, 0.06, 0);
    this.playTone(659.25, 'sine', 0.18, 0.07, 0.08);
  }

  public roleChanged(): void {
    this.playTone(523.25, 'sine', 0.12, 0.06, 0);
    this.playTone(698.46, 'sine', 0.18, 0.06, 0.1);
  }

  public followMode(active: boolean): void {
    if (active) {
      this.playTone(659.25, 'sine', 0.08, 0.05, 0);
      this.playTone(880.0, 'sine', 0.12, 0.06, 0.06);
    } else {
      this.playTone(783.99, 'sine', 0.08, 0.04, 0);
      this.playTone(587.33, 'sine', 0.1, 0.04, 0.06);
    }
  }
}

export const sound = new SoundEngine();
