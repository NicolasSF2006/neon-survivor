import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas, type GameHandle } from './components/GameCanvas';
import { VirtualJoystick } from './components/VirtualJoystick';
import { MAX_LIVES, type Snapshot } from './game/types';
import { AudioSettings } from './components/AudioSettings';
import { DEFAULT_AUDIO, type AudioPreferences } from './audio/preferences';

const initial: Snapshot = { phase: 'ready', score: 0, lives: MAX_LIVES, wave: 1, elapsed: 0, best: 0, mute: false };
const formatScore = (score: number) => score.toLocaleString('pt-BR');

export default function App() {
  const [state, setState] = useState<Snapshot>(initial);
  const [ready, setReady] = useState(false);
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>({ ...DEFAULT_AUDIO });
  const [touchInput, setTouchInput] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const engine = useRef<GameHandle | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const register = useCallback((value: GameHandle | null) => {
    engine.current = value;
    setReady(Boolean(value));
  }, []);
  const onSnapshot = useCallback((snapshot: Snapshot) => { setState(snapshot); }, []);
  const active = state.phase === 'playing';

  useEffect(() => {
    if (!active) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [active, state.phase]);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const onPointer = (event: PointerEvent) => setTouchInput(event.pointerType === 'touch');
    const onKeyboard = (event: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) setTouchInput(false);
    };
    const onMedia = () => setTouchInput(media.matches);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKeyboard);
    media.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKeyboard);
      media.removeEventListener('change', onMedia);
    };
  }, []);

  return <main className={`game${touchInput ? ' input-touch' : ''}`} aria-label="Neon Survivor">
    <GameCanvas onSnapshot={onSnapshot} register={register} onAudioPreferences={setAudioPreferences} />

    {(active || state.phase === 'paused') && <div className="hud" aria-label="Estado da partida">
      <div className="hearts" role="img" aria-label={`${state.lives} de ${MAX_LIVES} vidas`}>
        {Array.from({ length: state.lives }, (_, index) => <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21 3.5 12.7C-2 7.2 5.6-.5 12 6c6.4-6.5 14 1.2 8.5 6.7Z" />
        </svg>)}
      </div>
      <dl className="scoreboard">
        <div className="score"><dt>PONTUAÇÃO</dt><dd>{formatScore(state.score)}</dd></div>
        <div className="score best-score"><dt>RECORDE</dt><dd>{formatScore(state.best)}</dd></div>
      </dl>
      <div className="wave-group"><span className="wave">ONDA <strong>{String(state.wave).padStart(2, '0')}</strong></span>
        <button type="button" className="pause-button" aria-label={active ? 'Pausar partida' : 'Continuar partida'} onClick={() => engine.current?.pause()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{active ? <path d="M8 6v12M16 6v12" /> : <path d="m9 5 9 7-9 7Z" />}</svg>
        </button>
      </div>
    </div>}

    {!active && <div className={`game-overlay overlay-${state.phase}`}>
      <section className="menu" aria-labelledby="menu-title">
        <h1 id="menu-title" ref={heading} tabIndex={-1} className={state.phase === 'ready' ? 'game-title' : ''}>
          {state.phase === 'ready' ? <>NEON<span>SURVIVOR</span></> : state.phase === 'paused' ? 'PAUSA' : 'GAME OVER'}
        </h1>

        {state.phase === 'gameover' && <dl className="results">
          <div><dt>SCORE</dt><dd>{formatScore(state.score)}</dd></div>
        </dl>}

        <button type="button" className="primary-button" disabled={!ready} onClick={() => state.phase === 'paused' ? engine.current?.pause() : engine.current?.start()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z" /></svg>
          {state.phase === 'paused' ? 'Continuar' : state.phase === 'gameover' ? 'Jogar novamente' : ready ? 'JOGAR' : 'Carregando…'}
        </button>

        {state.phase === 'ready' && <>
          <p className="keyboard-hint"><span><kbd>WASD</kbd> / <kbd>↑←↓→</kbd> mover</span><span>Mouse mirar · clique / <kbd>ESPAÇO</kbd> atirar</span><span><kbd>P</kbd> / <kbd>ESC</kbd> pausar</span></p>
          <p className="touch-hint menu-hint">Joystick esquerdo para mover. Joystick direito para mirar e atirar. Toque em Ⅱ para pausar.</p>
        </>}
      </section>
    </div>}

    {(state.phase === 'ready' || state.phase === 'paused') && <AudioSettings key={state.phase} audio={engine.current?.audio} preferences={audioPreferences} />}

    {active && touchInput && <div className="touch-controls" role="group" aria-label="Controles de toque">
      <VirtualJoystick kind="move" label="Mover nave" onChange={value => engine.current?.setStick('move', value)} />
      <VirtualJoystick kind="aim" label="Mirar e atirar" onChange={value => engine.current?.setStick('aim', value)} />
    </div>}
  </main>;
}
