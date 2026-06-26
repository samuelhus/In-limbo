import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { api, formatApiError } from '@/lib/api';
import AdminNieuws from './AdminNieuws';
import StatusBadge from '@/components/StatusBadge';
import { Link } from 'react-router-dom';

const SECTIONS = [
  { key: 'validatie', label: 'Validatie' },
  { key: 'gebruikers', label: 'Gebruikers' },
  { key: 'organisaties', label: 'Organisaties' },
  { key: 'nieuws', label: 'Nieuws' },
  { key: 'statistieken', label: 'Statistieken' },
  { key: 'meldingen', label: 'Meldingen' },
  { key: 'gearchiveerd', label: 'Gearchiveerd' },
];

const SECTION_TITLES = {
  validatie: 'Wachtrij',
  gebruikers: 'Gebruikers',
  organisaties: 'Organisaties',
  nieuws: 'Nieuws',
  statistieken: 'Statistieken',
  meldingen: 'Meldingen',
  gearchiveerd: 'Gearchiveerde aanbiedingen',
};

export default function AdminPanel() {
  const { t } = useTranslation();
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

  const deleteDonateur = async (userId, username) => {
    if (!window.confirm(`Donateur "${username}" verwijderen? Hun aanbiedingen worden gearchiveerd. Deze actie is onomkeerbaar.`)) return;
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
    `block w-full text-left px-4 py-3 text-sm border-b border-border hover:bg-[#ADEBB3] transition-colors ${
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
                          <span className="text-muted-foreground"> · {t(`org_categories.${u.organisation.category}`)} · status: <em>{u.organisation.status}</em></span>
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
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{t(`org_categories.${o.category}`)}</p>
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

            {/* Donateurs */}
           {/* <section className="mt-16">
              <p className="overline mb-4">Donateurs · {queue?.donateurs?.length || 0}</p>
              {(!queue?.donateurs || queue.donateurs.length === 0) && (
                <p className="text-muted-foreground" data-testid="admin-no-donateurs">Geen donateurs geregistreerd.</p>
              )}
              <ul className="divide-y divide-border border-y border-border">
                {queue?.donateurs?.map((d) => (
                  <li key={d.id} className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-start" data-testid={`admin-donateur-${d.id}`}>
                    <div className="md:col-span-8">
                      <p className="font-medium">{d.username}</p>
                      <p className="text-sm text-muted-foreground">{d.email}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aangemaakt op {new Date(d.createdAt).toLocaleDateString('nl-BE')}
                      </p>
                    </div>
                    <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
                      <button
                        onClick={() => deleteDonateur(d.id, d.username)}
                        disabled={busy}
                        data-testid={`admin-delete-donateur-${d.id}`}
                        className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-xs font-medium tracking-wide transition-all duration-200 hover:bg-red-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                        style={{ borderRadius: 2 }}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section> */}
          </>
        )}

        {section === 'gebruikers' && <AdminGebruikers />}

        {section === 'organisaties' && <AdminOrganisaties />}

        {section === 'nieuws' && <AdminNieuws />}

        {section === 'statistieken' && <Statistieken />}

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


const MONTHS_NL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function Statistieken() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkoutUrl = `${window.location.origin}/checkout`;

  useEffect(() => {
    api.get('/admin/stats/available-periods').then(({ data }) => setYears(data.years)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (year) params.year = parseInt(year, 10);
    if (year && month) params.month = parseInt(month, 10);
    api.get('/admin/stats', { params })
      .then(({ data }) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  const materialRows = stats
    ? Object.entries(stats.by_material)
        .map(([m, v]) => ({ material: m, magazijn: v.magazijn, platform: v.platform, total: v.magazijn + v.platform }))
        .sort((a, b) => b.total - a.total)
    : [];

  const isEmpty = stats && stats.totals.combined_kg === 0 && stats.checkouts_count === 0 && stats.transfers_count === 0 && (stats.checkins_count ?? 0) === 0;

  return (
    <div data-testid="admin-statistieken-section" className="space-y-10">
            {/* QR-code checkout */}
      {/* QR-code checkout */}
      <div className="flex flex-col sm:flex-row items-start gap-6 p-6 border border-border" data-testid="admin-qr-block">
        <div className="flex-1">
          <p className="overline mb-1">Magazijn checkout</p>
          <p className="text-sm text-foreground/70 mb-2">
            Hang deze QR-code op in het magazijn. Bezoekers scannen hem
            om materialen uit te checken.
          </p>
          <p className="text-xs text-muted-foreground font-mono break-all mb-4">{checkoutUrl}</p>
          <Link to="/checkout" className="btn-secondary !py-1.5 px-3 text-xs" data-testid="admin-link-checkout">
            Checkout pagina →
          </Link>
        </div>
        <div className="bg-white p-3 border border-border shrink-0">
          <QRCodeSVG value={checkoutUrl} size={120} />
        </div>
      </div>

      {/* Checkin blok */}
      <div className="flex flex-col sm:flex-row items-start gap-6 p-6 border border-border" data-testid="admin-checkin-block">
        <div className="flex-1">
          <p className="overline mb-1">Magazijn checkin</p>
          <p className="text-sm text-foreground/70 mb-4">
            Registreer materialen die door een organisatie worden gedoneerd aan het magazijn. Enkel toegankelijk voor admins.
          </p>
          <Link to="/checkin" className="btn-secondary !py-1.5 px-3 text-xs" data-testid="admin-link-checkin">
            Checkin pagina →
          </Link>
        </div>
      </div>

      {/* Periode filter */}
      <div className="flex flex-wrap items-end gap-4" data-testid="admin-stats-filter">
        <div>
          <label className="label-overline">Jaar</label>
          <select
            className="input-flat"
            value={year}
            onChange={(e) => { setYear(e.target.value); setMonth(''); }}
            data-testid="admin-stats-year"
          >
            <option value="">Alle jaren</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {year && (
          <div>
            <label className="label-overline">Maand</label>
            <select
              className="input-flat"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              data-testid="admin-stats-month"
            >
              <option value="">Alle maanden</option>
              {MONTHS_NL.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <p className="text-muted-foreground" data-testid="admin-stats-loading">Laden…</p>}

      {!loading && isEmpty && (
        <p className="text-muted-foreground" data-testid="admin-stats-empty">
          Nog geen data beschikbaar voor deze periode.
        </p>
      )}

      {!loading && stats && !isEmpty && (
        <>
          {/* Totalen */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="admin-stats-totals">
            <div className="border border-border p-5">
              <p className="overline mb-2">Totaal herbestemd</p>
              <p className="text-4xl font-bold tracking-tight" data-testid="stats-total-combined">
                {stats.totals.combined_kg.toFixed(2)} <span className="text-base text-muted-foreground font-normal">kg</span>
              </p>
            </div>
            <div className="border border-border p-5">
              <p className="overline mb-2">Via magazijn</p>
              <p className="text-4xl font-bold tracking-tight" data-testid="stats-total-magazijn">
                {stats.totals.magazijn_kg.toFixed(2)} <span className="text-base text-muted-foreground font-normal">kg</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">{stats.checkouts_count} uitcheck(s)</p>
            </div>
            <div className="border border-border p-5">
              <p className="overline mb-2">Via platform</p>
              <p className="text-4xl font-bold tracking-tight" data-testid="stats-total-platform">
                {stats.totals.platform_kg.toFixed(2)} <span className="text-base text-muted-foreground font-normal">kg</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">{stats.transfers_count} herbestemming(en)</p>
            </div>
          </section>

          {/* Per materiaal */}
          {materialRows.length > 0 && (
            <section data-testid="admin-stats-materials">
              <p className="overline mb-3">Per materiaal</p>
              <table className="w-full text-sm border-y border-border">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2">Materiaal</th>
                    <th className="text-right py-2">Magazijn (kg)</th>
                    <th className="text-right py-2">Platform (kg)</th>
                    <th className="text-right py-2 font-bold text-foreground">Totaal (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {materialRows.map((r) => (
                    <tr key={r.material} data-testid={`stats-material-row-${r.material}`}>
                      <td className="py-2">{r.material}</td>
                      <td className="py-2 text-right">{r.magazijn.toFixed(2)}</td>
                      <td className="py-2 text-right">{r.platform.toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">{r.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Org magazijn */}
          {stats.by_org_magazijn.length > 0 && (
            <section data-testid="admin-stats-org-magazijn">
              <p className="overline mb-3">Organisaties — meegenomen via magazijn (top 20)</p>
              <table className="w-full text-sm border-y border-border">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2">Organisatie</th>
                    <th className="text-right py-2">Kg meegenomen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.by_org_magazijn.slice(0, 20).map((o, i) => (
                    <tr key={i}>
                      <td className="py-2">{o.name}</td>
                      <td className="py-2 text-right font-medium">{o.kg.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* CHECKIN STATS */}
          <section data-testid="admin-stats-checkin">
            <p className="overline mb-3">Magazijn checkins</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="border border-border p-4">
                <p className="text-3xl font-bold" data-testid="admin-stats-checkins-count">{stats.checkins_count ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Totaal checkins</p>
              </div>
              <div className="border border-border p-4">
                <p className="text-3xl font-bold" data-testid="admin-stats-checkin-kg">{stats.totals?.checkin_kg?.toFixed(1) ?? '0.0'}</p>
                <p className="text-xs text-muted-foreground mt-1">kg ingecheckt</p>
              </div>
            </div>

            {stats.by_org_checkin?.length > 0 && (
              <div className="mt-6">
                <p className="overline mb-3">Top organisaties — gedoneerd aan magazijn</p>
                <table className="w-full text-sm border-y border-border" data-testid="admin-stats-checkin-table">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2">Organisatie</th>
                      <th className="text-right py-2">Kg gedoneerd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.by_org_checkin.slice(0, 20).map((o, i) => (
                      <tr key={i}>
                        <td className="py-2">{o.name}</td>
                        <td className="py-2 text-right font-medium">{o.kg.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Org platform */}
          {stats.by_org_platform.length > 0 && (
            <section data-testid="admin-stats-org-platform">
              <p className="overline mb-3">Organisaties — ontvangen via platform (top 20)</p>
              <table className="w-full text-sm border-y border-border">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2">Organisatie</th>
                    <th className="text-right py-2">Kg ontvangen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.by_org_platform.slice(0, 20).map((o, i) => (
                    <tr key={i}>
                      <td className="py-2">{o.name}</td>
                      <td className="py-2 text-right font-medium">{o.kg.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {stats.by_org_platform_givers?.length > 0 && (
            <section data-testid="admin-stats-org-platform-givers">
              <p className="overline mb-3">Organisaties — gegeven via platform (top 20)</p>
              <table className="w-full text-sm border-y border-border">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2">Organisatie</th>
                    <th className="text-right py-2">Kg weggegeven</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.by_org_platform_givers.slice(0, 20).map((o, i) => (
                    <tr key={i}>
                      <td className="py-2">{o.name}</td>
                      <td className="py-2 text-right font-medium">{o.kg.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const ROLES = ['user', 'admin', 'donateur'];
const USER_STATUSES = ['pending', 'validated', 'rejected'];
const ORG_CATEGORIES = [
  'beeldende_kunsten', 'educatie', 'jeugdwerk', 'podiumkunsten',
  'sociaal_werk', 'sport', 'noodopvang', 'ander',
];
const ORG_STATUSES = ['pending', 'validated', 'active', 'inactive'];

function AdminGebruikers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [orgOptions, setOrgOptions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  // Load all organisations once for the dropdown
  useEffect(() => {
    api.get('/admin/organisations')
      .then(({ data }) => {
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
        setOrgOptions(sorted);
      })
      .catch(() => {});
  }, []);

  const load = (query = '', orgId = filterOrg, currentPage = 0) => {
    const params = { skip: currentPage * LIMIT, limit: LIMIT };
    if (query.length >= 2) params.q = query;
    if (orgId) params.organisation_id = orgId;
    api.get('/admin/users', { params })
      .then(({ data }) => {
        setUsers(data.items);
        setTotal(data.total);
      })
      .catch(() => {});
  };

  useEffect(() => { load(q, filterOrg, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPage(0);
    const t = setTimeout(() => load(q, filterOrg, 0), 300);
    return () => clearTimeout(t);
  }, [q, filterOrg]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteUser = async (userId) => {
    if (!window.confirm('Gebruiker definitief verwijderen? Hun aanbiedingen worden gearchiveerd.')) return;
    setBusy(true);
    try {
      await api.delete(`/admin/users/${userId}`);
      load(q);
    } catch (e) { alert(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const saveUser = async (userId, patch) => {
    setBusy(true);
    try {
      await api.patch(`/admin/users/${userId}`, patch);
      setEditing(null);
      load(q);
    } catch (e) { alert(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="admin-gebruikers-section">
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <input
          className="input-flat w-48"
          placeholder="Zoek op naam of e-mail..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="admin-gebruikers-search"
        />
        <select
          className="input-flat"
          value={filterOrg}
          onChange={(e) => setFilterOrg(e.target.value)}
          data-testid="admin-gebruikers-filter-org"
        >
          <option value="">Alle organisaties</option>
          {orgOptions.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        {filterOrg && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setFilterOrg('')}
          >
            ✕ Filter wissen
          </button>
        )}
        <span className="text-sm text-muted-foreground self-center">{total} gebruiker(s)</span>
      </div>
      <div className="divide-y divide-border border-y border-border">
        {users.map((u) => (
          <div key={u.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
               data-testid={`admin-user-row-${u.id}`}>
            <div className="md:col-span-5">
              <p className="font-medium">
                {u.role === 'donateur'
                ? <Link to={`/admin/donateur/${u.id}`} className="hover:underline">{u.username}</Link>
                : `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—'
                }              </p>
              <p className="text-sm text-muted-foreground">{u.email}</p>
            </div>
            <div className="md:col-span-3 text-sm text-muted-foreground">
              {u.organisationId && u.organisationName
                ? <Link to={`/organisaties/${u.organisationId}`} className="hover:underline">{u.organisationName}</Link>
                : (u.role === 'donateur' ? 'Donateur' : '—')
              }
            </div>
            <div className="md:col-span-2 flex gap-2 items-center">
              <StatusBadge status={u.status} />
              <span className="text-xs text-muted-foreground">{u.role}</span>
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button onClick={() => setEditing(u)} className="btn-secondary !py-1 px-3 text-xs"
                      data-testid={`admin-user-edit-${u.id}`}>Bewerken</button>
              <button onClick={() => deleteUser(u.id)} disabled={busy}
                      className="text-destructive text-xs hover:underline disabled:opacity-50"
                      data-testid={`admin-user-delete-${u.id}`}>Verwijderen</button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <p className="py-8 text-muted-foreground text-sm">Geen gebruikers gevonden.</p>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between py-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} van {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="btn-secondary !py-1 px-3 text-xs disabled:opacity-40"
            >
              ← Vorige
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * LIMIT >= total}
              className="btn-secondary !py-1 px-3 text-xs disabled:opacity-40"
            >
              Volgende →
            </button>
          </div>
        </div>
      )}

      {editing && (
        <AdminUserEditModal user={editing} onSave={saveUser} onClose={() => setEditing(null)} busy={busy} />
      )}
    </div>
  );
}

function AdminUserEditModal({ user, onSave, onClose, busy }) {
  const isDonateur = user.role === 'donateur';
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
    phone: user.phone || '',
    role: user.role || 'user',
    status: user.status || 'pending',
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="admin-user-edit-modal">
      <div className="bg-background border border-border p-8 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <p className="overline mb-2">Gebruiker bewerken</p>
        {isDonateur ? (
          <div>
            <label className="label-overline">Gebruikersnaam</label>
            <input className="input-flat w-full" value={form.username}
                   onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
        ) : (
          <>
            <div>
              <label className="label-overline">Voornaam</label>
              <input className="input-flat w-full" value={form.firstName}
                     onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label-overline">Achternaam</label>
              <input className="input-flat w-full" value={form.lastName}
                     onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <label className="label-overline">E-mail</label>
          <input className="input-flat w-full" value={form.email}
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label-overline">Telefoon</label>
          <input className="input-flat w-full" value={form.phone}
                 onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-overline">Rol</label>
            <select className="input-flat w-full" value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label-overline">Status</label>
            <select className="input-flat w-full" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={() => onSave(user.id, form)} disabled={busy} className="btn-primary"
                  data-testid="admin-user-edit-save">Opslaan</button>
          <button onClick={onClose} className="btn-secondary">Annuleren</button>
        </div>
      </div>
    </div>
  );
}

function AdminOrganisaties() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState([]);
  const [q, setQ] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sort, setSort] = useState('createdAt_desc');
  const [editing, setEditing] = useState(null);
  const [statsOrg, setStatsOrg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = (query = '', category = filterCategory, status = filterStatus, sortVal = sort) => {
    const params = {};
    if (query.length >= 2) params.q = query;
    if (category) params.category = category;
    if (status) params.status = status;
    if (sortVal) params.sort = sortVal;
    api.get('/admin/organisations', { params })
      .then(({ data }) => setOrgs(data))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => load(q, filterCategory, filterStatus, sort), 300);
    return () => clearTimeout(timer);
  }, [q, filterCategory, filterStatus, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteOrg = async (orgId, orgName, userCount) => {
    if (!window.confirm(`"${orgName}" verwijderen? Dit verwijdert ook ${userCount} gebruiker(s) en archiveert hun aanbiedingen.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/organisations/${orgId}`);
      load(q);
    } catch (e) { alert(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const saveOrg = async (orgId, patch) => {
    setBusy(true);
    try {
      await api.patch(`/admin/organisations/${orgId}`, patch);
      setEditing(null);
      load(q);
    } catch (e) { alert(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const formatInactiveSince = (iso) => {
    if (!iso) return null;
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths >= 2) return `Inactief since ${diffMonths} maanden geleden`;
    if (diffDays >= 1) return `Inactief since ${diffDays} dag${diffDays > 1 ? 'en' : ''} geleden`;
    return 'Inactief since vandaag';
  };

  return (
    <div data-testid="admin-organisaties-section">
      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <input
          className="input-flat w-48"
          placeholder="Zoek op naam..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="admin-organisaties-search"
        />
        <select
          className="input-flat"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          data-testid="admin-organisaties-filter-category"
        >
          <option value="">Alle categorieën</option>
          {ORG_CATEGORIES.map((key) => (
            <option key={key} value={key}>{t(`org_categories.${key}`)}</option>
          ))}
        </select>
        <select
          className="input-flat"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          data-testid="admin-organisaties-filter-status"
        >
          <option value="">Alle statussen</option>
          {ORG_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="input-flat"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          data-testid="admin-organisaties-sort"
        >
          <option value="createdAt_desc">Datum toegevoegd ↓ (nieuwste eerst)</option>
          <option value="createdAt_asc">Datum toegevoegd ↑ (oudste eerst)</option>
          <option value="name_asc">Naam A→Z</option>
          <option value="name_desc">Naam Z→A</option>
        </select>
        <span className="text-sm text-muted-foreground self-center">{orgs.length} resultaten</span>
      </div>

      {/* Org list */}
      <div className="divide-y divide-border border-y border-border">
        {orgs.map((org) => (
          <div key={org.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start"
               data-testid={`admin-org-row-${org.id}`}>
            <div className="md:col-span-5">
              <Link
                to={`/organisaties/${org.id}`}
                className="font-medium hover:underline"
                data-testid={`admin-org-name-link-${org.id}`}
              >
                {org.name}
              </Link>
              <p className="text-sm text-muted-foreground">{t(`org_categories.${org.category}`)}</p>
              {org.createdAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Toegevoegd: {new Date(org.createdAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {org.status === 'inactive' && org.inactiveSince && (
                <p className="text-xs text-destructive mt-1 font-medium" data-testid={`admin-org-inactive-since-${org.id}`}>
                  {formatInactiveSince(org.inactiveSince)}
                </p>
              )}
            </div>
            <div className="md:col-span-3 text-sm text-muted-foreground">
              {org.userCount} gebruiker(s)
            </div>
            <div className="md:col-span-2">
              <StatusBadge status={org.status} />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end flex-wrap">
              <button onClick={() => setStatsOrg(org)} className="btn-secondary !py-1 px-3 text-xs"
                      data-testid={`admin-org-stats-${org.id}`}>Stats</button>
              <button onClick={() => setEditing(org)} className="btn-secondary !py-1 px-3 text-xs"
                      data-testid={`admin-org-edit-${org.id}`}>Bewerken</button>
              <button onClick={() => deleteOrg(org.id, org.name, org.userCount)} disabled={busy}
                      className="text-destructive text-xs hover:underline disabled:opacity-50"
                      data-testid={`admin-org-delete-${org.id}`}>Verwijderen</button>
            </div>
          </div>
        ))}
        {orgs.length === 0 && (
          <p className="py-8 text-muted-foreground text-sm">Geen organisaties gevonden.</p>
        )}
      </div>
      {editing && (
        <AdminOrgEditModal org={editing} onSave={saveOrg} onClose={() => setEditing(null)} busy={busy} />
      )}
      {statsOrg && (
        <AdminOrgStatsModal org={statsOrg} onClose={() => setStatsOrg(null)} />
      )}
    </div>
  );
}

function AdminOrgStatsModal({ org, onClose }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/organisations/${org.id}/stats`)
      .then(({ data }) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [org.id]);

  const StatRow = ({ label, total_kg, total_count, per_year }) => (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {total_count} keer · {total_kg} kg
        </span>
      </div>
      {Object.keys(per_year).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(per_year).sort().map(([year, data]) => (
            <span key={year} className="text-xs bg-secondary px-2 py-0.5 rounded">
              {year}: {data.count}× · {data.kg}kg
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const ListingsRow = ({ label, count, per_year }) => (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{count} aanbiedingen</span>
      </div>
      {per_year && Object.keys(per_year).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(per_year).sort().map(([year, count]) => (
            <span key={year} className="text-xs bg-secondary px-2 py-0.5 rounded">
              {year}: {count}×
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="overline">Statistieken</p>
            <h2 className="text-xl font-bold mt-1">{org.name}</h2>
            <p className="text-sm text-muted-foreground">{t(`org_categories.${org.category}`)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Laden...</p>}
        {!loading && !stats && <p className="text-destructive text-sm">Kon statistieken niet laden.</p>}

        {stats && (
          <div>
            {/* Leden */}
            <div className="py-3 border-b border-border">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Leden</span>
                <span className="text-sm text-muted-foreground">{stats.members}</span>
              </div>
            </div>

            {/* Aanbiedingen */}
            <p className="overline text-xs mt-4 mb-1">Aanbiedingen</p>
            <ListingsRow
              label="Actief"
              count={stats.listings.active}
            />
            <ListingsRow
              label="Herbestemd"
              count={stats.listings.herbestemd}
            />
            <ListingsRow
              label="Gearchiveerd"
              count={stats.listings.archived}
              per_year={stats.listings.per_year}
            />

            {/* Uitwisseling via platform */}
            <p className="overline text-xs mt-4 mb-1">Via platform</p>
            <StatRow
              label="Ontvangen materiaal"
              total_kg={stats.platform_received.total_kg}
              total_count={stats.platform_received.total_count}
              per_year={stats.platform_received.per_year}
            />
            <StatRow
              label="Gegeven materiaal"
              total_kg={stats.platform_given.total_kg}
              total_count={stats.platform_given.total_count}
              per_year={stats.platform_given.per_year}
            />

            {/* Magazijn */}
            <p className="overline text-xs mt-4 mb-1">Via magazijn</p>
            <StatRow
              label="Gedoneerd aan magazijn"
              total_kg={stats.checkins.total_kg}
              total_count={stats.checkins.total_count}
              per_year={stats.checkins.per_year}
            />
            <StatRow
              label="Ontvangen uit magazijn"
              total_kg={stats.checkouts.total_kg}
              total_count={stats.checkouts.total_count}
              per_year={stats.checkouts.per_year}
            />
          </div>
        )}

        <div className="mt-6">
          <button onClick={onClose} className="btn-secondary w-full">Sluiten</button>
        </div>
      </div>
    </div>
  );
}

function AdminOrgEditModal({ org, onSave, onClose, busy }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: org.name || '',
    description: org.description || '',
    category: org.category || 'ander',
    address: org.address || '',
    website: org.website || '',
    status: org.status || 'pending',
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="admin-org-edit-modal">
      <div className="bg-background border border-border p-8 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <p className="overline mb-2">Organisatie bewerken</p>
        <div>
          <label className="label-overline">Naam</label>
          <input className="input-flat w-full" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label-overline">Beschrijving</label>
          <textarea className="input-flat w-full" rows={3} value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label-overline">Categorie</label>
          <select className="input-flat w-full" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {ORG_CATEGORIES.map((key) => <option key={key} value={key}>{t(`org_categories.${key}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="label-overline">Adres</label>
          <input className="input-flat w-full" value={form.address}
                 onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label-overline">Website</label>
          <input className="input-flat w-full" value={form.website}
                 onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
        <div>
          <label className="label-overline">Status</label>
          <select className="input-flat w-full" value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {ORG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={() => onSave(org.id, form)} disabled={busy} className="btn-primary"
                  data-testid="admin-org-edit-save">Opslaan</button>
          <button onClick={onClose} className="btn-secondary">Annuleren</button>
        </div>
      </div>
    </div>
  );
}

