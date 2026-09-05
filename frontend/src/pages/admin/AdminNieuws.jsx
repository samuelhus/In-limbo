import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { formatDateNL, EVENT_DATE_CATEGORIES } from '../Nieuws';
import RichTextEditor from '@/components/RichTextEditor';
import { stripHtml } from '@/lib/richtext';

const NIEUWS_CATEGORIES = ['nieuws', 'helpende_handen', 'opleiding', 'giveaway'];
const INSPIRATIE_CATEGORIES = ['artikel', 'partner_project', 'documentatie'];
const GALLERY_CATEGORIES = ['artikel', 'partner_project', 'documentatie'];
const MAX_GALLERY = 10;

const CATEGORY_LABELS = {
  nieuws: 'Nieuws',
  helpende_handen: 'Helpende handen / Coup de main',
  opleiding: 'Opleiding',
  giveaway: 'Giveaway',
  artikel: 'Artikel',
  partner_project: 'Project van partner',
  documentatie: 'Documentatie',
};

const EMPTY = {
  postType: 'nieuws',
  category: 'nieuws',
  languages: ['nl'],
  photo: '',
  eventDate: '',
  titleNl: '',
  titleFr: '',
  contentNl: '',
  contentFr: '',
  photos: [],
  link: '',
  tags: [],
};

export default function AdminNieuws() {
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | post object
  const [form, setForm] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [tagToAdd, setTagToAdd] = useState('');
  const [tagsModalOpen, setTagsModalOpen] = useState(false);

  const loadTags = async () => {
    try {
      const { data } = await api.get('/tags');
      setAllTags(data);
    } catch (e) {
      // Stil falen — tags zijn niet kritiek voor de rest van het scherm.
      // eslint-disable-next-line no-console
      console.error('Tags laden mislukt:', e);
    }
  };

  const load = async () => {
    try {
      const { data } = await api.get('/news');
      setPosts(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  useEffect(() => { load(); loadTags(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing('new'); setError(''); };

  const startEdit = (p) => {
    setForm({
      postType: p.postType,
      category: p.category,
      languages: p.languages && p.languages.length ? p.languages : ['nl'],
      photo: p.photo || '',
      eventDate: p.eventDate || '',
      titleNl: p.titleNl || '',
      titleFr: p.titleFr || '',
      contentNl: p.contentNl || '',
      contentFr: p.contentFr || '',
      photos: p.photos || [],
      link: p.link || '',
      tags: p.tags || [],
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

  const addTagToForm = () => {
    if (!tagToAdd) return;
    if (form.tags.includes(tagToAdd)) { setTagToAdd(''); return; }
    setForm((f) => ({ ...f, tags: [...f.tags, tagToAdd] }));
    setTagToAdd('');
  };

  const removeTagFromForm = (tagId) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tagId) }));
  };

  const tagLabel = (tagId) => {
    const tag = allTags.find((t) => t.id === tagId);
    return tag ? `${tag.nameNl} / ${tag.nameFr}` : tagId;
  };

  // Tags die nog niet aan de huidige post gekoppeld zijn — enkel die tonen
  // we in de "toevoegen"-dropdown, anders zou je dezelfde tag dubbel kunnen
  // selecteren.
  const availableTagsToAdd = allTags.filter((t) => !form.tags.includes(t.id));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      let payload;
      if (form.postType === 'nieuws') {
        if (form.languages.length === 0) {
          throw new Error('Kies minstens één taal (NL en/of FR).');
        }
        if (form.languages.includes('nl') && !stripHtml(form.contentNl)) {
          throw new Error('Inhoud (NL) mag niet leeg zijn.');
        }
        if (form.languages.includes('fr') && !stripHtml(form.contentFr)) {
          throw new Error('Inhoud (FR) mag niet leeg zijn.');
        }
        if (EVENT_DATE_CATEGORIES.includes(form.category) && !form.eventDate) {
          throw new Error('Datum van het evenement is verplicht voor deze categorie.');
        }
        payload = {
          postType: 'nieuws',
          category: form.category,
          languages: form.languages,
          photo: form.photos[0] || null,
          photos: form.photos,
          eventDate: EVENT_DATE_CATEGORIES.includes(form.category) ? form.eventDate : null,
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
        if (!stripHtml(form.contentNl)) {
          throw new Error('Inhoud (NL) mag niet leeg zijn.');
        }
        if (!stripHtml(form.contentFr)) {
          throw new Error('Inhoud (FR) mag niet leeg zijn.');
        }
        payload = {
          postType: 'inspiratie',
          category: form.category,
          titleNl: form.titleNl.trim(),
          titleFr: form.titleFr.trim(),
          contentNl: form.contentNl.trim(),
          contentFr: form.contentFr.trim(),
          tags: form.tags,
        };
        if (GALLERY_CATEGORIES.includes(form.category)) {
          payload.photos = form.photos;
        }
        if (form.category === 'documentatie') {
          payload.link = form.link.trim() || null;
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
              {form.postType === 'inspiratie' && (
                <button
                  type="button"
                  onClick={() => setTagsModalOpen(true)}
                  className="px-4 py-2 text-sm border border-border text-foreground/70 hover:border-foreground"
                  data-testid="admin-nieuws-manage-tags-btn"
                >
                  🏷 Tags beheren
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="label-overline" htmlFor="admin-nieuws-category">Categorie</label>
            <select
              id="admin-nieuws-category"
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

          {form.postType === 'nieuws' && EVENT_DATE_CATEGORIES.includes(form.category) && (
            <div>
              <label className="label-overline" htmlFor="admin-nieuws-event-date">
                Datum evenement <span className="text-muted-foreground normal-case">(verplicht voor deze categorie — wordt op de site getoond i.p.v. de publicatiedatum)</span>
              </label>
              <input
                id="admin-nieuws-event-date"
                type="date"
                className="input-flat"
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                required
                data-testid="admin-nieuws-event-date"
              />
            </div>
          )}

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
                <label className="label-overline">
                  Foto's <span className="text-muted-foreground normal-case">(max {MAX_GALLERY}, {form.photos.length}/{MAX_GALLERY} — eerste foto is de thumbnail)</span>
                </label>
                {form.photos.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-2">
                    {form.photos.map((url, i) => (
                      <div key={url} className="relative">
                        <img src={url} alt="" className="w-full aspect-square object-cover border border-border" />
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 uppercase tracking-wide">
                            Thumbnail
                          </span>
                        )}
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
                    data-testid="admin-nieuws-gallery-input"
                    className="text-sm"
                  />
                )}
                {uploading && <p className="text-xs text-muted-foreground mt-1">Uploaden…</p>}
              </div>

              {form.languages.includes('nl') && (
                <>
                  <div>
                    <label className="label-overline" htmlFor="admin-nieuws-title-nl">Titel (NL)</label>
                    <input
                      id="admin-nieuws-title-nl"
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
                    <RichTextEditor
                      value={form.contentNl}
                      onChange={(html) => setForm({ ...form, contentNl: html })}
                      maxLength={5000}
                      testId="admin-nieuws-content-nl"
                    />
                  </div>
                </>
              )}

              {form.languages.includes('fr') && (
                <>
                  <div>
                    <label className="label-overline" htmlFor="admin-nieuws-title-fr">Titel (FR)</label>
                    <input
                      id="admin-nieuws-title-fr"
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
                    <RichTextEditor
                      value={form.contentFr}
                      onChange={(html) => setForm({ ...form, contentFr: html })}
                      maxLength={5000}
                      testId="admin-nieuws-content-fr"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="label-overline" htmlFor="admin-inspiratie-title-nl">Titel (NL)</label>
                <input
                  id="admin-inspiratie-title-nl"
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
                <label className="label-overline" htmlFor="admin-inspiratie-title-fr">Titel (FR)</label>
                <input
                  id="admin-inspiratie-title-fr"
                  type="text"
                  className="input-flat"
                  value={form.titleFr}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, titleFr: e.target.value })}
                  required
                  data-testid="admin-inspiratie-title-fr"
                />
              </div>

              <div>
                <label className="label-overline">
                  Tags <span className="text-muted-foreground normal-case">(optioneel, geen limiet)</span>
                </label>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.tags.map((tagId) => (
                      <span
                        key={tagId}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-secondary border border-border"
                        data-testid={`admin-inspiratie-tag-chip-${tagId}`}
                      >
                        {tagLabel(tagId)}
                        <button
                          type="button"
                          onClick={() => removeTagFromForm(tagId)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Tag verwijderen"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    className="input-flat flex-1"
                    value={tagToAdd}
                    onChange={(e) => setTagToAdd(e.target.value)}
                    data-testid="admin-inspiratie-tag-select"
                  >
                    <option value="">— Kies een tag —</option>
                    {availableTagsToAdd.map((t) => (
                      <option key={t.id} value={t.id}>{t.nameNl} / {t.nameFr}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addTagToForm}
                    disabled={!tagToAdd}
                    className="btn-secondary !py-2 px-4 text-xs disabled:opacity-40"
                    data-testid="admin-inspiratie-tag-add"
                  >
                    Toevoegen
                  </button>
                </div>
                {allTags.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Nog geen tags aangemaakt. Klik op "🏷 Tags beheren" hierboven om er een aan te maken.
                  </p>
                )}
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
                <div>
                  <label className="label-overline" htmlFor="admin-inspiratie-link">
                    Link naar document <span className="text-muted-foreground normal-case">(optioneel)</span>
                  </label>
                  <input
                    id="admin-inspiratie-link"
                    type="url"
                    className="input-flat"
                    placeholder="https://drive.google.com/…"
                    value={form.link}
                    onChange={(e) => setForm({ ...form, link: e.target.value })}
                    data-testid="admin-inspiratie-link"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optioneel — enkel nodig voor een extern document (bv. PDF). Video, audio en afbeeldingen kan je hieronder rechtstreeks in de tekst invoegen.
                  </p>
                </div>
              )}

              <div>
                <label className="label-overline">
                  {form.category === 'documentatie' ? 'Beschrijving (NL)' : 'Inhoud (NL)'}
                </label>
                <RichTextEditor
                  value={form.contentNl}
                  onChange={(html) => setForm({ ...form, contentNl: html })}
                  maxLength={5000}
                  testId="admin-inspiratie-content-nl"
                />
              </div>

              <div>
                <label className="label-overline">
                  {form.category === 'documentatie' ? 'Beschrijving (FR)' : 'Inhoud (FR)'}
                </label>
                <RichTextEditor
                  value={form.contentFr}
                  onChange={(html) => setForm({ ...form, contentFr: html })}
                  maxLength={5000}
                  testId="admin-inspiratie-content-fr"
                />
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
                  {EVENT_DATE_CATEGORIES.includes(p.category) && p.eventDate ? ` · Evenement: ${formatDateNL(p.eventDate)}` : ''}
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

      {tagsModalOpen && (
        <AdminTagsModal
          tags={allTags}
          onClose={() => setTagsModalOpen(false)}
          onChanged={loadTags}
        />
      )}
    </section>
  );
}

function AdminTagsModal({ tags, onClose, onChanged }) {
  const [newNl, setNewNl] = useState('');
  const [newFr, setNewFr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editNl, setEditNl] = useState('');
  const [editFr, setEditFr] = useState('');

  const createTag = async (e) => {
    e.preventDefault();
    if (!newNl.trim() || !newFr.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.post('/admin/tags', { nameNl: newNl.trim(), nameFr: newFr.trim() });
      setNewNl(''); setNewFr('');
      await onChanged();
    } catch (e2) {
      setErr(formatApiError(e2));
    } finally {
      setBusy(false);
    }
  };

  const startEditTag = (t) => {
    setEditingId(t.id);
    setEditNl(t.nameNl);
    setEditFr(t.nameFr);
  };

  const saveEditTag = async (tagId) => {
    if (!editNl.trim() || !editFr.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.patch(`/admin/tags/${tagId}`, { nameNl: editNl.trim(), nameFr: editFr.trim() });
      setEditingId(null);
      await onChanged();
    } catch (e2) {
      setErr(formatApiError(e2));
    } finally {
      setBusy(false);
    }
  };

  const deleteTag = async (tag) => {
    if (!window.confirm(`Tag "${tag.nameNl} / ${tag.nameFr}" verwijderen? Dit haalt de tag ook weg bij alle posts die hem gebruiken.`)) return;
    setBusy(true); setErr('');
    try {
      await api.delete(`/admin/tags/${tag.id}`);
      await onChanged();
    } catch (e2) {
      setErr(formatApiError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="admin-tags-modal">
      <div className="bg-background border border-border p-8 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <p className="overline">Tags beheren</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none" aria-label="Sluiten">×</button>
        </div>

        {err && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="admin-tags-error">
            {err}
          </p>
        )}

        <ul className="divide-y divide-border border-y border-border">
          {tags.length === 0 && (
            <li className="py-4 text-sm text-muted-foreground">Nog geen tags aangemaakt.</li>
          )}
          {tags.map((t) => (
            <li key={t.id} className="py-3" data-testid={`admin-tag-row-${t.id}`}>
              {editingId === t.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      className="input-flat flex-1"
                      value={editNl}
                      onChange={(e) => setEditNl(e.target.value)}
                      placeholder="NL"
                      maxLength={50}
                    />
                    <input
                      className="input-flat flex-1"
                      value={editFr}
                      onChange={(e) => setEditFr(e.target.value)}
                      placeholder="FR"
                      maxLength={50}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEditTag(t.id)}
                      disabled={busy}
                      className="btn-primary !py-1 px-3 text-xs"
                      data-testid={`admin-tag-save-${t.id}`}
                    >
                      Opslaan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="btn-secondary !py-1 px-3 text-xs"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{t.nameNl} <span className="text-muted-foreground">/ {t.nameFr}</span></span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditTag(t)}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      data-testid={`admin-tag-edit-${t.id}`}
                    >
                      Hernoemen
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTag(t)}
                      disabled={busy}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                      data-testid={`admin-tag-delete-${t.id}`}
                    >
                      Verwijderen
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={createTag} className="space-y-2 pt-2">
          <p className="label-overline">Nieuwe tag</p>
          <div className="flex gap-2">
            <input
              className="input-flat flex-1"
              value={newNl}
              onChange={(e) => setNewNl(e.target.value)}
              placeholder="Naam (NL) — bv. Spel"
              maxLength={50}
              data-testid="admin-tag-new-nl"
            />
            <input
              className="input-flat flex-1"
              value={newFr}
              onChange={(e) => setNewFr(e.target.value)}
              placeholder="Naam (FR) — bv. Jeu"
              maxLength={50}
              data-testid="admin-tag-new-fr"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !newNl.trim() || !newFr.trim()}
            className="btn-primary !py-2 text-xs disabled:opacity-40"
            data-testid="admin-tag-create-btn"
          >
            + Tag aanmaken
          </button>
        </form>

        <div className="pt-2">
          <button onClick={onClose} className="btn-secondary w-full">Sluiten</button>
        </div>
      </div>
    </div>
  );
}
