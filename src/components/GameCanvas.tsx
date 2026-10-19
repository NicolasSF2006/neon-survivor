import { useEffect, useRef } from 'react';
import { GameEngine } from '../game/GameEngine';
import type { Controls, Snapshot, Stick, Vector } from '../game/types';
import { AudioManager } from '../audio/AudioManager';
import type { AudioPreferences } from '../audio/preferences';

export type GameHandle = {
  start: () => void;
  pause: () => void;
  mute: () => void;
  audio: AudioManager;
  setControls: (controls: Partial<Controls>) => void;
  setStick: (stick: Stick, value: Vector) => void;
};

export function GameCanvas({ onSnapshot, register, onAudioPreferences }: { onSnapshot: (data: Snapshot) => void; register: (handle: GameHandle | null) => void; onAudioPreferences: (preferences: AudioPreferences) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(onSnapshot);
  const registerRef = useRef(register);
  const preferencesRef = useRef(onAudioPreferences);
  useEffect(() => { snapshotRef.current = onSnapshot; registerRef.current = register; preferencesRef.current = onAudioPreferences; });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let audio: AudioManager | undefined;
    const engine = new GameEngine(data => snapshotRef.current(data), event => audio?.handle(event));
    audio = new AudioManager({ onPreferences: preferences => { engine.setMuted(preferences.muted); preferencesRef.current(preferences); } });
    const manager = audio;
    let disposed = false;
    void engine.mount(element).then(() => {
      if (!disposed) registerRef.current({ start: () => engine.start(), pause: () => engine.togglePause(), mute: () => engine.toggleMute(), audio: manager, setControls: value => engine.setControls(value), setStick: (stick, value) => engine.setStick(stick, value) });
    }).catch(error => {
      if (disposed) return;
      console.error('Falha ao inicializar PixiJS:', error);
      engine.destroy();
      manager.destroy();
      const message = document.createElement('p');
      message.className = 'canvas-error';
      message.setAttribute('role', 'alert');
      message.textContent = 'Não foi possível inicializar o jogo. Tente atualizar a página ou habilitar aceleração gráfica.';
      element.replaceChildren(message);
    });
    return () => { disposed = true; registerRef.current(null); engine.destroy(); manager.destroy(); };
  }, []);
  return <div className="canvas-host" ref={host} />;
}
