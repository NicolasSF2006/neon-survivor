export type AudioPreferences = { music: number; effects: number; muted: boolean };
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const AUDIO_STORAGE_KEY = 'neon-survivor-audio-v1';
export const DEFAULT_AUDIO: Readonly<AudioPreferences> = { music: .35, effects: .6, muted: false };

export function volume(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function readPreferences(storage?: PreferenceStorage): AudioPreferences {
  try {
    const data = JSON.parse(storage?.getItem(AUDIO_STORAGE_KEY) ?? 'null');
    return { music: volume(data?.music, DEFAULT_AUDIO.music), effects: volume(data?.effects, DEFAULT_AUDIO.effects),
      muted: typeof data?.muted === 'boolean' ? data.muted : DEFAULT_AUDIO.muted };
  } catch { return { ...DEFAULT_AUDIO }; }
}

export function browserStorage(): PreferenceStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
