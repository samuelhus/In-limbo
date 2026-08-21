import { useEffect } from 'react';
import confetti from 'canvas-confetti';

// PRD_Schat_of_Schroot.md §4.1: confetti-animatie bij het afronden van een
// evaluatie. `trigger` is een teller (geen boolean) zodat elke opeenvolgende
// afgeronde evaluatie opnieuw een burst geeft, ook als er tussendoor geen
// andere state-wijziging was.
export default function Confetti({ trigger }) {
  useEffect(() => {
    if (!trigger) return;
    confetti({
      particleCount: 90,
      spread: 70,
      startVelocity: 35,
      origin: { y: 0.6 },
      colors: ['#ADEBB3', '#4A5D4E', '#1A1A1A', '#F4F4F0'],
    });
  }, [trigger]);

  return null;
}
