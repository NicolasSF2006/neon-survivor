/** Presentation notifications; listeners never participate in the simulation. */
export type GameEvent =
  | { type: 'start' | 'pause' | 'resume' | 'shot' | 'impact' | 'destroy' | 'damage' | 'gameover' }
  | { type: 'wave'; wave: number }
  | { type: 'mute'; muted: boolean };
