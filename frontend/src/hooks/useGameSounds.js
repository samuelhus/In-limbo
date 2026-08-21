import { useCallback, useEffect, useRef, useState } from 'react';

// Schat of Schroot? — geluidseffecten (PRD_Schat_of_Schroot.md §4.1: aan/uit-
// knop naast het info-icoon, standaard aan). Bewust GEEN binaire
// audiobestanden om te beheren/uploaden voor dit ene spelletje: korte tonen
// worden on-the-fly gegenereerd via de Web Audio API (OscillatorNode).
const STORAGE_KEY = 'schat-of-schroot-sound';

function playTone(ctx, { frequency, duration, type = 'sine', gain = 0.08 }) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  const now = ctx.currentTime;
  gainNode.gain.setValueAtTime(gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

export default function useGameSounds() {
  const [enabled, setEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === '1';
    } catch {
      return true;
    }
  });
  const ctxRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // privénavigatie e.d. — voorkeur blijft dan enkel voor deze sessie gelden
    }
  }, [enabled]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctxRef.current = new AudioContextClass();
    }
    if (ctxRef.current.state === 'suspended') {
      // Browsers vereisen een user-gesture vóór de AudioContext mag spelen —
      // deze wordt hier altijd binnen een klik-/swipe-handler aangeroepen,
      // dus resume() lukt.
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const play = useCallback((kind) => {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (kind === 'swipe') {
      playTone(ctx, { frequency: 320, duration: 0.12, type: 'triangle', gain: 0.05 });
    } else if (kind === 'success') {
      playTone(ctx, { frequency: 523.25, duration: 0.14, type: 'sine', gain: 0.08 });
      setTimeout(() => playTone(ctx, { frequency: 659.25, duration: 0.2, type: 'sine', gain: 0.08 }), 90);
    }
  }, [enabled, getCtx]);

  return { enabled, setEnabled, play };
}
