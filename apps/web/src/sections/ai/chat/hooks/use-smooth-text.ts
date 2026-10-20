import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

// A little below two 60 Hz frames also tolerates timestamp rounding, avoiding
// alternating two/three-frame gaps (and visible pacing jitter).
const frameInterval = 32;
const maxLag = 240;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const motionQuery = "(prefers-reduced-motion: reduce)";
const reducedMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => true;
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

// Presentation only: canonical messages and persistence always retain every
// received byte. Pace bursts within a short deadline, about 30 markdown updates
// per second. Never replay history or split a received emoji/grapheme cluster.
export function useSmoothText(target: string, streaming: boolean, immediate: boolean) {
  const reduceMotion = useSyncExternalStore(subscribeMotion, reducedMotion, serverMotion);
  const [visible, setVisible] = useState(streaming && !reduceMotion ? "" : target);
  const state = useRef({ target, visible, streamed: streaming, deadline: 0, tick: 0, credit: 0 });
  const frame = useRef<number | null>(null);
  const bypass =
    immediate || reduceMotion || !state.current.streamed || !target.startsWith(visible);
  const text = bypass ? target : visible;

  useLayoutEffect(() => {
    const current = state.current;
    const now = performance.now();
    if (current.target !== target || !current.deadline) current.deadline = now + maxLag;
    current.target = target;
    current.streamed ||= streaming;

    const flush = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      current.visible = current.target;
      current.credit = 0;
      setVisible(current.visible);
    };
    if (bypass || document.hidden) {
      flush();
      return;
    }
    if (frame.current !== null || current.visible === current.target) return;
    current.tick = now;
    const tick = (time: number) => {
      frame.current = null;
      const elapsed = time - current.tick;
      if (time >= current.deadline || document.hidden) {
        flush();
        return;
      }
      if (elapsed >= frameInterval) {
        const remaining = current.target.length - current.visible.length;
        // Aim at the deadline rather than slowing exponentially toward it;
        // otherwise a large remainder would pop into view on the final frame.
        const timeLeft = Math.max(frameInterval, current.deadline - current.tick);
        current.credit += (Math.max(80, (remaining * 1000) / timeLeft) * elapsed) / 1000;
        current.tick = time;
        const budget = Math.floor(current.credit);
        if (budget > 0) {
          let end = current.visible.length;
          const desired = Math.min(current.target.length, end + budget);
          for (const part of segmenter.segment(current.target.slice(end))) {
            end += part.segment.length;
            if (end >= desired) break;
          }
          current.credit = Math.max(0, current.credit - (end - current.visible.length));
          current.visible = current.target.slice(0, end);
          setVisible(current.visible);
        }
      }
      if (current.visible !== current.target) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [target, streaming, bypass]);

  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );

  return { text, isSmoothing: text !== target };
}
