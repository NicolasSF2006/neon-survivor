import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/audio/AudioManager.ts';
import { SoundEffects } from '../src/audio/SoundEffects.ts';
import { MusicEngine, STEP_SECONDS, intensityForWave } from '../src/audio/MusicEngine.ts';
import { AUDIO_STORAGE_KEY, DEFAULT_AUDIO, readPreferences } from '../src/audio/preferences.ts';
import { Context, memoryStorage } from './helpers/audio.mjs';

function setup(t, options = {}) {
  const context = new Context(), storage = memoryStorage();
  let created = 0;
  const manager = new AudioManager({ storage, createContext: () => { created++; return context; }, ...options });
  t.after(() => manager.destroy());
  return { manager, context, storage, created: () => created };
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test('defaults are 35% music, 60% effects, unmuted, with no context or autoplay on construction', t => {
  const { manager, created } = setup(t);
  assert.deepEqual(manager.getPreferences(), DEFAULT_AUDIO);
  assert.equal(created(), 0);
  const copy = manager.getPreferences(); copy.music = 1;
  assert.equal(manager.getPreferences().music, .35);
});

test('music and effect volumes update independent buses smoothly and never modify each other', async t => {
  const { manager, context } = setup(t);
  await manager.unlock();
  manager.setMusicVolume(.8);
  assert.equal(manager.musicBus.gain.value, .8); assert.equal(manager.effectsBus.gain.value, .6);
  manager.setEffectsVolume(.2);
  assert.equal(manager.musicBus.gain.value, .8); assert.equal(manager.effectsBus.gain.value, .2);
  assert.ok(manager.effectsBus.gain.events.some(event => event[0] === 'target' && event[2] === context.currentTime));
  manager.setMusicVolume(NaN); manager.setEffectsVolume(Infinity);
  assert.deepEqual(manager.getPreferences(), { music: .8, effects: .2, muted: false });
});

test('mute silences the master, stops voices and resumes one transport without resetting position', async t => {
  const { manager, context, created } = setup(t);
  manager.handle({ type: 'start' }); await settled();
  context.advance(.6);
  manager.setMuted(true);
  const position = manager.music.position;
  assert.equal(manager.master.gain.value, 0); assert.equal(manager.music.playing, false);
  assert.ok([...manager.effects.voices].every(voice => !voice.active));
  context.advance(3);
  manager.setMuted(false); await settled();
  assert.equal(manager.master.gain.value, .65); assert.equal(manager.music.playing, true);
  assert.equal(manager.music.position, position); assert.equal(created(), 1);
});

test('preferences persist independently of the record and recover after remount', t => {
  const { manager, storage } = setup(t);
  storage.setItem('neon-survivor-best-v1', '1500');
  manager.setMusicVolume(.17); manager.setEffectsVolume(.83); manager.setMuted(true);
  const next = new AudioManager({ storage }); t.after(() => next.destroy());
  assert.deepEqual(next.getPreferences(), { music: .17, effects: .83, muted: true });
  assert.equal(storage.getItem('neon-survivor-best-v1'), '1500');
});

test('invalid preference JSON/types use defaults; finite numeric values are clamped', () => {
  const storage = memoryStorage();
  for (const raw of ['{', 'null', '[]', '"text"', '{"music":"1","effects":null,"muted":"true"}']) {
    storage.setItem(AUDIO_STORAGE_KEY, raw); assert.deepEqual(readPreferences(storage), DEFAULT_AUDIO);
  }
  storage.setItem(AUDIO_STORAGE_KEY, '{"music":-2,"effects":500,"muted":true}');
  assert.deepEqual(readPreferences(storage), { music: 0, effects: 1, muted: true });
});

test('denied storage and unavailable Web Audio never prevent preferences or game events', async t => {
  const diagnostics = [], storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const { manager } = setup(t, { storage, createContext() { throw Error('not supported'); }, onDiagnostic: message => diagnostics.push(message) });
  assert.deepEqual(manager.getPreferences(), DEFAULT_AUDIO);
  manager.setMusicVolume(.4); manager.handle({ type: 'start' }); await settled();
  for (let i = 0; i < 30; i++) manager.handle({ type: 'shot' });
  await manager.unlock();
  assert.equal(manager.phase, 'playing'); assert.equal(diagnostics.length, 1);
});

test('concurrent unlocks, pause/resume and restart reuse one AudioContext', async t => {
  const { manager, created } = setup(t);
  await Promise.all(Array.from({ length: 20 }, () => manager.unlock()));
  manager.handle({ type: 'start' }); manager.handle({ type: 'pause' }); manager.handle({ type: 'resume' });
  manager.handle({ type: 'gameover' }); manager.handle({ type: 'start' }); await settled();
  assert.equal(created(), 1); assert.equal(manager.music.playing, true);
});

test('blocked resume is diagnosed once and can recover on a later user gesture', async t => {
  const context = new Context(), diagnostics = [];
  const resume = context.resume.bind(context);
  context.resume = async () => { throw Error('NotAllowedError'); };
  const { manager } = setup(t, { createContext: () => context, onDiagnostic: message => diagnostics.push(message) });
  manager.handle({ type: 'start' }); await settled();
  assert.equal(manager.music.playing, false); assert.equal(diagnostics.length, 1);
  context.resume = resume;
  await manager.unlock(); assert.equal(manager.music.playing, true);
});

test('a closed context is not replaced with repeated allocations', async t => {
  const { manager, context, created } = setup(t, { onDiagnostic() {} });
  await manager.unlock(); await context.close();
  await manager.unlock(); await manager.unlock();
  assert.equal(created(), 1); assert.equal(manager.music.timer, null);
});

test('effect polyphony is bounded by category and globally, with priority headroom and cached PCM', () => {
  const context = new Context(); context.state = 'running';
  const effects = new SoundEffects(context, context.destination), buffers = context.buffers.length;
  for (let i = 0; i < 100; i++) for (const kind of ['shot', 'impact', 'destroy']) effects.play(kind);
  const active = [...effects.voices].filter(voice => voice.active);
  assert.equal(active.length, 10);
  assert.equal(active.filter(voice => voice.kind === 'shot').length, 3);
  assert.equal(active.filter(voice => voice.kind === 'impact').length, 4);
  for (let i = 0; i < 100; i++) for (const kind of ['damage', 'wave', 'ui', 'pause', 'resume']) effects.play(kind);
  assert.ok(effects.voices.size <= 16); assert.ok([...effects.voices].some(voice => voice.kind === 'damage'));
  assert.equal(context.buffers.length, buffers);
  context.advance(2); assert.equal(effects.voices.size, 0);
  effects.destroy(); assert.equal(effects.buffers.size, 0);
});

test('every synthesized cue is finite, non-silent, bounded and has click-free buffer edges', () => {
  const context = new Context(), effects = new SoundEffects(context, context.destination);
  assert.equal(effects.buffers.size, 9);
  for (const buffer of effects.buffers.values()) {
    const data = buffer.getChannelData(0);
    assert.ok(data.every(Number.isFinite)); assert.ok(data.some(sample => Math.abs(sample) > .01));
    assert.ok(data.every(sample => Math.abs(sample) < .5));
    assert.equal(data[0], 0); assert.ok(Math.abs(data.at(-1)) < .001);
  }
  effects.destroy();
});

test('wave tiers change at bar boundaries without restarting, with a fixed maximum', () => {
  assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 100].map(intensityForWave), [0, 0, 1, 1, 2, 2, 3, 3]);
  const context = new Context(); context.state = 'running';
  const music = new MusicEngine(context, context.destination);
  music.resume(); const timer = music.timer, origin = music.origin;
  music.setWave(4); context.advance(STEP_SECONDS * 8); music.schedule();
  assert.equal(music.intensity, 0);
  context.advance(STEP_SECONDS * 8); music.schedule(); assert.equal(music.intensity, 1);
  music.setWave(100); context.advance(STEP_SECONDS * 16); music.schedule();
  assert.equal(music.intensity, 3); assert.equal(music.origin, origin); assert.equal(music.timer, timer);
  assert.ok(music.voices.size <= 32); music.destroy();
});

test('pause retains musical position, cancels scheduled voices, and resumes in place without backlog', async t => {
  const { manager, context } = setup(t);
  manager.handle({ type: 'start' }); await settled(); context.advance(.75);
  manager.handle({ type: 'pause' });
  const position = manager.music.position, count = context.nodes.size;
  assert.ok(position > .7); assert.equal(manager.music.timer, null);
  context.advance(12); assert.equal(context.nodes.size, count);
  manager.handle({ type: 'resume' }); await settled();
  assert.equal(manager.music.position, position); assert.equal(manager.music.playing, true);
  assert.ok(Math.abs(context.currentTime + .025 - manager.music.origin - position) < 1e-8);
});

test('Game Over stops combat and music, emits one ending, and rejects subsequent combat/wave events', async t => {
  const { manager } = setup(t);
  manager.handle({ type: 'start' }); await settled(); manager.handle({ type: 'shot' });
  manager.handle({ type: 'gameover' });
  assert.equal(manager.music.playing, false);
  const active = [...manager.effects.voices].filter(voice => voice.active);
  assert.deepEqual(active.map(voice => voice.kind), ['gameover']);
  const count = manager.effects.voices.size;
  for (const type of ['shot', 'impact', 'destroy', 'damage', 'wave']) manager.handle({ type, wave: 10 });
  assert.equal(manager.effects.voices.size, count); assert.equal(manager.wave, 1);
});

test('restart clears old voices and resets progression but preserves user preferences', async t => {
  const { manager, context } = setup(t);
  manager.setMusicVolume(.23); manager.handle({ type: 'start' }); await settled();
  manager.handle({ type: 'wave', wave: 10 }); context.advance(8);
  manager.handle({ type: 'gameover' }); manager.handle({ type: 'start' }); await settled();
  assert.equal(manager.wave, 1); assert.equal(manager.music.position, 0); assert.equal(manager.music.intensity, 0);
  assert.equal(manager.getPreferences().music, .23);
  assert.ok([...manager.effects.voices].every(voice => ['ui', 'wave'].includes(voice.kind)));
});

test('focus loss suspends audio and never queues hidden combat; resuming requires an explicit action', async t => {
  const { manager, context } = setup(t);
  manager.handle({ type: 'start' }); await settled();
  manager.onBlur(); manager.handle({ type: 'pause' }); await settled();
  assert.equal(context.state, 'suspended'); assert.equal(manager.music.timer, null);
  manager.handle({ type: 'shot' }); assert.equal(manager.effects.voices.size, 0);
  manager.background = false;
  assert.equal(context.state, 'suspended');
  manager.handle({ type: 'resume' }); await settled(); assert.equal(context.state, 'running');
});

test('destroy disconnects all nodes, closes the context once and leaves no pending scheduler or voices', async t => {
  const { manager, context, created } = setup(t);
  manager.handle({ type: 'start' }); await settled(); manager.handle({ type: 'shot' });
  const music = manager.music, effects = manager.effects;
  manager.destroy(); manager.destroy();
  assert.equal(context.closeCalls, 1); assert.equal(context.state, 'closed');
  assert.equal(music.timer, null); assert.equal(music.voices.size, 0); assert.equal(effects.voices.size, 0);
  assert.ok([...context.nodes].every(node => node.connections.size === 0));
  await manager.unlock(); manager.handle({ type: 'start' }); assert.equal(created(), 1);
});
