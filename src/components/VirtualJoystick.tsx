import { useEffect, useRef, type PointerEvent } from 'react';
import { JoystickInput } from '../game/JoystickInput';
import { limitedDirection } from '../game/math';
import type { Vector } from '../game/types';

export function VirtualJoystick({ kind, label, onChange }: { kind: 'move' | 'aim'; label: string; onChange: (value: Vector) => void }) {
  const input = useRef<JoystickInput | null>(null);
  if (!input.current) input.current = new JoystickInput();
  const stick = input.current;
  const thumb = useRef<HTMLSpanElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const reset = () => {
      const pointerId = stick.pointerId;
      stick.reset();
      if (thumb.current) thumb.current.style.transform = 'translate(0px, 0px)';
      if (pointerId !== null && base.current?.hasPointerCapture(pointerId)) base.current.releasePointerCapture(pointerId);
      change.current({ x: 0, y: 0 });
    };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', reset);
      window.removeEventListener('resize', reset);
      document.removeEventListener('visibilitychange', visibility);
      reset();
    };
  }, [stick]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(1, (bounds.width - (thumb.current?.offsetWidth ?? 44)) / 2);
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    if (!stick.move(event.pointerId, dx, dy, radius)) return;
    const offset = limitedDirection(dx / radius, dy / radius);
    if (thumb.current) thumb.current.style.transform = `translate(${offset.x * radius}px, ${offset.y * radius}px)`;
    change.current({ x: stick.x, y: stick.y });
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (!stick.release(event.pointerId)) return;
    if (thumb.current) thumb.current.style.transform = 'translate(0px, 0px)';
    change.current({ x: 0, y: 0 });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div className={`virtual-joystick joystick-${kind}`} ref={base} role="group" aria-label={label}
    onPointerDown={event => {
      if (event.button !== 0 || !stick.begin(event.pointerId)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      move(event);
    }}
    onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span className="joystick-thumb" ref={thumb} aria-hidden="true">{kind === 'move' ? '✥' : '◎'}</span>
  </div>;
}
