export const BPM = 112;
export const STEP_SECONDS = 60 / BPM / 4;
export const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] as const;
const ROOTS = [33, 29, 36, 31];
const MELODIES = [[76, 74, 72, 69, 72, 76, 79, 76], [72, 69, 65, 69, 72, 76, 72, 69],
  [67, 72, 76, 74, 72, 67, 64, 67], [71, 74, 79, 77, 74, 71, 69, 67]];
const LEVELS = [
  [.038, .085, .022, .055, 0],
  [.042, .105, .025, .075, .022],
  [.048, .115, .032, .095, .026],
  [.052, .12, .036, .105, .03],
];
type Instrument = 'pad' | 'bass' | 'arp' | 'drums' | 'lead';
type Voice = { source: AudioScheduledSourceNode; gain: GainNode; active: boolean };
export function intensityForWave(wave: number) { return Math.min(3, Math.max(0, Math.floor((wave - 1) / 3))); }
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Original eight-bar Am–F–C–G arrangement. Audio time, never Pixi time, is the clock. */
export class MusicEngine {
  private context: AudioContext;
  private output: GainNode;
  private instruments: Record<Instrument, GainNode>;
  private filters: BiquadFilterNode[] = [];
  private noise: AudioBuffer;
  private voices = new Set<Voice>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  private disposed = false;
  private position = 0;
  private origin = 0;
  private nextStep = 0;
  private requestedIntensity = 0;
  private intensity = 0;
  private lastBar = -1;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.output = context.createGain(); this.output.connect(destination);
    const names: Instrument[] = ['pad', 'bass', 'arp', 'drums', 'lead'];
    this.instruments = Object.fromEntries(names.map((name, i) => {
      const gain = context.createGain(), filter = context.createBiquadFilter();
      gain.gain.value = LEVELS[0][i];
      filter.type = 'lowpass'; filter.frequency.value = [1400, 650, 2400, 6000, 2200][i]; filter.Q.value = .5;
      gain.connect(filter); filter.connect(this.output); this.filters.push(filter);
      return [name, gain];
    })) as Record<Instrument, GainNode>;
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .16), context.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 37;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 0x80000000 - 1;
    }
  }

  setWave(wave: number) { this.requestedIntensity = intensityForWave(wave); }

  private applyIntensity(time: number) {
    this.intensity = this.requestedIntensity;
    Object.values(this.instruments).forEach((gain, i) => {
      gain.gain.cancelScheduledValues(time);
      gain.gain.setTargetAtTime(LEVELS[this.intensity][i], time, .08);
    });
  }

  resume() {
    if (this.disposed || this.playing || this.context.state !== 'running') return;
    this.playing = true;
    const time = this.context.currentTime + .025;
    this.origin = time - this.position;
    this.nextStep = Math.ceil(this.position / STEP_SECONDS - 1e-8);
    this.output.gain.setTargetAtTime(1, this.context.currentTime, .02);
    // Rebuild only the sustained harmony when resuming midway through a chord.
    if (this.nextStep % 32 !== 0) {
      const chord = Math.floor(this.nextStep / 32) % 4;
      const remaining = (32 - this.position / STEP_SECONDS % 32) * STEP_SECONDS;
      CHORDS[chord].forEach(note => this.tone('pad', note, time, remaining, 'triangle', .12));
    }
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    if (!this.playing || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // A delayed tab must never replay a backlog of missed beats.
    if (this.origin + this.nextStep * STEP_SECONDS < now - .25) this.nextStep = Math.ceil((now - this.origin) / STEP_SECONDS);
    let budget = 8;
    while (this.origin + this.nextStep * STEP_SECONDS < now + .12 && budget-- > 0) {
      const time = Math.max(now, this.origin + this.nextStep * STEP_SECONDS);
      const step = this.nextStep++, bar = Math.floor(step / 16), local = step % 16;
      const chord = Math.floor(step / 32) % 4;
      if (bar !== this.lastBar) { this.lastBar = bar; this.applyIntensity(time); }
      if (step % 32 === 0) CHORDS[chord].forEach(note => this.tone('pad', note, time, STEP_SECONDS * 32, 'triangle', .12));
      if (local % 4 === 0 || (this.intensity >= 1 && local === 10)) this.tone('bass', ROOTS[chord], time, STEP_SECONDS * 1.7, 'triangle');
      if (local % 2 === 0) {
        const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
        const octave = Math.floor(bar / 8) % 2 && local === 14 ? 24 : 12;
        this.tone('arp', CHORDS[chord][pattern[local / 2]], time, STEP_SECONDS * .85, 'square', .007, octave);
      }
      if (local === 0 || local === 8 || (this.intensity >= 2 && local === 10)) this.kick(time);
      if (local === 4 || local === 12) this.percussion(time, .1, .5);
      if (this.intensity >= 1 && local % (this.intensity >= 2 ? 2 : 4) === (this.intensity >= 2 ? 0 : 2)) this.percussion(time, .035, .18);
      if (this.intensity >= 1 && local % 4 === 2) {
        const note = MELODIES[chord][Math.floor(step / 4) % 8];
        this.tone('lead', note, time, STEP_SECONDS * 1.45, 'triangle');
      }
      if (this.intensity === 3 && local === 15) this.percussion(time, .045, .22);
    }
  }

  private voice(source: AudioScheduledSourceNode, instrument: Instrument, time: number, duration: number, attack: number, level = 1) {
    if ([...this.voices].filter(voice => voice.active).length >= 32) { source.disconnect(); return; }
    const gain = this.context.createGain();
    source.connect(gain); gain.connect(this.instruments[instrument]);
    const release = Math.min(.16, duration * .35);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + Math.min(attack, duration * .2));
    gain.gain.linearRampToValueAtTime(level * .65, time + duration - release);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    const voice = { source, gain, active: true };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start(time); source.stop(time + duration + .005);
  }

  private tone(instrument: Instrument, note: number, time: number, duration: number, shape: OscillatorType, attack = .008, transpose = 0) {
    const oscillator = this.context.createOscillator();
    oscillator.type = shape; oscillator.frequency.value = frequency(note + transpose);
    this.voice(oscillator, instrument, time, duration, attack);
  }

  private kick(time: number) {
    const oscillator = this.context.createOscillator();
    oscillator.frequency.setValueAtTime(120, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + .13);
    this.voice(oscillator, 'drums', time, .16, .003);
  }

  private percussion(time: number, duration: number, level: number) {
    const source = this.context.createBufferSource(); source.buffer = this.noise;
    this.voice(source, 'drums', time, duration, .002, level);
  }

  private release(voice: Voice) {
    voice.source.onended = null; voice.source.disconnect(); voice.gain.disconnect(); this.voices.delete(voice);
  }

  pause(immediate = false) {
    if (this.playing) this.position = Math.max(0, this.context.currentTime - this.origin);
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.context.currentTime;
    this.output.gain.setTargetAtTime(0, now, .008);
    for (const voice of this.voices) {
      if (!immediate && !voice.active) continue;
      voice.active = false;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, .003);
      voice.source.stop(immediate ? now : now + .015);
      if (immediate) this.release(voice);
    }
  }

  restart() {
    this.pause(true); this.position = 0; this.nextStep = 0; this.lastBar = -1;
    this.requestedIntensity = 0; this.intensity = 0;
    this.applyIntensity(this.context.currentTime);
  }

  destroy() {
    this.disposed = true; this.pause(true);
    Object.values(this.instruments).forEach(node => node.disconnect());
    this.filters.forEach(node => node.disconnect()); this.output.disconnect();
  }
}
