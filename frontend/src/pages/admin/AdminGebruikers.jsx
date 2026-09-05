import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';

const ROLES = ['user', 'admin', 'donateur'];
const USER_STATUSES = ['pending', 'validated', 'rejected'];

export default function AdminGebruikers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [filterValue, setFilterValue] = useState(''); // '' | 'status:validated' | 'status:pending' | 'role:admin' | 'role:user' | 'role:donateur'
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  const load = (query = '', filterVal = filterValue, currentPage = 0) => {
    const params = { skip: currentPage * LIMIT, limit: LIMIT };
    if (query.length >= 2) params.q = query;
    if (filterVal) {
      const [kind, value] = filterVal.split(':');
      if (kind === 'status') params.status = value;
      if (kind === 'role') params.role = value;
    }
    api.get('/admin/users', { params })
      .then(({ data }) => {
        setUsers(data.items);
        setTotal(data.total);
      })
      .catch(() => {});
  };

  useEffect(() => { load(q, filterValue, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPage(0);
    const t = setTimeout(() => load(q, filterValue, 0), 300);
    return () => clearTimeout(t);
  }, [q, filterValue]); // eslint-disable-line react-hooks/exhaustive-deps

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
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          data-testid="admin-gebruikers-filter-status"
        >
          <option value="">Alle statussen</option>
          <option value="status:validated">Gevalideerd</option>
          <option value="status:pending">In afwachting</option>
          <option value="role:admin">Admin</option>
          <option value="role:user">User</option>
          <option value="role:donateur">Donateur</option>
        </select>
        {filterValue && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setFilterValue('')}
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
                ? <Link to={`/organisaties/${u.organisationSlug || u.organisationId}`} className="hover:underline">{u.organisationName}</Link>
                : (u.role === 'donateur' ? 'Donateur' : '—')
              }
            </div>
            <div className="md:col-span-2 flex gap-2 items-center">
              <StatusBadge status={u.status} />
              <span className="text-xs text-muted-foreground">{u.role}</span>
              <span
                className="text-xs font-semibold px-1.5 py-0.5 border border-border text-muted-foreground"
                title="Taalvoorkeur"
                data-testid={`admin-user-lang-${u.id}`}
              >
                {(u.preferredLanguage || 'nl').toUpperCase()}
              </span>
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
    preferredLanguage: user.preferredLanguage || 'nl',
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="admin-user-edit-modal">
      <div className="bg-background border border-border p-8 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <p className="overline mb-2">Gebruiker bewerken</p>
        {isDonateur ? (
          <div>
            <label className="label-overline" htmlFor="admin-user-edit-username">Gebruikersnaam</label>
            <input id="admin-user-edit-username" className="input-flat w-full" value={form.username}
                   onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
        ) : (
          <>
            <div>
              <label className="label-overline" htmlFor="admin-user-edit-firstname">Voornaam</label>
              <input id="admin-user-edit-firstname" className="input-flat w-full" value={form.firstName}
                     onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label-overline" htmlFor="admin-user-edit-lastname">Achternaam</label>
              <input id="admin-user-edit-lastname" className="input-flat w-full" value={form.lastName}
                     onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <label className="label-overline" htmlFor="admin-user-edit-email">E-mail</label>
          <input id="admin-user-edit-email" className="input-flat w-full" value={form.email}
                 onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label-overline" htmlFor="admin-user-edit-phone">Telefoon</label>
          <input id="admin-user-edit-phone" className="input-flat w-full" value={form.phone}
                 onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-overline" htmlFor="admin-user-edit-role">Rol</label>
            <select id="admin-user-edit-role" className="input-flat w-full" value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label-overline" htmlFor="admin-user-edit-status">Status</label>
            <select id="admin-user-edit-status" className="input-flat w-full" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label-overline" htmlFor="admin-user-edit-language">Taalvoorkeur</label>
          <select id="admin-user-edit-language" className="input-flat w-full" value={form.preferredLanguage}
                  onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
                  data-testid="admin-user-edit-language">
            <option value="nl">Nederlands</option>
            <option value="fr">Français</option>
          </select>
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
