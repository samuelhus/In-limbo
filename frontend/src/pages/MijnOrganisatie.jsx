import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToCloudinary, cloudinaryThumb } from '@/lib/cloudinary';

const CATS = [
  'Beeldende kunsten', 'Jeugdwerk', 'Podiumkunsten', 'Squat',
  'Sociaal werk', 'Sport', 'Educatie', 'Ander',
];

export default function MijnOrganisatie() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const orgId = user.organisationId;
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    api.get(`/organisations/${orgId}`).then(({ data }) => {
      setOrg(data);
      setForm({
        name: data.name || '',
        description: data.description || '',
        category: data.category || CATS[0],
        address: data.address || '',
        website: data.website || '',
        photos: data.photos || [],
      });
    }).catch(() => setOrg(false));
  }, [orgId]);

  if (org === null || !form) return <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground">Laden…</div>;
  if (!org) return <div className="max-w-3xl mx-auto px-4 py-24">Je hebt nog geen organisatie.</div>;

  const onPhotoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const url = await uploadToCloudinary(file);
      setForm((f) => ({ ...f, photos: [...f.photos, url] }));
    } catch (er) {
      setErr(er.message || 'Upload mislukt');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (idx) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      await api.patch(`/organisations/${orgId}`, form);
      setMsg('Organisatie bijgewerkt.');
    } catch (er) {
      setErr(formatApiError(er));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-16" data-testid="mijn-organisatie-page">
      <p className="overline mb-3">{t('profile.organisation_section')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-2">{org.name}</h1>
      <Link to={`/organisaties/${orgId}`} className="btn-primary inline-block" data-testid="mijn-org-public-link">
        Bekijk publieke pagina →
      </Link>

      <form onSubmit={save} className="mt-10 space-y-5">
        <div>
          <label className="label-overline">Naam</label>
          <input className="input-flat" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} data-testid="org-name-input" />
        </div>
        <div>
          <label className="label-overline">Beschrijving</label>
          <textarea rows={5} className="input-flat" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} data-testid="org-description-input" />
        </div>
        <div>
          <label className="label-overline">Categorie</label>
          <select className="input-flat" value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} data-testid="org-category-input">
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label-overline">Adres</label>
          <input className="input-flat" value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} data-testid="org-address-input" />
        </div>
        <div>
          <label className="label-overline">Website</label>
          <input className="input-flat" value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} data-testid="org-website-input" />
        </div>

        <div>
          <label className="label-overline">Foto's</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {form.photos.map((url, i) => (
              <div key={i} className="aspect-square relative bg-muted overflow-hidden group">
                <img src={cloudinaryThumb(url, 400, 400)} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-background/90 px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100" data-testid={`org-photo-remove-${i}`}>
                  Verwijder
                </button>
              </div>
            ))}
            <label className="aspect-square border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-foreground p-2 text-center">
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoPick} data-testid="org-photo-input" />
              {uploading ? 'Uploaden…' : '+ Foto'}
            </label>
          </div>
        </div>

        {msg && <p className="text-sm bg-green-50 border border-green-300 text-green-900 px-3 py-2" data-testid="org-save-success">{msg}</p>}
        {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="org-save-error">{err}</p>}

        <button type="submit" disabled={saving} className="btn-primary" data-testid="org-save-btn">
          {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </button>
      </form>
    </div>
  );
}
