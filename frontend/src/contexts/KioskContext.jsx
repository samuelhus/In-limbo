import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// Kiosk-modus (zie prd/PRD_kiosk_modus.md) — een puur client-side, per-browser
// vlag (localStorage, niet server-side/per-account) die de kiosk-chrome
// (terug-knop, idle-overlay) aan/uit zet bovenop de bestaande, al-publieke
// pagina's. Zie App.js voor waarom deze provider binnen <AuthProvider> hangt:
// de reset-routine hergebruikt useAuth().logout().
const KioskContext = createContext(null);

const STORAGE_KEY = 'il_kiosk_mode';

// PRD §6.3: bij 280s (4 min 40 sec) inactiviteit verschijnt een aftelklok-
// overlay van 20 naar 0 — bereikt die 0 (dus 300s/5 min totaal), volgt de
// reset-routine (§6.4). Eén gedeelde "laatste activiteit"-tijdstip drijft
// zowel de overlay-zichtbaarheid als de getoonde resterende seconden, zodat
// er geen apart afgeleid klokje uit sync kan lopen.
const IDLE_WARNING_MS = 280_000;
const IDLE_RESET_MS = 300_000;
const TICK_MS = 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

export function KioskProvider({ children }) {
  const [kioskActive, setKioskActive] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // null = overlay verborgen, anders resterende seconden (20..0)
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const resettingRef = useRef(false);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleSecondsRemaining(null);
  }, []);

  const activateKiosk = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // localStorage kan geblokkeerd zijn (bv. privémodus) — kiosk-modus werkt
      // dan gewoon niet persistent tussen laadbeurten, geen harde fout nodig.
    }
    setKioskActive(true);
  }, []);

  const deactivateKiosk = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // zie hierboven
    }
    setKioskActive(false);
    setIdleSecondsRemaining(null);
    navigate('/');
  }, [navigate]);

  // Reset-routine (PRD §6.4) — gedeeld tussen de handmatige "terug naar
  // start"-knop en de automatische idle-reset. Beide logout-calls zijn
  // best-effort: een netwerkfout mag de terugkeer naar het startmenu niet
  // blokkeren. resettingRef voorkomt dat een trage aanroep tweemaal
  // tegelijk start (bv. idle-tick die opnieuw afgaat terwijl de vorige
  // reset nog aan de gang is).
  const resetToStart = useCallback(async () => {
    if (resettingRef.current) return;
    resettingRef.current = true;
    try {
      await logout();
    } catch {
      /* best-effort, zie hierboven */
    }
    try {
      await api.post('/game/logout');
    } catch {
      /* best-effort, zie hierboven */
    }
    setIdleSecondsRemaining(null);
    navigate('/kiosk');
    resettingRef.current = false;
  }, [logout, navigate]);

  // Elke routewissel telt ook als activiteit (PRD §6.3, laatste bullet) —
  // een bezoeker die actief doorklikt, wordt niet halverwege weggegooid.
  useEffect(() => {
    if (kioskActive) registerActivity();
  }, [pathname, kioskActive, registerActivity]);

  // Document-niveau activiteit-listeners, enkel actief wanneer kiosk-modus aan staat.
  useEffect(() => {
    if (!kioskActive) return undefined;
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, registerActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, registerActivity));
    };
  }, [kioskActive, registerActivity]);

  // Idle-klok: elke seconde checken, enkel wanneer kiosk-modus aan staat.
  useEffect(() => {
    if (!kioskActive) return undefined;
    const tick = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_RESET_MS) {
        resetToStart();
      } else if (elapsed >= IDLE_WARNING_MS) {
        setIdleSecondsRemaining(Math.max(0, Math.ceil((IDLE_RESET_MS - elapsed) / 1000)));
      } else {
        setIdleSecondsRemaining(null);
      }
    }, TICK_MS);
    return () => clearInterval(tick);
  }, [kioskActive, resetToStart]);

  return (
    <KioskContext.Provider
      value={{
        kioskActive,
        activateKiosk,
        deactivateKiosk,
        resetToStart,
        idleSecondsRemaining,
        stayActive: registerActivity,
      }}
    >
      {children}
    </KioskContext.Provider>
  );
}

export const useKiosk = () => useContext(KioskContext);
