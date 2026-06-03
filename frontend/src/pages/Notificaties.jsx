import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatApiError } from '@/lib/api';

function formatDateNL(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-BE', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Notificaties() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/mine');
      setItems(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClick = async (n) => {
    if (!n.read) {
      try { await api.patch(`/notifications/${n.id}/read`); } catch { /* silent */ }
    }
    if (n.listingId) navigate(`/aanbieding/${n.listingId}`);
  };

  const remove = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setItems((p) => p.filter((n) => n.id !== id));
    } catch (e) { alert(formatApiError(e)); }
  };

  const clearAll = async () => {
    if (!window.confirm('Alle notificaties verwijderen?')) return;
    try {
      await api.delete('/notifications/clear-all');
      setItems([]);
    } catch (e) { alert(formatApiError(e)); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid="notificaties-page">
      <div className="flex items-end justify-between mb-10 gap-4">
        <div>
          <p className="overline mb-2">Centrum</p>
          <h1 className="text-4xl font-bold tracking-tight">Notificaties</h1>
        </div>
        {items && items.length > 0 && (
          <button
            onClick={clearAll}
            className="btn-secondary !py-2 text-xs"
            data-testid="notif-clear-all"
          >
            Verwijder alles
          </button>
        )}
      </div>

      {error && <p className="text-destructive" data-testid="notif-error">{error}</p>}
      {items === null && !error && <p className="text-muted-foreground">Laden…</p>}
      {items && items.length === 0 && (
        <p className="text-muted-foreground" data-testid="notif-page-empty">Geen notificaties.</p>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((n) => (
            <li
              key={n.id}
              data-testid={`notif-page-item-${n.id}`}
              className={`py-4 flex gap-4 items-start ${n.read ? '' : 'border-l-2 border-[#34D399] pl-4'}`}
            >
              <div
                onClick={() => handleClick(n)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleClick(n); }}
                className="flex-1 cursor-pointer"
              >
                <p className={`text-sm ${n.read ? 'text-foreground/75' : 'text-foreground font-medium'}`}>
                  {n.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateNL(n.createdAt)} {n.read ? '' : ' · '} {!n.read && <span className="text-[#34D399] font-medium">Nieuw</span>}
                </p>
              </div>
              <button
                onClick={() => remove(n.id)}
                className="text-muted-foreground hover:text-destructive text-lg leading-none px-2"
                data-testid={`notif-delete-${n.id}`}
                aria-label="Verwijderen"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
