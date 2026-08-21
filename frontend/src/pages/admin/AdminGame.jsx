import React, { useEffect, useState } from 'react';
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
  const [orgs, setOrgs] = useState(null);

  const load = () => {
    api.get('/admin/game/listings-stats')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, []);
  useEffect(() => {
    api.get('/admin/organisations', { params: { status: 'active' } })
      .then(({ data }) => setOrgs(data))
      .catch(() => setOrgs([]));
  }, []);

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

  const validate = async (evaluationId) => {
    if (!orgs || orgs.length === 0) {
      alert('Geen actieve organisaties gevonden om naar toe te valideren.');
      return;
    }
    const names = orgs.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
    const choice = window.prompt(`Naar welke organisatie is dit opgestuurd?\n${names}\n\nGeef het nummer op:`);
    if (choice === null) return;
    const org = orgs[parseInt(choice, 10) - 1];
    if (!org) {
      alert('Ongeldige keuze.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/game/evaluations/${evaluationId}/validate`, { destinationOrgId: org.id });
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
      <p className="text-sm text-muted-foreground mb-4">
        {items?.length || 0} aanbieding(en) in of ooit in de spelpool.
      </p>
      {items && items.length === 0 && <p className="text-muted-foreground">Geen aanbiedingen.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((l) => (
            <li key={l.id} className="py-4" data-testid={`admin-game-listing-${l.id}`}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <div className="md:col-span-5">
                  <p className="font-medium">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    status: {l.status} · {l.gameEvaluationCount}/20 evaluaties
                    {l.gameValidation && ' · ✅ gevalideerd'}
                  </p>
                </div>
                <div className="md:col-span-4">
                  {l.topEvaluation ? (
                    <p className="text-sm text-foreground/80">
                      "{l.topEvaluation.answer1}" · {l.topEvaluation.votes} stem(men)
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
                  {l.topEvaluation && !l.gameValidation && (
                    <button
                      onClick={() => validate(l.topEvaluation.id)}
                      disabled={busy}
                      data-testid={`admin-game-validate-${l.id}`}
                      className="btn-ghost !p-0 text-xs underline"
                    >
                      Valideren
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GameEvaluations() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/admin/game/evaluations/top')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(load, []);

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
      {items && items.length === 0 && <p className="text-muted-foreground">Nog geen evaluaties.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((e) => (
            <li key={e.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-start" data-testid={`admin-game-evaluation-${e.id}`}>
              <div className="md:col-span-7">
                <p className="text-sm font-medium">{e.listingTitle}</p>
                <p className="text-sm text-foreground/80 mt-1">"{e.answer1}"</p>
                <p className="text-sm text-foreground/80">"{e.answer2}"</p>
                <p className="text-xs text-muted-foreground mt-1">door {e.username || '(geanonimiseerd)'} · {e.votes} stem(men) · {e.points} pt</p>
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
