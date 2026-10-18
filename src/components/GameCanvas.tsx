import { useEffect, useRef } from 'react';
import { GameEngine } from '../game/GameEngine';
import type { Controls, Snapshot, Stick, Vector } from '../game/types';

export type GameHandle = {
  start: () => void;
  pause: () => void;
  mute: () => void;
  setControls: (controls: Partial<Controls>) => void;
  setStick: (stick: Stick, value: Vector) => void;
};

export function GameCanvas({ onSnapshot, register }: { onSnapshot: (data: Snapshot) => void; register: (handle: GameHandle | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(onSnapshot);
  const registerRef = useRef(register);
  useEffect(() => { snapshotRef.current = onSnapshot; registerRef.current = register; });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const engine = new GameEngine(data => snapshotRef.current(data));
    let disposed = false;
    void engine.mount(element).then(() => {
      if (!disposed) registerRef.current({ start: () => engine.start(), pause: () => engine.togglePause(), mute: () => engine.toggleMute(), setControls: value => engine.setControls(value), setStick: (stick, value) => engine.setStick(stick, value) });
    }).catch(error => {
      if (disposed) return;
      console.error('Falha ao inicializar PixiJS:', error);
      engine.destroy();
      const message = document.createElement('p');
      message.className = 'canvas-error';
      message.setAttribute('role', 'alert');
      message.textContent = 'Não foi possível inicializar o jogo. Tente atualizar a página ou habilitar aceleração gráfica.';
      element.replaceChildren(message);
    });
    return () => { disposed = true; registerRef.current(null); engine.destroy(); };
  }, []);
  return <div className="canvas-host" ref={host} />;
}
