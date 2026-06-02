import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

function StepIndicator({ step, max }) {
  return (
    <div className="flex items-center gap-2 mb-10" data-testid="donnateur-step-indicator">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-px flex-1 transition-all ${
            i + 1 <= step ? 'bg-foreground h-0.5' : 'bg-border'
          }`}
        />
      ))}
      <span className="overline ml-3">{step} / {max}</span>
    </div>
  );
}

export default function DonnateurRegister() {
  const { registerDonnateur } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [terms, setTerms] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const canNext1 = terms;
  const canNext2 = form.username.trim() && form.email.trim() && form.password.length >= 6;

  const submit = async () => {
    setSubmitting(true);
    setError('');
    const res = await registerDonnateur({ ...form, acceptedTerms: true });
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    navigate('/catalogus');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16" data-testid="donnateur-register-page">
      <p className="overline mb-4">Donnateur</p>
      <h1 className="text-4xl font-bold tracking-tight mb-10">
        Doneer materiaal.
      </h1>

      <StepIndicator step={step} max={3} />

      {/* STEP 1: Terms */}
      {step === 1 && (
        <section className="space-y-6" data-testid="donnateur-step-1">
          <h2 className="text-2xl font-semibold">Voorwaarden</h2>
          <div className="border-t border-border pt-6 space-y-3 text-sm text-foreground/80 leading-relaxed">
            <p>
              Als donnateur kun je gratis materiaal aanbieden aan
              socio-culturele organisaties in Brussel via In Limbo. Door je te
              registreren ga je akkoord dat:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Je als individu materiaal aanbiedt in goede trouw.</li>
              <li>Aanbiedingen kosteloos en waarheidsgetrouw worden beschreven.</li>
              <li>Je gebruikersnaam zichtbaar is voor andere bezoekers.</li>
              <li>Jouw aanbiedingen worden aangeduid als <em>'geen In Limbo partner'</em>.</li>
            </ul>
            <div className="mt-4 border-l-2 border-foreground pl-4 py-1 text-sm">
              <p className="font-medium mb-1">⚠️ Wil je materiaal aanvragen of de volledige catalogus zien?</p>
              <p className="text-foreground/75">
                Dan moet je lid worden als organisatie via 'Word lid'. Als
                donnateur heb je geen toegang tot contactgegevens van aanbieders
                en kun je geen aanvragen indienen.
              </p>
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer" data-testid="donnateur-terms-label">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              data-testid="donnateur-terms-checkbox"
              className="mt-1"
            />
            <span className="text-sm">
              Ik aanvaard de voorwaarden en begrijp dat ik als donnateur geen
              aanvragen kan indienen.
            </span>
          </label>
          <div className="flex justify-between">
            <Link to="/" className="btn-ghost" data-testid="donnateur-cancel">← Annuleren</Link>
            <button onClick={next} disabled={!canNext1} className="btn-primary" data-testid="donnateur-step1-next">
              Volgende →
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Account */}
      {step === 2 && (
        <section className="space-y-5" data-testid="donnateur-step-2">
          <h2 className="text-2xl font-semibold">Jouw account</h2>
          <div>
            <label className="label-overline">Gebruikersnaam</label>
            <input
              className="input-flat"
              data-testid="donnateur-username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoFocus
            />
          </div>
          <div>
            <label className="label-overline">E-mailadres</label>
            <input
              type="email"
              className="input-flat"
              data-testid="donnateur-email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label-overline">
              Wachtwoord <span className="text-muted-foreground normal-case">(min. 6 tekens)</span>
            </label>
            <input
              type="password"
              className="input-flat"
              data-testid="donnateur-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="donnateur-step2-back">← Terug</button>
            <button onClick={next} disabled={!canNext2} className="btn-primary" data-testid="donnateur-step2-next">
              Volgende →
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Confirm */}
      {step === 3 && (
        <section className="space-y-6" data-testid="donnateur-step-3">
          <h2 className="text-2xl font-semibold">Bevestiging</h2>
          <dl className="border-t border-border divide-y divide-border">
            <div className="flex items-start gap-6 py-3">
              <dt className="overline w-40 shrink-0 pt-0.5">Gebruikersnaam</dt>
              <dd className="text-foreground/85">{form.username}</dd>
            </div>
            <div className="flex items-start gap-6 py-3">
              <dt className="overline w-40 shrink-0 pt-0.5">E-mail</dt>
              <dd className="text-foreground/85">{form.email}</dd>
            </div>
            <div className="flex items-start gap-6 py-3">
              <dt className="overline w-40 shrink-0 pt-0.5">Type</dt>
              <dd className="text-foreground/85">Donnateur (individuele schenker)</dd>
            </div>
          </dl>

          {error && (
            <p data-testid="donnateur-error" className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="donnateur-step3-back">← Terug</button>
            <button onClick={submit} disabled={submitting} className="btn-primary" data-testid="donnateur-submit">
              {submitting ? 'Aanmaken…' : 'Account aanmaken'}
            </button>
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        Al een account?{' '}
        <Link to="/login" className="industrial-link text-foreground" data-testid="donnateur-to-login">Inloggen</Link>
      </p>
    </div>
  );
}
