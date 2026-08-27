import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

const MONTHS_NL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

export default function Statistieken() {
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
          <label className="label-overline" htmlFor="admin-stats-year">Jaar</label>
          <select
            id="admin-stats-year"
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
            <label className="label-overline" htmlFor="admin-stats-month">Maand</label>
            <select
              id="admin-stats-month"
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

            {stats.by_donateur_checkin?.length > 0 && (
              <div className="mt-6">
                <p className="overline mb-3">Top bedrijfs-donateurs — gedoneerd aan magazijn</p>
                <table className="w-full text-sm border-y border-border" data-testid="admin-stats-donateur-checkin-table">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2">Bedrijf</th>
                      <th className="text-right py-2">Kg gedoneerd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.by_donateur_checkin.slice(0, 20).map((o, i) => (
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
