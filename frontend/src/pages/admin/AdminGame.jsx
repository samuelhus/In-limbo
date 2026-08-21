import React, { useEffect, useMemo, useState } from 'react';
import { api, formatApiError } from '@/lib/api';

// Admin-uitbreiding voor Schat of Schroot? (PRD_Schat_of_Schroot.md §6) —
// mirror van de stijl van AdminZoekertjes.jsx: losse sub-view-componenten
// met eigen fetch, <ul className="divide-y ..."> rijen, data-testid op elk
// interactief element, window.confirm/prompt voor destructieve acties
// (zelfde patroon als AdminPanel.jsx).
export default function AdminGame() {
  const [view, setView] = useState('users'); // users | listings | evaluations

  return (
    <div data-testid="admin-game">
      <div className="flex gap-2 mb-8 border-b border-border">
        <TabButton active={view === 'users'} onClick={() => setView('users')} testId="admin-game-tab-users">
          Spelers
        </TabButton>
        <TabButton active={view === 'listings'} onClick={() => setView('listings')} testId="admin-game-tab-listings">
          Aanbiedingen
        </TabButton>
        <TabButton active={view === 'evaluations'} onClick={() => setView('evaluations')} testId="admin-game-tab-evaluations">
          Top evaluaties
        </TabButton>
      </div>

      {view === 'users' && <GameUsers />}
      {view === 'listings' && <GameListings />}
      {view === 'evaluations' && <GameEvaluations />}
    </div>
  );
}

function TabButton({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`px-4 py-3 text-sm border-b-2 transition-colors ${
        active ? 'border-foreground text-foreground font-medium' : 'border-transparent text-foreground/70 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// Herbruikt tussen de Aanbiedingen- en Top evaluaties-tab: beide filteren op
// dezelfde listing-statussen (op vraag van product: "filter instellen op
// beschikbaarheid"), "Alle" = geen filter.
const STATUS_OPTIONS = [
  { value: '', label: 'Alle statussen' },
  { value: 'beschikbaar', label: 'Beschikbaar' },
  { value: 'in_magazijn', label: 'In magazijn' },
  { value: 'herbestemd', label: 'Herbestemd' },
  { value: 'gearchiveerd', label: 'Gearchiveerd' },
];

function StatusFilter({ value, onChange, testId }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
      className="input-flat !w-auto text-sm"
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function GameUsers() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/admin/game/users')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, []);

  const deleteUser = async (id, username) => {
    if (!window.confirm(`Speler "${username}" verwijderen/anonimiseren? Dit kan niet ongedaan gemaakt worden.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/game/users/${id}`);
      load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (items === null && !error) {
    return <p className="text-muted-foreground" data-testid="admin-game-users-loading">Laden…</p>;
  }

  return (
    <div data-testid="admin-game-users">
      {error && <p className="text-destructive mb-4">{error}</p>}
      <p className="text-sm text-muted-foreground mb-4">{items?.length || 0} speler(s)</p>
      {items && items.length === 0 && <p className="text-muted-foreground">Nog geen spelers.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((u) => (
            <li key={u.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-center" data-testid={`admin-game-user-${u.id}`}>
              <div className="md:col-span-5">
                <p className="font-medium">{u.username || <em className="text-muted-foreground">(geanonimiseerd)</em>}</p>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>
              <p className="md:col-span-3 text-sm text-muted-foreground">
                Sinds {u.createdAt ? new Date(u.createdAt).toLocaleDateString('nl-BE') : '—'}
              </p>
              <p className="md:col-span-2 text-sm">
                {u.evaluationCount} evaluatie(s) · {u.totalPoints} pt
              </p>
              <div className="md:col-span-2 md:text-right">
                {!u.anonymized && (
                  <button
                    onClick={() => deleteUser(u.id, u.username)}
                    disabled={busy}
                    data-testid={`admin-game-delete-user-${u.id}`}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    Verwijderen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GameListings() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [openListing, setOpenListing] = useState(null); // { id, title } | null

  const load = () => {
    api.get('/admin/game/listings-stats')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () => (statusFilter ? items?.filter((l) => l.status === statusFilter) : items),
    [items, statusFilter],
  );

  const toggleEnabled = async (id, gameEnabled) => {
    setBusy(true);
    try {
      await api.patch(`/admin/game/listings/${id}/exclude`, { gameEnabled: !gameEnabled });
      load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (items === null && !error) {
    return <p className="text-muted-foreground" data-testid="admin-game-listings-loading">Laden…</p>;
  }

  return (
    <div data-testid="admin-game-listings">
      {error && <p className="text-destructive mb-4">{error}</p>}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {filtered?.length || 0} van {items?.length || 0} aanbieding(en) in of ooit in de spelpool.
        </p>
        <StatusFilter value={statusFilter} onChange={setStatusFilter} testId="admin-game-listings-status-filter" />
      </div>
      {filtered && filtered.length === 0 && <p className="text-muted-foreground">Geen aanbiedingen.</p>}
      {filtered && filtered.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((l) => (
            <li key={l.id} className="py-4" data-testid={`admin-game-listing-${l.id}`}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <button
                  type="button"
                  onClick={() => setOpenListing({ id: l.id, title: l.title })}
                  className="md:col-span-5 text-left hover:underline decoration-dotted"
                  data-testid={`admin-game-listing-open-${l.id}`}
                >
                  <p className="font-medium">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    status: {l.status} · {l.gameEvaluationCount}/20 evaluaties
                  </p>
                </button>
                <div className="md:col-span-4">
                  {l.topEvaluation ? (
                    <p className="text-sm text-foreground/80">
                      "{l.topEvaluation.answer1}" · "{l.topEvaluation.answer2}" · {l.topEvaluation.votes} stem(men)
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nog geen evaluaties.</p>
                  )}
                </div>
                <div className="md:col-span-3 flex flex-wrap gap-2 md:justify-end">
                  <button
                    onClick={() => toggleEnabled(l.id, l.gameEnabled)}
                    disabled={busy}
                    data-testid={`admin-game-toggle-${l.id}`}
                    className="btn-ghost !p-0 text-xs underline"
                  >
                    {l.gameEnabled ? 'Uit spelpool halen' : 'Terug in spelpool'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {openListing && (
        <ListingEvaluationsModal
          listingId={openListing.id}
          listingTitle={openListing.title}
          onClose={() => setOpenListing(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function ListingEvaluationsModal({ listingId, listingTitle, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get(`/admin/game/listings/${listingId}/evaluations`)
      .then(({ data: res }) => setData(res))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, [listingId]);

  const removeEvaluation = async (id) => {
    if (!window.confirm('Deze evaluatie definitief verwijderen? Dit kan niet ongedaan gemaakt worden.')) return;
    setBusy(true);
    try {
      await api.delete(`/admin/game/evaluations/${id}`);
      load();
      onChanged();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 overflow-y-auto z-50"
      onClick={onClose}
      data-testid="admin-game-listing-evaluations-modal"
    >
      <div
        className="bg-background border border-border max-w-2xl w-full mt-12 p-6"
        style={{ borderRadius: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold tracking-tight">Evaluaties — {listingTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="admin-game-listing-evaluations-close"
          >
            Sluiten ✕
          </button>
        </div>

        {error && <p className="text-destructive text-sm mb-4">{error}</p>}
        {data === null && !error && <p className="text-muted-foreground text-sm">Laden…</p>}
        {data && data.items.length === 0 && <p className="text-muted-foreground text-sm">Nog geen evaluaties voor deze aanbieding.</p>}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {data.items.map((e) => (
              <li key={e.id} className="py-3" data-testid={`admin-game-listing-evaluation-${e.id}`}>
                <p className="text-sm font-medium">{e.answer1}</p>
                <p className="text-sm text-foreground/80 mt-1">{e.answer2}</p>
                <div className="flex items-center justify-between gap-4 mt-2">
                  <p className="text-xs text-muted-foreground">
                    door {e.username || '(geanonimiseerd)'} ({e.email}) · {e.votes} stem(men) · {e.points} pt
                    {e.hidden && ' · verborgen'}
                  </p>
                  <button
                    onClick={() => removeEvaluation(e.id)}
                    disabled={busy}
                    data-testid={`admin-game-listing-evaluation-delete-${e.id}`}
                    className="text-xs text-destructive hover:underline disabled:opacity-50 shrink-0"
                  >
                    Verwijderen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GameEvaluations() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    api.get('/admin/game/evaluations/top')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () => (statusFilter ? items?.filter((e) => e.listingStatus === statusFilter) : items),
    [items, statusFilter],
  );

  const moderate = async (id, hidden) => {
    setBusy(true);
    try {
      await api.patch(`/admin/game/evaluations/${id}/moderate`, { hidden: !hidden });
      load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (items === null && !error) {
    return <p className="text-muted-foreground" data-testid="admin-game-evaluations-loading">Laden…</p>;
  }

  return (
    <div data-testid="admin-game-evaluations">
      {error && <p className="text-destructive mb-4">{error}</p>}
      <div className="flex items-center justify-end mb-4">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} testId="admin-game-evaluations-status-filter" />
      </div>
      {filtered && filtered.length === 0 && <p className="text-muted-foreground">Nog geen evaluaties.</p>}
      {filtered && filtered.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((e) => (
            <li key={e.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-start" data-testid={`admin-game-evaluation-${e.id}`}>
              <div className="md:col-span-7">
                <p className="text-sm font-medium">{e.listingTitle} <span className="text-muted-foreground font-normal">({e.listingStatus})</span></p>
                <p className="text-sm text-foreground/80 mt-1">"{e.answer1}"</p>
                <p className="text-sm text-foreground/80">"{e.answer2}"</p>
                <p className="text-xs text-muted-foreground mt-1">
                  door {e.username || '(geanonimiseerd)'} ({e.email}) · {e.votes} stem(men) · {e.points} pt
                </p>
              </div>
              <div className="md:col-span-5 md:text-right">
                <button
                  onClick={() => moderate(e.id, e.hidden)}
                  disabled={busy}
                  data-testid={`admin-game-moderate-${e.id}`}
                  className="text-xs underline disabled:opacity-50"
                >
                  {e.hidden ? 'Terug tonen' : 'Verbergen'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
