import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';

const POLL_MS = 60_000;

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'zojuist';
  if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} u geleden`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d geleden`;
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

export default function NotificationCenter() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/mine');
      setItems(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  const handleClick = async (n) => {
    setOpen(false);
    if (!n.read) {
      try { await api.patch(`/notifications/${n.id}/read`); } catch { /* silent */ }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.listingId) navigate(`/aanbieding/${n.listingId}`);
  };

  const markAllRead = async () => {
    try { await api.patch('/notifications/read-all'); } catch { /* silent */ }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 hover:bg-muted transition-colors"
        aria-label="Notificaties"
        data-testid="notif-bell"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full"
            data-testid="notif-bell-badge"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 bg-surface border border-border shadow-lg z-50"
          data-testid="notif-dropdown"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm">Notificaties</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="notif-mark-all-read"
              >
                Markeer alles als gelezen
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center" data-testid="notif-empty">
              Geen notificaties.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {items.slice(0, 10).map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    data-testid={`notif-item-${n.id}`}
                    className={`block w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                      n.read ? '' : 'border-l-2 border-[#34D399] bg-muted/30'
                    }`}
                  >
                    <p className={`text-sm ${n.read ? 'text-foreground/75' : 'text-foreground font-medium'}`}>
                      {n.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border">
            <Link
              to="/notificaties"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-sm text-center hover:bg-muted transition-colors industrial-link"
              data-testid="notif-view-all"
            >
              Bekijk alle notificaties →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
