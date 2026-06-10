import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

export default function WachtwoordVergeten() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 429 && typeof detail === 'string') {
        setError(detail);
      } else {
        setError('Er liep iets mis. Probeer het opnieuw.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center" data-testid="forgot-success">
        <p className="overline mb-4">E-mail verstuurd</p>
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          Controleer je inbox
        </h1>
        <p className="text-foreground/70 text-sm leading-relaxed mb-8">
          Als dit e-mailadres bekend is, ontvang je binnen enkele minuten een link om je wachtwoord opnieuw in te stellen. De link is 24 uur geldig.
        </p>
        <Link to="/login" className="industrial-link text-sm" data-testid="forgot-back-to-login">
          ← Terug naar inloggen
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-24" data-testid="forgot-page">
      <p className="overline mb-4">Account</p>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Wachtwoord vergeten</h1>
      <p className="text-foreground/70 text-sm mb-10">
        Vul je e-mailadres in. Als het bekend is, sturen we een resetlink.
      </p>

      <div className="space-y-4">
        <input
          type="email"
          className="input-flat w-full"
          placeholder="jouw@email.be"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          data-testid="forgot-email-input"
          autoFocus
        />
        {error && (
          <p className="text-destructive text-sm" data-testid="forgot-error">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading || !email}
          className="btn-primary w-full"
          data-testid="forgot-submit-btn"
        >
          {loading ? 'Versturen…' : 'Resetlink versturen'}
        </button>
        <Link
          to="/login"
          className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Terug naar inloggen
        </Link>
      </div>
    </div>
  );
}
