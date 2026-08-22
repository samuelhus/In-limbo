import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '@/lib/api';

// Zie prd/PRD_meldingen_admin.md §5 — 6 triggers, elk met een eigen label/icoon-kleur.
const TYPE_LABELS = {
  listing_reported: 'Aanbieding gemeld',
  deadline_approaching: 'Deadline nadert',
  listing_expired_unrehomed: 'Vervallen zonder herbestemming',
  new_search_request: 'Nieuw zoekertje',
  evaluation_high_score: 'Evaluatie met hoge score',
  conversation_blocked: 'Gesprek geblokkeerd',
};

const TYPE_COLORS = {
  listing_reported: 'bg-red-100 text-red-800',
  deadline_approaching: 'bg-orange-100 text-orange-800',
  listing_expired_unrehomed: 'bg-yellow-100 text-yellow-800',
  new_search_request: 'bg-blue-100 text-blue-800',
  evaluation_high_score: 'bg-purple-100 text-purple-800',
  conversation_blocked: 'bg-red-100 text-red-800',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminMeldingen({ onCountChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open'); // Standaardweergave: enkel open (PRD §4)

  const load = useCallback(async () => {
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/admin/reports', { params });
      setItems(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handle = async (id) => {
    setBusyId(id);
    try {
      await api.patch(`/admin/reports/${id}/handle`);
      await load();
      onCountChanged?.();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (id) => {
    setBusyId(id);
    try {
      await api.patch(`/admin/reports/${id}/reopen`);
      await load();
      onCountChanged?.();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-testid="admin-meldingen">
      <p className="text-sm text-muted-foreground mb-6">
        Gebeurtenissen op het platform die de aandacht van het team vragen. Eén gedeelde status per melding — als
        iemand een melding afhandelt, is ze voor het hele team afgehandeld.
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="input-flat"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          data-testid="meldingen-type-filter"
        >
          <option value="">Alle types</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          className="input-flat"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="meldingen-status-filter"
        >
          <option value="open">Open</option>
          <option value="afgehandeld">Afgehandeld</option>
          <option value="alle">Alle</option>
        </select>
      </div>

      {error && <p className="text-destructive mb-4" data-testid="meldingen-error">{error}</p>}

      {items === null && !error && (
        <p className="text-muted-foreground" data-testid="meldingen-loading">Laden…</p>
      )}

      {items && items.length === 0 && (
        <p className="text-muted-foreground" data-testid="meldingen-empty">Geen meldingen.</p>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((r) => (
            <li key={r.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start" data-testid={`melding-row-${r.id}`}>
              <div className="md:col-span-8">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span
                    className={`inline-block px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase ${TYPE_COLORS[r.type] || 'bg-muted text-foreground'}`}
                    data-testid={`melding-type-${r.id}`}
                  >
                    {TYPE_LABELS[r.type] || r.type}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                  {r.status === 'afgehandeld' && (
                    <span className="text-xs text-green-700 font-medium">✓ Afgehandeld</span>
                  )}
                </div>
                <p className="text-sm text-foreground/90">{r.message}</p>
                {r.targetType === 'listing' && r.targetId && (
                  <Link
                    to={`/aanbieding/${r.targetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="industrial-link text-xs mt-1 inline-block"
                    data-testid={`melding-link-${r.id}`}
                  >
                    Bekijk aanbieding →
                  </Link>
                )}
              </div>
              <div className="md:col-span-4 flex md:justify-end">
                {r.status === 'open' ? (
                  <button
                    onClick={() => handle(r.id)}
                    disabled={busyId === r.id}
                    className="btn-primary !py-2 text-xs"
                    data-testid={`melding-handle-${r.id}`}
                  >
                    Afhandelen
                  </button>
                ) : (
                  <button
                    onClick={() => reopen(r.id)}
                    disabled={busyId === r.id}
                    className="btn-secondary !py-2 text-xs"
                    data-testid={`melding-reopen-${r.id}`}
                  >
                    Heropenen
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
