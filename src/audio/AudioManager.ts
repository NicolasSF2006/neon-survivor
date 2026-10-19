import type { GameEvent } from '../game/events.ts';
import { MusicEngine } from './MusicEngine.ts';
import { SoundEffects, type Sound } from './SoundEffects.ts';
import { AUDIO_STORAGE_KEY, browserStorage, readPreferences, volume, type AudioPreferences, type PreferenceStorage } from './preferences.ts';

type Options = {
  createContext?: () => AudioContext;
  storage?: PreferenceStorage;
  onPreferences?: (preferences: AudioPreferences) => void;
  onDiagnostic?: (message: string) => void;
};

/** One lazy context, two volume buses, and no dependency from simulation to synthesis. */
export class AudioManager {
  private options: Options;
  private storage?: PreferenceStorage;
  private preferences: AudioPreferences;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private music: MusicEngine | null = null;
  private effects: SoundEffects | null = null;
  private phase: 'ready' | 'playing' | 'paused' | 'gameover' = 'ready';
  private wave = 1;
  private background = false;
  private disposed = false;
  private diagnosed = false;
  private unavailable = false;
  private session = 0;

  constructor(options: Options = {}) {
    this.options = options;
    this.storage = options.storage ?? browserStorage();
    this.preferences = readPreferences(this.storage);
    this.options.onPreferences?.(this.getPreferences());
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onBlur);
      window.addEventListener('focus', this.onFocus);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  getPreferences() { return { ...this.preferences }; }

  private diagnose(message: string) {
    if (this.diagnosed) return;
    this.diagnosed = true;
    if (this.options.onDiagnostic) this.options.onDiagnostic(message);
    else console.info(`[Neon Survivor áudio] ${message}`);
  }

  /** Invoke only from a user action, never from a ticker or initial render. */
  async unlock() {
    if (this.disposed || this.unavailable || this.preferences.muted || this.background) return;
    try {
      if (!this.context) {
        const factory = this.options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
        this.context = factory();
        this.master = this.context.createGain();
        this.musicBus = this.context.createGain(); this.effectsBus = this.context.createGain();
        this.master.gain.value = .65;
        this.musicBus.gain.value = this.preferences.music;
        this.effectsBus.gain.value = this.preferences.effects;
        this.musicBus.connect(this.master); this.effectsBus.connect(this.master); this.master.connect(this.context.destination);
        this.music = new MusicEngine(this.context, this.musicBus);
        this.music.setWave(this.wave);
        this.effects = new SoundEffects(this.context, this.effectsBus);
        this.context.addEventListener('statechange', this.onContextState);
      }
      if (this.context.state === 'closed') {
        this.unavailable = true;
        this.diagnose('O contexto de áudio foi encerrado; o jogo continua sem som.');
        return;
      }
      if (this.context.state !== 'running') await this.context.resume();
      if (!this.disposed && !this.background && this.phase === 'playing' && !this.preferences.muted) this.music?.resume();
    } catch {
      this.diagnose('Áudio indisponível ou bloqueado pelo navegador; o jogo continua normalmente.');
      // A failed creation must not repeatedly allocate new contexts on every shot.
      if (!this.music || !this.effects) {
        this.unavailable = true;
        this.release();
      }
    }
  }

  setMusicVolume(value: number) { this.update({ music: volume(value, this.preferences.music) }); }
  setEffectsVolume(value: number) { this.update({ effects: volume(value, this.preferences.effects) }); }
  setMuted(muted: boolean) {
    this.update({ muted });
    if (muted) { this.music?.pause(); this.effects?.stopAll(); }
    else void this.unlock();
  }
  toggleMute() { this.setMuted(!this.preferences.muted); }

  private update(change: Partial<AudioPreferences>) {
    if (this.disposed) return;
    this.preferences = { ...this.preferences, ...change };
    const now = this.context?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(this.preferences.muted ? 0 : .65, now, .02);
    this.musicBus?.gain.setTargetAtTime(this.preferences.music, now, .02);
    this.effectsBus?.gain.setTargetAtTime(this.preferences.effects, now, .02);
    try { this.storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.preferences)); } catch { /* storage denied */ }
    this.options.onPreferences?.(this.getPreferences());
  }

  interfaceSound() {
    void this.unlock().then(() => { if (this.phase !== 'playing') this.play('ui'); });
  }

  private play(kind: Sound) {
    if (!this.disposed && !this.background && !this.preferences.muted && this.preferences.effects > 0) this.effects?.play(kind);
  }

  handle(event: GameEvent) {
    if (this.disposed) return;
    try {
      if (event.type === 'mute') { this.setMuted(event.muted); return; }
      if (event.type === 'start') {
        const session = ++this.session;
        this.phase = 'playing'; this.wave = 1;
        this.effects?.stopAll(true); this.music?.restart();
        void this.unlock().then(() => {
          if (this.session === session && this.phase === 'playing') { this.play('ui'); this.play('wave'); }
        });
      } else if (event.type === 'pause') {
        if (this.phase !== 'playing') return;
        this.phase = 'paused'; this.music?.pause(); this.effects?.stopAll(); this.play('pause');
      } else if (event.type === 'resume') {
        if (this.phase !== 'paused') return;
        this.phase = 'playing';
        const session = this.session;
        void this.unlock().then(() => { if (session === this.session && this.phase === 'playing') this.play('resume'); });
      } else if (event.type === 'gameover') {
        if (this.phase !== 'playing') return;
        this.session++; this.phase = 'gameover'; this.music?.pause(); this.effects?.stopAll(); this.play('gameover');
      } else if (this.phase === 'playing') {
        if (event.type === 'wave') { this.wave = event.wave; this.music?.setWave(event.wave); this.play('wave'); }
        else this.play(event.type);
      }
    } catch { this.diagnose('Um evento de áudio falhou; a simulação continua normalmente.'); }
  }

  private onContextState = () => {
    if (this.context?.state !== 'running') { this.music?.pause(); this.effects?.stopAll(true); }
    // Resuming the game remains an explicit user action after focus loss.
  };
  private onBlur = () => {
    this.background = true; this.music?.pause(); this.effects?.stopAll(true);
    if (this.context?.state === 'running') void this.context.suspend().catch(() => this.diagnose('O navegador não permitiu suspender o áudio.'));
  };
  private onFocus = () => { this.background = typeof document !== 'undefined' && document.hidden; };
  private onVisibility = () => { if (document.hidden) this.onBlur(); else this.onFocus(); };

  private release() {
    this.music?.destroy(); this.effects?.destroy();
    this.master?.disconnect(); this.musicBus?.disconnect(); this.effectsBus?.disconnect();
    if (this.context) {
      this.context.removeEventListener('statechange', this.onContextState);
      if (this.context.state !== 'closed') void this.context.close().catch(() => this.diagnose('Não foi possível encerrar o contexto de áudio.'));
    }
    this.music = null; this.effects = null;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.session++;
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onBlur); window.removeEventListener('focus', this.onFocus);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.release();
  }
}
