import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { JoystickInput } from "../lib/gameControls";
import type { MoveAxes } from "../lib/gameControls";

export default function TouchJoystick({ onMove, disabled }: { onMove: (axes: MoveAxes) => void; disabled: boolean }) {
  const stick = useRef(new JoystickInput());
  const [thumb, setThumb] = useState({ x: 0, y: 0, active: false });
  const emit = useCallback(() => {
    onMove({ ...stick.current.axes });
    setThumb({ ...stick.current.offset, active: stick.current.pointerId !== null });
  }, [onMove]);
  const reset = useCallback(() => { stick.current.reset(); emit(); }, [emit]);
  useEffect(() => {
    const controller = stick.current;
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
      controller.reset();
      onMove({ ...controller.axes });
    };
  }, [reset, onMove]);
  useEffect(() => { if (disabled) reset(); }, [disabled, reset]);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (!stick.current.end(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    emit();
  };
  return (
    <div className="joystick-control">
      <button
        type="button"
        className={`joystick-base${thumb.active ? " is-moving" : ""}`}
        aria-label="Movement joystick: drag to walk or steer. Arrow keys also move."
        disabled={disabled}
        onPointerDown={event => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (!stick.current.start(event.pointerId, rect.left + rect.width / 2, rect.top + rect.height / 2, Math.min(rect.width, rect.height) * 0.3)) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          stick.current.move(event.pointerId, event.clientX, event.clientY);
          emit();
        }}
        onPointerMove={event => {
          if (stick.current.move(event.pointerId, event.clientX, event.clientY)) emit();
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onContextMenu={event => event.preventDefault()}
      >
        <span className="joystick-track" aria-hidden="true" />
        <span className="joystick-thumb" aria-hidden="true" style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }} />
      </button>
      <span className="joystick-caption">MOVE</span>
    </div>
  );
}
