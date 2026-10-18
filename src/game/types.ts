export type Phase = 'ready' | 'playing' | 'paused' | 'gameover';
export type Snapshot = {
  phase: Phase;
  score: number;
  lives: number;
  wave: number;
  elapsed: number;
  best: number;
  mute: boolean;
};
export type Controls = { left: boolean; right: boolean; up: boolean; down: boolean; firing: boolean };
export type Vector = { x: number; y: number };
export type Stick = 'move' | 'aim';
export const WIDTH = 900;
export const HEIGHT = 560;
export const MAX_LIVES = 3;
export const STORAGE_KEY = 'neon-survivor-best-v1';
