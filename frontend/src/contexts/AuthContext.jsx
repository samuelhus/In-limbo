import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, formatApiError } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = checking, false = anonymous, object = logged in
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      return data;
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
      await api.post('/auth/register/new-org', payload);
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const registerExistingOrg = async (payload) => {
    try {
      await api.post('/auth/register/existing-org', payload);
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
      value={{ user, setUser, refresh, login, logout, registerNewOrg, registerExistingOrg }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
