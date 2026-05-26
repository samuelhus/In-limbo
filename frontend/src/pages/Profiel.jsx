import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, formatApiError } from '@/lib/api';

export default function Profiel() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    phone: user.phone || '',
    password: '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
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
          <label className="label-overline">E-mail</label>
          <input type="email" className="input-flat" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} data-testid="profiel-email" />
        </div>
        <div>
          <label className="label-overline">Telefoon</label>
          <input className="input-flat" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} data-testid="profiel-phone" />
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

      <div className="mt-16 border-t border-border pt-6 text-sm">
        <p className="overline mb-2">Account</p>
        <p className="text-muted-foreground">Rol: {user.role} · Status: {user.status}</p>
      </div>
    </div>
  );
}
