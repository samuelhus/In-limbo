import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, formatApiError } from '@/lib/api';

// Losstaand van AuthContext (zie CLAUDE.md/PRD_Schat_of_Schroot.md §3): het
// spel heeft een volledig eigen account-systeem (game_users, eigen cookie
// il_game_token via backend/game_auth.py), dus een eigen context i.p.v. de
// bestaande AuthContext hergebruiken — enkel gemount binnen Game.jsx/
// AdminGame.jsx, niet naast AuthProvider in App.js.
const GameAuthContext = createContext(null);

export function GameAuthProvider({ children }) {
  // null = aan het checken, false = niet ingelogd, object = ingelogde speler {id, username}
  const [gameUser, setGameUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      // Zelfde patroon als AuthContext.refresh: /game/me stil probren, een
      // 401 bij een anonieme bezoeker is verwacht, geen fout.
      const { data } = await api.get('/game/me', {
        validateStatus: (s) => (s >= 200 && s < 300) || s === 401,
      });
      if (data && typeof data === 'object' && data.id) {
        setGameUser(data);
        return data;
      }
      setGameUser(false);
      return null;
    } catch {
      setGameUser(false);
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const register = async (username, email, consentAccepted) => {
    try {
      const { data } = await api.post('/game/register', { username, email, consentAccepted });
      setGameUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const logout = async () => {
    try {
      await api.post('/game/logout');
    } catch {
      // best-effort — ook bij een netwerkfout lokaal gewoon uitloggen
    }
    setGameUser(false);
  };

  return (
    <GameAuthContext.Provider value={{ gameUser, register, logout, refresh }}>
      {children}
    </GameAuthContext.Provider>
  );
}

export function useGameAuth() {
  const ctx = useContext(GameAuthContext);
  if (!ctx) throw new Error('useGameAuth must be used within GameAuthProvider');
  return ctx;
}
