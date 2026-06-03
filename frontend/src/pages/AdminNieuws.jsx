import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { CATEGORY_LABELS, formatDateNL } from './Nieuws';

const CATEGORIES = ['evenement', 'artikel', 'giveaway', 'opleidingsmoment', 'oproep', 'ander'];

const EMPTY = { title: '', category: 'artikel', content: '', photo: '' };

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
      title: p.title, category: p.category, content: p.content, photo: p.photo || '',
    });
    setEditing(p);
    setError('');
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); setError(''); };

  const handleUpload = async (e) => {
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
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        content: form.content.trim(),
        photo: form.photo || null,
      };
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
    if (!window.confirm(`Bericht "${post.title}" verwijderen?`)) return;
    try {
      await api.delete(`/news/${post.id}`);
      await load();
    } catch (err) {
      alert(formatApiError(err));
    }
  };

  return (
    <section className="mt-16" data-testid="admin-nieuws-section">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <p className="overline">Nieuws · {posts.length}</p>
        {!editing && (
          <button onClick={startNew} className="btn-primary !py-2 text-xs" data-testid="admin-nieuws-new-btn">
            + Nieuwe post
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="border border-foreground bg-surface p-5 mb-8 space-y-4" data-testid="admin-nieuws-form">
          <div>
            <label className="label-overline">Categorie</label>
            <select
              className="input-flat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              data-testid="admin-nieuws-category"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-overline">Titel</label>
            <input
              type="text"
              className="input-flat"
              value={form.title}
              maxLength={100}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              data-testid="admin-nieuws-title"
            />
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
                onChange={handleUpload}
                disabled={uploading}
                data-testid="admin-nieuws-photo-input"
                className="text-sm"
              />
            )}
            {uploading && <p className="text-xs text-muted-foreground mt-1">Uploaden…</p>}
          </div>

          <div>
            <label className="label-overline">Inhoud</label>
            <textarea
              rows={10}
              className="input-flat font-normal"
              value={form.content}
              maxLength={5000}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
              data-testid="admin-nieuws-content"
            />
            <p className="text-xs text-muted-foreground mt-1">{form.content.length}/5000</p>
          </div>

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
        {posts.map((p) => (
          <li key={p.id} className="py-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-start" data-testid={`admin-nieuws-item-${p.id}`}>
            <div className="md:col-span-8">
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                {CATEGORY_LABELS[p.category]} · {formatDateNL(p.createdAt)}
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
        ))}
      </ul>
    </section>
  );
}
