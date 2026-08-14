import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary, cloudinaryThumb } from '@/lib/cloudinary';
import StatusBadge from '@/components/StatusBadge';

const ORG_CATEGORIES = [
  'beeldende_kunsten', 'educatie', 'jeugdwerk', 'podiumkunsten',
  'sociaal_werk', 'sport', 'noodopvang', 'ander',
];
const ORG_STATUSES = ['pending', 'active', 'inactive', 'rejected'];

export default function AdminOrganisaties() {
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
            <option key={s} value={s}>{t(`status.${s}`, { defaultValue: s })}</option>
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
                to={`/organisaties/${org.slug || org.id}`}
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
    photos: org.photos || [],
    slug: org.slug || '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const room = 5 - form.photos.length;
    if (files.length > room) {
      setUploadErr(`Je kan nog maximaal ${room} foto('s) toevoegen.`);
      return;
    }
    setUploading(true);
    setUploadErr('');
    try {
      const urls = [];
      for (const f of files) {
        urls.push(await uploadToCloudinary(f));
      }
      setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }));
    } catch (err) {
      setUploadErr(err.message || 'Foto upload mislukt.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (idx) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  };

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
          <label className="label-overline">Profiel-URL (slug)</label>
          <input className="input-flat w-full" value={form.slug}
                 placeholder="wordt automatisch aangevuld indien leeg"
                 onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <p className="text-xs text-muted-foreground mt-1">
            inlimbo.brussels/organisaties/<span className="font-mono">{form.slug || '...'}</span>
          </p>
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
            {ORG_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`, { defaultValue: s })}</option>)}
          </select>
        </div>
        <div>
          <label className="label-overline">Foto's</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {form.photos.map((url, i) => (
              <div key={i} className="relative">
                <img src={cloudinaryThumb(url, 80, 80)} alt="" className="w-20 h-20 object-cover rounded" />
                <button type="button" onClick={() => removePhoto(i)}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 text-xs leading-5">
                  ×
                </button>
              </div>
            ))}
          </div>
          {form.photos.length < 5 && (
            <label className="btn-secondary !py-1 px-3 text-xs cursor-pointer inline-block">
              {uploading ? 'Uploaden…' : '+ Foto toevoegen'}
              <input type="file" accept="image/*" multiple hidden
                     onChange={handlePhotoUpload} disabled={uploading} />
            </label>
          )}
          {uploadErr && <p className="text-sm text-destructive mt-1">{uploadErr}</p>}
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={() => onSave(org.id, form)} disabled={busy || uploading} className="btn-primary"
                  data-testid="admin-org-edit-save">Opslaan</button>
          <button onClick={onClose} className="btn-secondary">Annuleren</button>
        </div>
      </div>
    </div>
  );
}
