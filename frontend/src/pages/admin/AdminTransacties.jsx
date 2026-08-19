import React, { useEffect, useState, useCallback } from 'react';
import { api, formatApiError } from '@/lib/api';

const TX_TYPE_LABEL = {
  platform: 'Aanbieding',
  checkin: 'Checkin',
  checkout: 'Checkout',
};

const TX_TYPE_BADGE_CLASS = {
  platform: 'bg-[#ADEBB3] text-foreground',
  checkin: 'bg-blue-100 text-blue-900',
  checkout: 'bg-amber-100 text-amber-900',
};

export default function AdminTransacties() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [type, setType] = useState('');
  const [photoFilter, setPhotoFilter] = useState('');
  const [receiverSearch, setReceiverSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const limit = 50;

  const load = useCallback(async (currentSkip, currentType, currentPhotoFilter, currentReceiverSearch) => {
    setLoading(true);
    try {
      const params = { skip: currentSkip, limit };
      if (currentType) params.type = currentType;
      if (currentPhotoFilter) params.photoReceived = currentPhotoFilter;
      if (currentReceiverSearch) params.receiverSearch = currentReceiverSearch;
      const { data } = await api.get('/admin/transactions', { params });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      load(skip, type, photoFilter, receiverSearch);
    }, receiverSearch ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, skip, type, photoFilter, receiverSearch]);

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('nl-BE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

  const undo = async (row) => {
    const label = row.type === 'checkin' ? 'deze checkin' : 'deze checkout';
    if (!window.confirm(`Weet je zeker dat je ${label} definitief wil verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    setBusyId(row.id);
    try {
      await api.delete(`/admin/transactions/${row.type}/${row.id}`);
      await load(skip, type, photoFilter, receiverSearch);
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusyId(null);
    }
  };

  const togglePhotoReceived = async (row) => {
    const next = !row.photoReceived;
    setItems((prev) => prev.map((it) => (
      it.type === row.type && it.id === row.id ? { ...it, photoReceived: next } : it
    )));
    try {
      await api.patch(`/admin/transactions/${row.type}/${row.id}/photo-received`, { received: next });
    } catch (e) {
      alert(formatApiError(e));
      setItems((prev) => prev.map((it) => (
        it.type === row.type && it.id === row.id ? { ...it, photoReceived: !next } : it
      )));
    }
  };

  return (
    <div data-testid="admin-transacties">
      <p className="overline mb-4">Overzicht</p>
      <h2 className="text-2xl font-bold tracking-tight mb-6">Transacties</h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: '', label: 'Alles' },
          { key: 'platform', label: 'Aanbiedingen' },
          { key: 'checkin', label: 'Checkins' },
          { key: 'checkout', label: 'Checkouts' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setType(f.key); setSkip(0); }}
            className={`px-3 py-1.5 text-xs border transition-colors ${
              type === f.key ? 'bg-foreground text-background border-foreground' : 'border-border hover:border-foreground'
            }`}
            data-testid={`tx-filter-${f.key || 'alles'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: '', label: 'Foto: alle' },
          { key: 'yes', label: 'Foto ontvangen: ja' },
          { key: 'no', label: 'Foto ontvangen: nee' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setPhotoFilter(f.key); setSkip(0); }}
            className={`px-3 py-1.5 text-xs border transition-colors ${
              photoFilter === f.key ? 'bg-foreground text-background border-foreground' : 'border-border hover:border-foreground'
            }`}
            data-testid={`tx-photo-filter-${f.key || 'alle'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-6 max-w-sm">
        <input
          type="text"
          value={receiverSearch}
          onChange={(e) => { setReceiverSearch(e.target.value); setSkip(0); }}
          placeholder="Zoek op ontvanger…"
          className="w-full border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground"
          data-testid="tx-receiver-search"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen transacties gevonden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-y border-border" data-testid="tx-table">
            <thead>
              <tr className="text-left border-b border-border text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Van</th>
                <th className="py-2 pr-3 font-medium">Naar</th>
                <th className="py-2 pr-3 font-medium">Materiaal</th>
                <th className="py-2 pr-3 font-medium text-right">Gewicht</th>
                <th className="py-2 pr-3 font-medium">Foto</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={`${row.type}-${row.id}`} className="border-b border-border/60" data-testid={`tx-row-${row.type}-${row.id}`}>
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{formatDate(row.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 text-xs ${TX_TYPE_BADGE_CLASS[row.type] || ''}`}>
                      {TX_TYPE_LABEL[row.type] || row.type}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.fromOrgName || '—'}</td>
                  <td className="py-2 pr-3">
                    {row.toOrgName || '—'}
                    {row.checkoutBy === 'student' && (
                      <span className="block text-xs text-muted-foreground">student · {row.studentEmail}</span>
                    )}
                    {row.checkoutBy === 'user' && (
                      <span className="block text-xs text-muted-foreground">bestaande gebruiker</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {row.material || '—'}
                    {row.listingTitle && (
                      <span className="text-muted-foreground"> · {row.listingTitle}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {row.weightKg != null ? `${row.weightKg} kg` : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {row.needsPhoto ? (
                      <input
                        type="checkbox"
                        checked={!!row.photoReceived}
                        onChange={() => togglePhotoReceived(row)}
                        data-testid={`tx-photo-checkbox-${row.type}-${row.id}`}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {row.canDelete && (
                      <button
                        onClick={() => undo(row)}
                        disabled={busyId === row.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        data-testid={`tx-undo-${row.type}-${row.id}`}
                      >
                        Ongedaan maken
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
            className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
          >
            ← Vorige
          </button>
          <span className="text-muted-foreground text-xs">
            {skip + 1}–{Math.min(skip + limit, total)} van {total}
          </span>
          <button
            onClick={() => setSkip(skip + limit)}
            disabled={skip + limit >= total}
            className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
          >
            Volgende →
          </button>
        </div>
      )}
    </div>
  );
}
