import { useCallback, useEffect, useRef, useState } from "react";

const key = "qareeb-ringtone-enabled";

export function useRingtone(isIncoming: boolean) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(key) !== "off");
  const contextRef = useRef<AudioContext | null>(null);

  const setRingtoneEnabled = useCallback((next: boolean) => {
    localStorage.setItem(key, next ? "on" : "off");
    setEnabled(next);
    if (next) void (contextRef.current ?? new AudioContext()).resume().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled || !isIncoming) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    const ring = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 720;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
    };
    ring();
    const interval = window.setInterval(ring, 1_050);
    return () => window.clearInterval(interval);
  }, [enabled, isIncoming]);

  useEffect(() => () => void contextRef.current?.close(), []);
  return { ringtoneEnabled: enabled, setRingtoneEnabled };
}
