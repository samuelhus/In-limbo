import React, { useEffect, useState, useCallback } from 'react';
import { api, formatApiError } from '@/lib/api';
import AdminNieuws from './AdminNieuws';

const SECTIONS = [
  { key: 'validatie', label: 'Validatie' },
  { key: 'nieuws', label: 'Nieuws' },
  { key: 'statistieken', label: 'Statistieken' },
  { key: 'meldingen', label: 'Meldingen' },
  { key: 'gearchiveerd', label: 'Gearchiveerd' },
];

const SECTION_TITLES = {
  validatie: 'Wachtrij',
  nieuws: 'Nieuws',
  statistieken: 'Statistieken',
  meldingen: 'Meldingen',
  gearchiveerd: 'Gearchiveerde aanbiedingen',
};

export default function AdminPanel() {
  const [section, setSection] = useState('validatie');
  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/validation-queue');
      setQueue(data);
    } catch (e) {
      setErr(formatApiError(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decideUser = async (userId, decision, reason) => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${userId}/decision`, { decision, rejectionReason: reason || null });
      await load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const decideOrg = async (orgId, decision, reason) => {
    setBusy(true);
    try {
      await api.post(`/admin/organisations/${orgId}/decision`, { decision, rejectionReason: reason || null });
      await load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteDonnateur = async (userId, username) => {
    if (!window.confirm(`Donnateur "${username}" verwijderen? Hun aanbiedingen worden gearchiveerd. Deze actie is onomkeerbaar.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/users/${userId}`);
      await load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const runMaintenance = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/admin/maintenance/run');
      alert(`Onderhoud uitgevoerd. Gearchiveerd: ${data.archived} · Inactief gemarkeerde organisaties: ${data.inactiveOrgs}`);
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (queue === null && !err) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="admin-loading">
        Laden…
      </div>
    );
  }

  const sidebarItemClass = (key) =>
    `block w-full text-left px-4 py-3 text-sm border-b border-border hover:bg-muted transition-colors ${
      section === key ? 'bg-muted font-medium text-foreground' : 'text-foreground/70'
    }`;

  const mobileTabClass = (key) =>
    `whitespace-nowrap px-4 py-3 text-sm border-b-2 transition-colors ${
      section === key
        ? 'border-foreground text-foreground font-medium'
        : 'border-transparent text-foreground/70 hover:text-foreground'
    }`;

  return (
    <div className="min-h-screen flex flex-col md:flex-row" data-testid="admin-panel">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col w-56 border-r border-border shrink-0" data-testid="admin-sidebar">
        <div className="px-4 py-6 border-b border-border">
          <p className="overline">Admin</p>
        </div>
        <nav>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={sidebarItemClass(s.key)}
              data-testid={`admin-nav-${s.key}`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tabs */}
      <div className="md:hidden overflow-x-auto flex gap-2 border-b border-border" data-testid="admin-mobile-tabs">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={mobileTabClass(s.key)}
            data-testid={`admin-mobile-nav-${s.key}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-6 md:px-8 py-12" data-testid={`admin-section-${section}`}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <p className="overline">Admin · {SECTION_TITLES[section]}</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">{SECTION_TITLES[section]}</h1>
          </div>
          {section === 'validatie' && (
            <button
              onClick={runMaintenance}
              disabled={busy}
              className="btn-secondary"
              data-testid="admin-maintenance-btn"
            >
              Onderhoud uitvoeren
            </button>
          )}
        </div>

        {err && <p className="text-destructive mb-6" data-testid="admin-error">{err}</p>}

        {section === 'validatie' && (
          <>
            {/* Pending users */}
            <section className="mb-16">
              <p className="overline mb-4">Gebruikers in afwachting · {queue?.pendingUsers?.length || 0}</p>
              {queue?.pendingUsers?.length === 0 && (
                <p className="text-muted-foreground" data-testid="admin-no-users">Geen wachtende gebruikers.</p>
              )}
              <ul className="divide-y divide-border border-y border-border">
                {queue?.pendingUsers?.map((u) => (
                  <li key={u.id} className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-start" data-testid={`admin-pending-user-${u.id}`}>
                    <div className="md:col-span-7">
                      <p className="font-medium">{u.firstName} {u.lastName}</p>
                      <p className="text-sm text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                      {u.organisation && (
                        <p className="mt-3 text-sm">
                          <span className="overline text-[10px] mr-2">Organisatie</span>
                          <span className="font-medium">{u.organisation.name}</span>
                          <span className="text-muted-foreground"> · {u.organisation.category} · status: <em>{u.organisation.status}</em></span>
                        </p>
                      )}
                      {u.previousRejections > 0 && (
                        <p className="mt-2 text-xs text-orange-700">
                          ⓘ {u.previousRejections} eerdere afgewezen aanvraag/aanvragen.
                        </p>
                      )}
                    </div>
                    <div className="md:col-span-5 flex flex-wrap gap-2 md:justify-end">
                      <button
                        onClick={() => decideUser(u.id, 'approve')}
                        disabled={busy}
                        className="btn-primary !py-2"
                        data-testid={`admin-approve-user-${u.id}`}
                      >
                        Goedkeuren
                      </button>
                      <button
                        onClick={() => {
                          const r = window.prompt('Reden voor afwijzing (optioneel):', '');
                          if (r === null) return;
                          decideUser(u.id, 'reject', r);
                        }}
                        disabled={busy}
                        className="btn-secondary !py-2"
                        data-testid={`admin-reject-user-${u.id}`}
                      >
                        Afwijzen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pending orgs without owner */}
            <section>
              <p className="overline mb-4">Organisaties in afwachting · {queue?.pendingOrgs?.length || 0}</p>
              {queue?.pendingOrgs?.length === 0 && (
                <p className="text-muted-foreground" data-testid="admin-no-orgs">Geen wachtende organisaties.</p>
              )}
              <ul className="divide-y divide-border border-y border-border">
                {queue?.pendingOrgs?.map((o) => (
                  <li key={o.id} className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4" data-testid={`admin-pending-org-${o.id}`}>
                    <div className="md:col-span-8">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{o.category}</p>
                      <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{o.description}</p>
                    </div>
                    <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end items-start">
                      <button onClick={() => decideOrg(o.id, 'approve')} disabled={busy} className="btn-primary !py-2" data-testid={`admin-approve-org-${o.id}`}>
                        Goedkeuren
                      </button>
                      <button
                        onClick={() => {
                          const r = window.prompt('Reden (optioneel):', '');
                          if (r === null) return;
                          decideOrg(o.id, 'reject', r);
                        }}
                        disabled={busy}
                        className="btn-secondary !py-2"
                        data-testid={`admin-reject-org-${o.id}`}
                      >
                        Afwijzen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Donnateurs */}
            <section className="mt-16">
              <p className="overline mb-4">Donnateurs · {queue?.donnateurs?.length || 0}</p>
              {(!queue?.donnateurs || queue.donnateurs.length === 0) && (
                <p className="text-muted-foreground" data-testid="admin-no-donnateurs">Geen donnateurs geregistreerd.</p>
              )}
              <ul className="divide-y divide-border border-y border-border">
                {queue?.donnateurs?.map((d) => (
                  <li key={d.id} className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-start" data-testid={`admin-donnateur-${d.id}`}>
                    <div className="md:col-span-8">
                      <p className="font-medium">{d.username}</p>
                      <p className="text-sm text-muted-foreground">{d.email}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aangemaakt op {new Date(d.createdAt).toLocaleDateString('nl-BE')}
                      </p>
                    </div>
                    <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
                      <button
                        onClick={() => deleteDonnateur(d.id, d.username)}
                        disabled={busy}
                        data-testid={`admin-delete-donnateur-${d.id}`}
                        className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-xs font-medium tracking-wide transition-all duration-200 hover:bg-red-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                        style={{ borderRadius: 2 }}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {section === 'nieuws' && <AdminNieuws />}

        {section === 'statistieken' && (
          <div data-testid="admin-statistieken-placeholder">
            <p className="overline mb-4">Binnenkort beschikbaar</p>
            <h2 className="text-2xl font-bold tracking-tight mb-4">Statistieken</h2>
            <p className="text-foreground/75 max-w-2xl leading-relaxed">
              Deze functie is nog in ontwikkeling. Statistieken over gebruikers, aanbiedingen
              en herbestemmingen komen hier.
            </p>
          </div>
        )}

        {section === 'meldingen' && (
          <div data-testid="admin-meldingen-placeholder">
            <p className="overline mb-4">Binnenkort beschikbaar</p>
            <h2 className="text-2xl font-bold tracking-tight mb-4">Meldingen</h2>
            <p className="text-foreground/75 max-w-2xl leading-relaxed">
              Deze functie is nog in ontwikkeling. Meldingen gegenereerd door gebruikers
              van het platform verschijnen hier.
            </p>
          </div>
        )}

        {section === 'gearchiveerd' && (
          <div data-testid="admin-gearchiveerd-placeholder">
            <p className="overline mb-4">Binnenkort beschikbaar</p>
            <h2 className="text-2xl font-bold tracking-tight mb-4">Gearchiveerde aanbiedingen</h2>
            <p className="text-foreground/75 max-w-2xl leading-relaxed">
              Deze functie is nog in ontwikkeling. Een overzicht van alle gearchiveerde
              aanbiedingen verschijnt hier.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
