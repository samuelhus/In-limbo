import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api, formatApiError } from '@/lib/api';

const EMAIL_PREF_LABELS = [
  { key: 'new_application', label: 'Nieuwe aanvraag op mijn aanbieding' },
  { key: 'selected_as_receiver', label: 'Aangeduid als ontvanger' },
  { key: 'application_withdrawn', label: 'Aanvraag ingetrokken door ontvanger' },
  { key: 'unrehomed', label: 'Aanbieding terug beschikbaar na unrehome' },
];

export default function Profiel() {
  const { user, refresh } = useAuth();
  const isDonateur = user.role === 'donateur';

  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
    phone: user.phone || '',
    password: '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [prefs, setPrefs] = useState(null);
  const [prefMsg, setPrefMsg] = useState('');

  useEffect(() => {
    api.get('/users/me/email-preferences')
      .then(({ data }) => setPrefs(data))
      .catch(() => setPrefs({}));
  }, []);

  const togglePref = async (key) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setPrefMsg('');
    try {
      const { data } = await api.patch('/users/me/email-preferences', { [key]: next[key] });
      setPrefs(data);
      setPrefMsg('Opgeslagen');
      setTimeout(() => setPrefMsg(''), 1500);
    } catch (e) {
      setPrefs(prefs); // revert
      alert(formatApiError(e));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (isDonateur) {
        delete payload.firstName;
        delete payload.lastName;
        delete payload.phone;
      } else {
        delete payload.username;
      }
      await api.patch('/users/me', payload);
      await refresh();
      setMsg('Wijzigingen opgeslagen.');
      setForm((f) => ({ ...f, password: '' }));
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16" data-testid="profiel-page">
      <p className="overline mb-3">Profiel</p>
      <h1 className="text-4xl font-bold tracking-tight mb-10">Jouw gegevens</h1>

      <form onSubmit={save} className="space-y-5">
        {isDonateur ? (
          <div>
            <label className="label-overline">Gebruikersnaam</label>
            <input
              className="input-flat"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              data-testid="profiel-username"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Deze naam is publiek zichtbaar bij je aanbiedingen.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-overline">Voornaam</label>
                <input className="input-flat" value={form.firstName} onChange={(e) => setForm({...form, firstName: e.target.value})} data-testid="profiel-firstname" />
              </div>
              <div>
                <label className="label-overline">Achternaam</label>
                <input className="input-flat" value={form.lastName} onChange={(e) => setForm({...form, lastName: e.target.value})} data-testid="profiel-lastname" />
              </div>
            </div>
            <div>
              <label className="label-overline">Telefoon</label>
              <input className="input-flat" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} data-testid="profiel-phone" />
            </div>
          </>
        )}
        <div>
          <label className="label-overline">E-mail</label>
          <input type="email" className="input-flat" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} data-testid="profiel-email" />
        </div>
        <div>
          <label className="label-overline">Nieuw wachtwoord <span className="text-muted-foreground normal-case">(laat leeg om niet te wijzigen)</span></label>
          <input type="password" className="input-flat" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} data-testid="profiel-password" />
        </div>

        {msg && <p className="text-sm bg-green-50 border border-green-300 text-green-900 px-3 py-2" data-testid="profiel-success">{msg}</p>}
        {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="profiel-error">{err}</p>}

        <button type="submit" disabled={saving} className="btn-primary" data-testid="profiel-submit">
          {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </button>
      </form>

      {!isDonateur && (
        <div className="mt-16 border-t border-border pt-6" data-testid="profiel-organisatie-section">
          <p className="overline mb-2">Organisatie</p>
          <p className="text-sm text-muted-foreground mb-3">
            Beheer de gegevens van je organisatie.
          </p>
          <Link to="/organisatie" className="btn-primary inline-block" data-testid="profiel-organisatie-link">
            Mijn organisatie →
          </Link>
        </div>
      )}

      {/*
      <div className="mt-16 border-t border-border pt-6 text-sm">
        <p className="overline mb-2">Account</p>
        <p className="text-muted-foreground">Rol: {user.role} · Status: {user.status}</p>
      </div>*/}

      <div className="mt-16 border-t border-border pt-6" data-testid="profiel-email-prefs">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <p className="overline mb-2">E-mailvoorkeuren</p>
            <p className="text-sm text-muted-foreground">
              Beheer welke meldingen je per e-mail wil ontvangen. In-app notificaties krijg je sowieso.
            </p>
          </div>
          {prefMsg && (
            <span className="text-xs text-[#34D399] font-medium" data-testid="email-prefs-saved">
              {prefMsg}
            </span>
          )}
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {EMAIL_PREF_LABELS.map((p) => (
            <li key={p.key} className="py-3 flex items-center justify-between gap-4">
              <span className="text-sm">{p.label}</span>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs ? !!prefs[p.key] : true}
                  onChange={() => togglePref(p.key)}
                  disabled={!prefs}
                  data-testid={`email-pref-${p.key}`}
                  className="h-5 w-5 accent-[#34D399] cursor-pointer"
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
