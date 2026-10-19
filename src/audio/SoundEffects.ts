export type Sound = 'shot' | 'impact' | 'destroy' | 'damage' | 'gameover' | 'wave' | 'ui' | 'pause' | 'resume';
const LIMITS: Record<Sound, number> = { shot: 3, impact: 4, destroy: 3, damage: 1, gameover: 1, wave: 1, ui: 2, pause: 1, resume: 1 };
const DURATIONS: Record<Sound, number> = { shot: .1, impact: .12, destroy: .32, damage: .36, gameover: .96, wave: .3, ui: .08, pause: .12, resume: .12 };
type Voice = { kind: Sound; source: AudioBufferSourceNode; gain: GainNode; active: boolean };
const sine = (phase: number) => Math.sin(phase * Math.PI * 2);
const triangle = (phase: number) => 2 / Math.PI * Math.asin(sine(phase));

/** Original, deterministic PCM. Cached once per context; no game RNG or downloads. */
function synthesize(context: BaseAudioContext, kind: Sound) {
  const duration = DURATIONS[kind], buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 91, phase = 0, lowNoise = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate, p = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    lowNoise += .15 * (noise - lowNoise);
    let frequency = 440, sample = 0;
    switch (kind) {
      case 'shot': frequency = 1100 * Math.pow(.23, p); break;
      case 'impact': frequency = 350 * Math.pow(.4, p); break;
      case 'destroy': frequency = 115 * Math.pow(.25, p); break;
      case 'damage': frequency = Math.floor(t / .09) % 2 ? 220 : 330; break;
      case 'gameover': frequency = [659.255, 523.251, 440, 220][Math.min(3, Math.floor(t / .24))]; break;
      case 'wave': frequency = [440, 523.251, 659.255][Math.min(2, Math.floor(t / .1))]; break;
      case 'ui': frequency = 660; break;
      case 'pause': frequency = t < .06 ? 523.251 : 392; break;
      case 'resume': frequency = t < .06 ? 392 : 523.251; break;
    }
    phase += frequency / context.sampleRate;
    sample = triangle(phase);
    if (kind === 'destroy') sample = .55 * sine(phase) + .7 * lowNoise;
    if (kind === 'impact') sample = .3 * sample + .6 * lowNoise;
    // Every note and buffer has a short attack/release, including staccato cues.
    const segment = kind === 'gameover' ? t % .24 / .24 : kind === 'wave' ? t % .1 / .1 : p;
    const envelope = Math.min(1, segment * 24) * Math.pow(Math.max(0, 1 - segment), kind === 'damage' ? 1.5 : 2.2);
    const edge = Math.min(1, t / .003, (duration - t) / .008);
    const level = kind === 'shot' ? .17 : kind === 'destroy' ? .38 : kind === 'damage' ? .25 : .21;
    data[i] = sample * envelope * edge * level;
  }
  return buffer;
}

/** Bounded one-shot voices, with reserved headroom for damage and interface cues. */
export class SoundEffects {
  private context: AudioContext;
  private output: AudioNode;
  private buffers = new Map<Sound, AudioBuffer>();
  private voices = new Set<Voice>();
  private variation = 0;
  private disposed = false;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context; this.output = output;
    for (const kind of Object.keys(LIMITS) as Sound[]) this.buffers.set(kind, synthesize(context, kind));
  }

  play(kind: Sound) {
    if (this.disposed || this.context.state !== 'running') return;
    const active = [...this.voices].filter(voice => voice.active);
    const combat = kind === 'shot' || kind === 'impact' || kind === 'destroy';
    if (active.filter(voice => voice.kind === kind).length >= LIMITS[kind] || active.length >= (combat ? 10 : 16)) return;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = this.buffers.get(kind)!;
    if (combat) source.playbackRate.value = [.98, 1, 1.02][this.variation++ % 3];
    source.connect(gain); gain.connect(this.output);
    const voice = { kind, source, gain, active: true };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start();
  }

  private release(voice: Voice) {
    voice.source.onended = null;
    voice.source.disconnect(); voice.gain.disconnect(); this.voices.delete(voice);
  }

  stopAll(immediate = false) {
    for (const voice of this.voices) {
      if (!immediate && !voice.active) continue;
      voice.active = false;
      const now = this.context.currentTime;
      voice.gain.gain.setTargetAtTime(0, now, .003);
      voice.source.stop(immediate ? now : now + .015);
      if (immediate) this.release(voice);
    }
  }

  destroy() { this.disposed = true; this.stopAll(true); this.buffers.clear(); }
}
