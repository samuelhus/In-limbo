import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '@/lib/api';

// Admin-beheer van kiosk-mededelingen (PRD_kiosk_modus.md §6.6) — mirror van
// de stijl van AdminMeldingen.jsx/AdminNieuws.jsx: eigen fetch, editing-state
// null | 'new' | bericht-object, window.confirm voor destructieve acties,
// data-testid op elk interactief element. Geen i18n hier — net als de andere
// admin-tabbladen is dit Dutch-only beheer-UI (de kiosk-facing kant, Kiosk.jsx
// e.a., volgt wel de normale nl/fr-i18n-opzet).
const TYPE_LABELS = {
  hulp: 'Oproep voor hulp',
  evenement: 'Evenement',
  mededeling: 'Algemene mededeling',
};

const EMPTY = { type: 'mededeling', text: '', active: true };

export default function AdminKiosk() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | bericht-object
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/admin/kiosk/messages')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, []);

  const startNew = () => { setForm(EMPTY); setEditing('new'); setError(''); };
  const startEdit = (m) => { setForm({ type: m.type, text: m.text, active: m.active }); setEditing(m); setError(''); };
  const cancel = () => { setEditing(null); setForm(EMPTY); setError(''); };

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (editing === 'new') {
        await api.post('/admin/kiosk/messages', form);
      } else {
        await api.patch(`/admin/kiosk/messages/${editing.id}`, form);
      }
      cancel();
      load();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (m) => {
    setBusy(true);
    try {
      await api.patch(`/admin/kiosk/messages/${m.id}`, { active: !m.active });
      load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Dit kiosk-bericht definitief verwijderen?')) return;
    setBusy(true);
    try {
      await api.delete(`/admin/kiosk/messages/${id}`);
      load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (items === null && !error) {
    return <p className="text-muted-foreground" data-testid="admin-kiosk-loading">Laden…</p>;
  }

  return (
    <div data-testid="admin-kiosk">
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Berichten die bovenaan het kiosk-startmenu verschijnen (banner), enkel wanneer ze aan staan. Niet te
        verwarren met de tab "Meldingen" — dit stuurt een boodschap náár kioskbezoekers, geen signaal naar het team.
      </p>

      {error && <p className="text-destructive mb-4" data-testid="admin-kiosk-error">{error}</p>}

      {editing === null && (
        <button onClick={startNew} className="btn-primary mb-6" data-testid="admin-kiosk-new-btn">
          Nieuw bericht
        </button>
      )}

      {editing !== null && (
        <div className="border border-border bg-surface p-6 mb-8" style={{ borderRadius: 2 }} data-testid="admin-kiosk-form">
          <div className="space-y-4">
            <div>
              <label className="label-overline" htmlFor="admin-kiosk-type-select">Type</label>
              <select
                id="admin-kiosk-type-select"
                className="input-flat"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                data-testid="admin-kiosk-type-select"
              >
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-overline" htmlFor="admin-kiosk-text-input">Tekst (max 300 tekens)</label>
              <textarea
                id="admin-kiosk-text-input"
                className="input-flat"
                rows={3}
                maxLength={300}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                data-testid="admin-kiosk-text-input"
              />
              <p className="text-xs text-muted-foreground mt-1">{form.text.length}/300</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                data-testid="admin-kiosk-active-checkbox"
              />
              Actief (zichtbaar op de kiosk)
            </label>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              onClick={save}
              disabled={busy || !form.text.trim()}
              className="btn-primary"
              data-testid="admin-kiosk-save-btn"
            >
              Opslaan
            </button>
            <button onClick={cancel} className="btn-ghost" data-testid="admin-kiosk-cancel-btn">
              Annuleren
            </button>
          </div>
        </div>
      )}

      {items && items.length === 0 && (
        <p className="text-muted-foreground" data-testid="admin-kiosk-empty">Nog geen kiosk-berichten.</p>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((m) => (
            <li key={m.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start" data-testid={`admin-kiosk-row-${m.id}`}>
              <div className="md:col-span-8">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="inline-block px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase bg-muted text-foreground">
                    {TYPE_LABELS[m.type] || m.type}
                  </span>
                  {m.active ? (
                    <span className="text-xs text-green-700 font-medium">● Actief</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">○ Uit</span>
                  )}
                </div>
                <p className="text-sm text-foreground/90">{m.text}</p>
              </div>
              <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
                <button
                  onClick={() => toggleActive(m)}
                  disabled={busy}
                  className="btn-secondary !py-2 text-xs"
                  data-testid={`admin-kiosk-toggle-${m.id}`}
                >
                  {m.active ? 'Uitschakelen' : 'Inschakelen'}
                </button>
                <button
                  onClick={() => startEdit(m)}
                  className="btn-ghost !py-2 text-xs"
                  data-testid={`admin-kiosk-edit-${m.id}`}
                >
                  Bewerken
                </button>
                <button
                  onClick={() => remove(m.id)}
                  disabled={busy}
                  className="text-xs text-destructive hover:underline disabled:opacity-50"
                  data-testid={`admin-kiosk-delete-${m.id}`}
                >
                  Verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
