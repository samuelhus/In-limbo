import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';

export default function WachtwoordReset() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) navigate('/wachtwoord-vergeten');
  }, [token, navigate]);

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError('Wachtwoord moet minstens 6 tekens lang zijn.');
      return;
    }
    if (password !== confirm) {
      setError('Wachtwoorden komen niet overeen.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Ongeldige of verlopen link. Vraag een nieuwe resetlink aan.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center" data-testid="reset-success">
        <p className="overline mb-4">Gelukt</p>
        <h1 className="text-3xl font-bold tracking-tight mb-4">Wachtwoord gewijzigd</h1>
        <p className="text-foreground/70 text-sm">
          Je wordt automatisch doorgestuurd naar de loginpagina…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-24" data-testid="reset-page">
      <p className="overline mb-4">Account</p>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Nieuw wachtwoord instellen</h1>
      <p className="text-foreground/70 text-sm mb-10">
        Kies een nieuw wachtwoord van minstens 6 tekens.
      </p>

      <div className="space-y-4">
        <input
          type="password"
          className="input-flat w-full"
          placeholder="Nieuw wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="reset-password-input"
          autoFocus
        />
        <input
          type="password"
          className="input-flat w-full"
          placeholder="Herhaal wachtwoord"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          data-testid="reset-confirm-input"
        />
        {error && (
          <p className="text-destructive text-sm" data-testid="reset-error">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading || !password || !confirm}
          className="btn-primary w-full"
          data-testid="reset-submit-btn"
        >
          {loading ? 'Opslaan…' : 'Wachtwoord opslaan'}
        </button>
        <Link
          to="/wachtwoord-vergeten"
          className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Nieuwe resetlink aanvragen
        </Link>
      </div>
    </div>
  );
}
