import React, { useEffect, useState, useCallback } from 'react';
import { api, formatApiError } from '@/lib/api';

export default function AdminPanel() {
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

  if (queue === null && !err) return <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="admin-loading">Laden…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="admin-panel">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <p className="overline">Admin · Validatie</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Wachtrij</h1>
        </div>
        <button onClick={runMaintenance} disabled={busy} className="btn-secondary" data-testid="admin-maintenance-btn">
          Onderhoud uitvoeren
        </button>
      </div>

      {err && <p className="text-destructive mb-6" data-testid="admin-error">{err}</p>}

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

      {/* Pending orgs without owner (rare; usually validated with user) */}
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
    </div>
  );
}
