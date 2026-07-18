import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { formatDateNL } from './Nieuws';

const NIEUWS_CATEGORIES = ['nieuws', 'helpende_handen', 'opleiding'];
const INSPIRATIE_CATEGORIES = ['artikel', 'partner_project', 'documentatie'];
const GALLERY_CATEGORIES = ['artikel', 'partner_project'];
const MAX_GALLERY = 10;

const CATEGORY_LABELS = {
  nieuws: 'Nieuws',
  helpende_handen: 'Helpende handen / Coup de main',
  opleiding: 'Opleiding',
  artikel: 'Artikel',
  partner_project: 'Project van partner',
  documentatie: 'Documentatie',
};

const EMPTY = {
  postType: 'nieuws',
  category: 'nieuws',
  languages: ['nl'],
  photo: '',
  titleNl: '',
  titleFr: '',
  contentNl: '',
  contentFr: '',
  photos: [],
  link: '',
};

export default function AdminNieuws() {
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | post object
  const [form, setForm] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/news');
      setPosts(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing('new'); setError(''); };

  const startEdit = (p) => {
    setForm({
      postType: p.postType,
      category: p.category,
      languages: p.languages && p.languages.length ? p.languages : ['nl'],
      photo: p.photo || '',
      titleNl: p.titleNl || '',
      titleFr: p.titleFr || '',
      contentNl: p.contentNl || '',
      contentFr: p.contentFr || '',
      photos: p.photos || [],
      link: p.link || '',
    });
    setEditing(p);
    setError('');
  };

  const cancel = () => { setEditing(null); setForm(EMPTY); setError(''); };

  const toggleLanguage = (lang) => {
    setForm((f) => {
      const has = f.languages.includes(lang);
      const next = has ? f.languages.filter((l) => l !== lang) : [...f.languages, lang];
      return { ...f, languages: next };
    });
  };

  const switchPostType = (postType) => {
    setForm({
      ...EMPTY,
      postType,
      category: postType === 'nieuws' ? 'nieuws' : 'artikel',
    });
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const url = await uploadToCloudinary(file);
      setForm((f) => ({ ...f, photo: url }));
    } catch (err) {
      setError(formatApiError(err) || 'Upload mislukt.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = MAX_GALLERY - form.photos.length;
    if (room <= 0) {
      setError(`Maximaal ${MAX_GALLERY} foto's toegelaten.`);
      e.target.value = '';
      return;
    }
    const toUpload = files.slice(0, room);
    setUploading(true); setError('');
    try {
      const urls = [];
      for (const file of toUpload) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadToCloudinary(file);
        urls.push(url);
      }
      setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }));
    } catch (err) {
      setError(formatApiError(err) || 'Upload mislukt.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeGalleryPhoto = (url) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== url) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      let payload;
      if (form.postType === 'nieuws') {
        if (form.languages.length === 0) {
          throw new Error('Kies minstens één taal (NL en/of FR).');
        }
        payload = {
          postType: 'nieuws',
          category: form.category,
          languages: form.languages,
          photo: form.photo || null,
        };
        if (form.languages.includes('nl')) {
          payload.titleNl = form.titleNl.trim();
          payload.contentNl = form.contentNl.trim();
        }
        if (form.languages.includes('fr')) {
          payload.titleFr = form.titleFr.trim();
          payload.contentFr = form.contentFr.trim();
        }
      } else {
        payload = {
          postType: 'inspiratie',
          category: form.category,
          titleNl: form.titleNl.trim(),
          titleFr: form.titleFr.trim(),
          contentNl: form.contentNl.trim(),
          contentFr: form.contentFr.trim(),
        };
        if (GALLERY_CATEGORIES.includes(form.category)) {
          payload.photos = form.photos;
        } else if (form.category === 'documentatie') {
          payload.photo = form.photo || null;
          payload.link = form.link.trim();
        }
      }
      if (editing === 'new') await api.post('/news', payload);
      else await api.put(`/news/${editing.id}`, payload);
      await load();
      cancel();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (post) => {
    const label = post.titleNl || post.titleFr;
    if (!window.confirm(`Bericht "${label}" verwijderen?`)) return;
    try {
      await api.delete(`/news/${post.id}`);
      await load();
    } catch (err) {
      alert(formatApiError(err));
    }
  };

  const categories = form.postType === 'nieuws' ? NIEUWS_CATEGORIES : INSPIRATIE_CATEGORIES;

  return (
    <section className="mt-16" data-testid="admin-nieuws-section">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <p className="overline">Nieuws &amp; Inspiratie · {posts.length}</p>
        {!editing && (
          <button onClick={startNew} className="btn-primary !py-2 text-xs" data-testid="admin-nieuws-new-btn">
            + Nieuwe post
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="border border-foreground bg-surface p-5 mb-8 space-y-4" data-testid="admin-nieuws-form">
          <div>
            <label className="label-overline">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => switchPostType('nieuws')}
                className={`px-4 py-2 text-sm border ${form.postType === 'nieuws' ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground/70'}`}
                data-testid="admin-nieuws-type-nieuws"
              >
                Nieuws
              </button>
              <button
                type="button"
                onClick={() => switchPostType('inspiratie')}
                className={`px-4 py-2 text-sm border ${form.postType === 'inspiratie' ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground/70'}`}
                data-testid="admin-nieuws-type-inspiratie"
              >
                Inspiratie
              </button>
            </div>
          </div>

          <div>
            <label className="label-overline">Categorie</label>
            <select
              className="input-flat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              data-testid="admin-nieuws-category"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {form.postType === 'nieuws' ? (
            <>
              <div>
                <label className="label-overline">Talen</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.languages.includes('nl')}
                      onChange={() => toggleLanguage('nl')}
                      data-testid="admin-nieuws-lang-nl"
                    />
                    Nederlands
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.languages.includes('fr')}
                      onChange={() => toggleLanguage('fr')}
                      data-testid="admin-nieuws-lang-fr"
                    />
                    Français
                  </label>
                </div>
                {form.languages.length === 0 && (
                  <p className="text-xs text-destructive mt-1">Kies minstens één taal.</p>
                )}
              </div>

              <div>
                <label className="label-overline">Foto <span className="text-muted-foreground normal-case">(optioneel)</span></label>
                {form.photo ? (
                  <div className="flex items-start gap-3">
                    <img src={form.photo} alt="" className="w-32 h-32 object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, photo: '' })}
                      className="btn-secondary !py-1 text-xs"
                      data-testid="admin-nieuws-photo-remove"
                    >
                      Verwijder
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    data-testid="admin-nieuws-photo-input"
                    className="text-sm"
                  />
                )}
                {uploading && <p className="text-xs text-muted-foreground mt-1">Uploaden…</p>}
              </div>

              {form.languages.includes('nl') && (
                <>
                  <div>
                    <label className="label-overline">Titel (NL)</label>
                    <input
                      type="text"
                      className="input-flat"
                      value={form.titleNl}
                      maxLength={100}
                      onChange={(e) => setForm({ ...form, titleNl: e.target.value })}
                      required
                      data-testid="admin-nieuws-title-nl"
                    />
                  </div>
                  <div>
                    <label className="label-overline">Inhoud (NL)</label>
                    <textarea
                      rows={10}
                      className="input-flat font-normal"
                      value={form.contentNl}
                      maxLength={5000}
                      onChange={(e) => setForm({ ...form, contentNl: e.target.value })}
                      required
                      data-testid="admin-nieuws-content-nl"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{form.contentNl.length}/5000</p>
                  </div>
                </>
              )}

              {form.languages.includes('fr') && (
                <>
                  <div>
                    <label className="label-overline">Titel (FR)</label>
                    <input
                      type="text"
                      className="input-flat"
                      value={form.titleFr}
                      maxLength={100}
                      onChange={(e) => setForm({ ...form, titleFr: e.target.value })}
                      required
                      data-testid="admin-nieuws-title-fr"
                    />
                  </div>
                  <div>
                    <label className="label-overline">Inhoud (FR)</label>
                    <textarea
                      rows={10}
                      className="input-flat font-normal"
                      value={form.contentFr}
                      maxLength={5000}
                      onChange={(e) => setForm({ ...form, contentFr: e.target.value })}
                      required
                      data-testid="admin-nieuws-content-fr"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{form.contentFr.length}/5000</p>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="label-overline">Titel (NL)</label>
                <input
                  type="text"
                  className="input-flat"
                  value={form.titleNl}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, titleNl: e.target.value })}
                  required
                  data-testid="admin-inspiratie-title-nl"
                />
              </div>
              <div>
                <label className="label-overline">Titel (FR)</label>
                <input
                  type="text"
                  className="input-flat"
                  value={form.titleFr}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, titleFr: e.target.value })}
                  required
                  data-testid="admin-inspiratie-title-fr"
                />
              </div>

              {GALLERY_CATEGORIES.includes(form.category) && (
                <div>
                  <label className="label-overline">
                    Foto's <span className="text-muted-foreground normal-case">(max {MAX_GALLERY}, {form.photos.length}/{MAX_GALLERY})</span>
                  </label>
                  {form.photos.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-2">
                      {form.photos.map((url) => (
                        <div key={url} className="relative">
                          <img src={url} alt="" className="w-full aspect-square object-cover border border-border" />
                          <button
                            type="button"
                            onClick={() => removeGalleryPhoto(url)}
                            className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {form.photos.length < MAX_GALLERY && (
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGalleryUpload}
                      disabled={uploading}
                      data-testid="admin-inspiratie-gallery-input"
                      className="text-sm"
                    />
                  )}
                  {uploading && <p className="text-xs text-muted-foreground mt-1">Uploaden…</p>}
                </div>
              )}

              {form.category === 'documentatie' && (
                <>
                  <div>
                    <label className="label-overline">Foto <span className="text-muted-foreground normal-case">(optioneel)</span></label>
                    {form.photo ? (
                      <div className="flex items-start gap-3">
                        <img src={form.photo} alt="" className="w-32 h-32 object-cover border border-border" />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, photo: '' })}
                          className="btn-secondary !py-1 text-xs"
                        >
                          Verwijder
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        disabled={uploading}
                        data-testid="admin-inspiratie-photo-input"
                        className="text-sm"
                      />
                    )}
                    {uploading && <p className="text-xs text-muted-foreground mt-1">Uploaden…</p>}
                  </div>

                  <div>
                    <label className="label-overline">Link naar document</label>
                    <input
                      type="url"
                      className="input-flat"
                      placeholder="https://drive.google.com/…"
                      value={form.link}
                      onChange={(e) => setForm({ ...form, link: e.target.value })}
                      required
                      data-testid="admin-inspiratie-link"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="label-overline">
                  {form.category === 'documentatie' ? 'Beschrijving (NL)' : 'Inhoud (NL)'}
                </label>
                <textarea
                  rows={8}
                  className="input-flat font-normal"
                  value={form.contentNl}
                  maxLength={5000}
                  onChange={(e) => setForm({ ...form, contentNl: e.target.value })}
                  required
                  data-testid="admin-inspiratie-content-nl"
                />
                <p className="text-xs text-muted-foreground mt-1">{form.contentNl.length}/5000</p>
              </div>

              <div>
                <label className="label-overline">
                  {form.category === 'documentatie' ? 'Beschrijving (FR)' : 'Inhoud (FR)'}
                </label>
                <textarea
                  rows={8}
                  className="input-flat font-normal"
                  value={form.contentFr}
                  maxLength={5000}
                  onChange={(e) => setForm({ ...form, contentFr: e.target.value })}
                  required
                  data-testid="admin-inspiratie-content-fr"
                />
                <p className="text-xs text-muted-foreground mt-1">{form.contentFr.length}/5000</p>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="admin-nieuws-error">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={saving || uploading} className="btn-primary !py-2" data-testid="admin-nieuws-save">
              {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary !py-2" data-testid="admin-nieuws-cancel">
              Annuleren
            </button>
          </div>
        </form>
      )}

      {posts.length === 0 && !editing && (
        <p className="text-muted-foreground" data-testid="admin-nieuws-empty">Nog geen berichten.</p>
      )}

      <ul className="divide-y divide-border border-y border-border">
        {posts.map((p) => {
          const displayTitle = p.titleNl || p.titleFr;
          const typeLabel = p.postType === 'nieuws' ? 'Nieuws' : 'Inspiratie';
          const langLabel = p.postType === 'nieuws' && p.languages
            ? p.languages.map((l) => l.toUpperCase()).join(' + ')
            : null;
          return (
            <li key={p.id} className="py-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-start" data-testid={`admin-nieuws-item-${p.id}`}>
              <div className="md:col-span-8">
                <p className="font-medium">{displayTitle}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                  {typeLabel} · {CATEGORY_LABELS[p.category]} · {formatDateNL(p.createdAt)}
                  {langLabel ? ` · ${langLabel}` : ''}
                </p>
              </div>
              <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
                <button
                  onClick={() => startEdit(p)}
                  className="btn-secondary !py-2 text-xs"
                  data-testid={`admin-nieuws-edit-${p.id}`}
                >
                  Bewerken
                </button>
                <button
                  onClick={() => remove(p)}
                  data-testid={`admin-nieuws-delete-${p.id}`}
                  className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-xs font-medium tracking-wide transition-all duration-200 hover:bg-red-700 hover:-translate-y-0.5"
                  style={{ borderRadius: 2 }}
                >
                  Verwijderen
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
