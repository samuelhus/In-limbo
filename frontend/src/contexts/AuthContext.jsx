import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, formatApiError } from '@/lib/api';
import i18n from '@/i18n';

const AuthContext = createContext(null);

// Bepaalt de taal onzichtbaar op basis van de huidige paginataal (geen apart
// formulierveld nodig) — gebruikt bij elke registratie om preferredLanguage
// automatisch mee te sturen.
const currentPageLanguage = () => (i18n.language?.startsWith('fr') ? 'fr' : 'nl');

export function AuthProvider({ children }) {
  // null = checking, false = anonymous, object = logged in
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      // Probe /me silently — anonymous visits will 401, which is expected.
      const { data } = await api.get('/auth/me', {
        validateStatus: (s) => (s >= 200 && s < 300) || s === 401,
      });
      if (data && typeof data === 'object' && data.id) {
        setUser(data);
        return data;
      }
      setUser(false);
      return null;
    } catch {
      setUser(false);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const registerNewOrg = async (payload) => {
    try {
      await api.post('/auth/register/new-org', { ...payload, preferredLanguage: currentPageLanguage() });
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const registerExistingOrg = async (payload) => {
    try {
      await api.post('/auth/register/existing-org', { ...payload, preferredLanguage: currentPageLanguage() });
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const registerDonateur = async (payload) => {
    try {
      await api.post('/auth/register/donateur', { ...payload, preferredLanguage: currentPageLanguage() });
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, refresh, login, logout, registerNewOrg, registerExistingOrg, registerDonateur }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
