import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { MATERIAL_CATEGORIES } from '@/lib/materialCategories';

export default function AdminZoekertjes() {
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'match'
  const [selectedId, setSelectedId] = useState(null);

  return (
    <div data-testid="admin-zoekertjes">
      <div className="flex gap-2 mb-8 border-b border-border">
        <TabButton active={view === 'list'} onClick={() => setView('list')} testId="admin-zoekertjes-tab-list">
          Projectenlijst
        </TabButton>
        <TabButton active={view === 'match'} onClick={() => setView('match')} testId="admin-zoekertjes-tab-match">
          Materiaal-zoekblok
        </TabButton>
      </div>

      {view === 'list' && (
        <ProjectList onSelect={(id) => { setSelectedId(id); setView('detail'); }} />
      )}
      {view === 'detail' && (
        <ProjectDetail id={selectedId} onBack={() => setView('list')} />
      )}
      {view === 'match' && (
        <MatchTool onSelect={(id) => { setSelectedId(id); setView('detail'); }} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`px-4 py-3 text-sm border-b-2 transition-colors ${
        active ? 'border-foreground text-foreground font-medium' : 'border-transparent text-foreground/70 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ProjectList({ onSelect }) {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/search-requests', { params: { limit: 200 } })
      .then(({ data }) => { setItems(data.items); setTotal(data.total); })
      .catch((e) => setError(formatApiError(e)));
  }, []);

  if (items === null && !error) {
    return <p className="text-muted-foreground" data-testid="admin-zoekertjes-list-loading">Laden…</p>;
  }

  return (
    <div data-testid="admin-zoekertjes-list">
      <p className="text-sm text-muted-foreground mb-4">{total} actieve zoekertje(s), gesorteerd op kortste deadline eerst.</p>
      {error && <p className="text-destructive mb-4">{error}</p>}
      {items && items.length === 0 && <p className="text-muted-foreground">Geen actieve zoekertjes.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((sr) => (
            <li key={sr.id}>
              <button
                onClick={() => onSelect(sr.id)}
                data-testid={`admin-zoekertje-row-${sr.id}`}
                className="w-full text-left py-4 grid grid-cols-1 md:grid-cols-12 gap-2 hover:bg-[#ADEBB3]/40 transition-colors px-2"
              >
                <p className="md:col-span-4 font-medium truncate">{sr.projectName || '(geen projectnaam)'}</p>
                <p className="md:col-span-3 text-sm text-muted-foreground truncate">{sr.organisation?.name || '—'}</p>
                <p className="md:col-span-2 text-sm text-muted-foreground">
                  {sr.deadline ? new Date(sr.deadline).toLocaleDateString('nl-BE') : '—'}
                </p>
                <p className="md:col-span-3 text-sm text-foreground/70 truncate">{sr.shortDescription || ''}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectDetail({ id, onBack }) {
  const [sr, setSr] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/admin/search-requests/${id}`)
      .then(({ data }) => setSr(data))
      .catch((e) => setError(formatApiError(e)));
  }, [id]);

  const catLabel = (key) => {
    const cat = MATERIAL_CATEGORIES.find((c) => c.key === key);
    return cat ? cat.nl : key;
  };
  const subLabel = (mainKey, subKey) => {
    const cat = MATERIAL_CATEGORIES.find((c) => c.key === mainKey);
    if (!cat) return subKey;
    if (subKey === mainKey) return `${cat.nl} (algemeen)`;
    const sub = cat.subcategories.find((s) => s.key === subKey);
    return sub ? sub.nl : subKey;
  };

  const deleteRequest = async () => {
    if (!window.confirm('Dit zoekertje definitief verwijderen? Dit kan niet ongedaan gemaakt worden.')) return;
    setBusy(true);
    try {
      await api.delete(`/search-requests/${id}`);
      onBack();
    } catch (e) {
      alert(formatApiError(e));
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-zoekertje-detail">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:underline mb-6" data-testid="admin-zoekertje-detail-back">
        ← Terug naar projectenlijst
      </button>
      {error && <p className="text-destructive">{error}</p>}
      {!sr && !error && <p className="text-muted-foreground">Laden…</p>}
      {sr && (
        <div className="max-w-2xl space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{sr.projectName || '(geen projectnaam)'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Status: <em>{sr.status}</em> · Deadline: {sr.deadline ? new Date(sr.deadline).toLocaleDateString('nl-BE') : '—'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link to={`/admin/zoekertje/${sr.id}/bewerken`} className="btn-secondary !py-2" data-testid="admin-zoekertje-edit-btn">
                Bewerken
              </Link>
              <button
                onClick={deleteRequest}
                disabled={busy}
                className="btn-ghost !py-2 text-sm text-destructive hover:underline"
                data-testid="admin-zoekertje-delete-btn"
              >
                Verwijderen
              </button>
            </div>
          </div>

          <dl className="border-t border-border divide-y divide-border">
            <Row label="Organisatie" value={sr.organisation?.name} />
            <Row label="Ingediend door" value={sr.createdByUser ? `${sr.createdByUser.firstName || ''} ${sr.createdByUser.lastName || ''}`.trim() : '—'} />
            <Row label="E-mail" value={sr.createdByUser?.email} />
            <Row label="Telefoon" value={sr.createdByUser?.phone} />
            {sr.location && <Row label="Locatie" value={sr.location} />}
            {sr.projectType && <Row label="Aard project" value={sr.projectType} />}
            {sr.shortDescription && <Row label="Beschrijving" value={sr.shortDescription} />}
          </dl>

          {sr.photos?.length > 0 && (
            <div>
              <p className="label-overline mb-2">Foto's / schetsen</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {sr.photos.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full aspect-square object-cover border border-border" />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="label-overline mb-2">Gevraagd materiaal</p>
            <ul className="divide-y divide-border border-y border-border">
              {(sr.materials || []).map((m, i) => (
                <li key={i} className="py-3">
                  <p className="text-sm font-medium">{catLabel(m.hoofdcategorie)}: {subLabel(m.hoofdcategorie, m.subcategorie)}</p>
                  {m.opmerking && <p className="text-xs text-muted-foreground mt-0.5">{m.opmerking}</p>}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            Neem zelf contact op met de indiener buiten het platform. Er wordt hier niets bijgehouden over of dat al gebeurd is.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-6 py-3">
      <dt className="overline w-36 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-foreground/85 break-words">{value}</dd>
    </div>
  );
}

function MatchTool({ onSelect }) {
  const [mainCat, setMainCat] = useState('');
  const [subCat, setSubCat] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const activeCat = MATERIAL_CATEGORIES.find((c) => c.key === mainCat);

  useEffect(() => {
    setSubCat('');
  }, [mainCat]);

  useEffect(() => {
    if (!mainCat) { setResults(null); return; }
    const params = { hoofdcategorie: mainCat };
    if (subCat) params.subcategorie = subCat;
    api.get('/admin/search-requests-match', { params })
      .then(({ data }) => setResults(data))
      .catch((e) => setError(formatApiError(e)));
  }, [mainCat, subCat]);

  return (
    <div data-testid="admin-zoekertjes-match">
      <p className="text-sm text-muted-foreground mb-6">
        Kies een hoofdcategorie (en optioneel een specifieke subcategorie) om te zien welke projecten daarnaar op zoek zijn.
      </p>
      <div className="flex flex-wrap gap-4 mb-8">
        <select className="input-flat" value={mainCat} onChange={(e) => setMainCat(e.target.value)} data-testid="match-main-category-select">
          <option value="">Kies hoofdcategorie…</option>
          {MATERIAL_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.nl}</option>
          ))}
        </select>
        {activeCat && activeCat.subcategories.length > 0 && (
          <select className="input-flat" value={subCat} onChange={(e) => setSubCat(e.target.value)} data-testid="match-subcategory-select">
            <option value="">Alle subcategorieën</option>
            <option value={activeCat.key}>{activeCat.nl} (algemeen)</option>
            {activeCat.subcategories.map((s) => (
              <option key={s.key} value={s.key}>{s.nl}</option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-destructive">{error}</p>}

      {results !== null && (
        <>
          <p className="text-sm text-muted-foreground mb-4">{results.length} matchend(e) project(en)</p>
          <ul className="divide-y divide-border border-y border-border">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onSelect(r.id)}
                  data-testid={`match-result-${r.id}`}
                  className="w-full text-left py-4 px-2 hover:bg-[#ADEBB3]/40 transition-colors"
                >
                  <p className="font-medium">{r.projectName || '(geen projectnaam)'} <span className="text-sm text-muted-foreground font-normal">· {r.organisation?.name}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deadline: {r.deadline ? new Date(r.deadline).toLocaleDateString('nl-BE') : '—'}
                  </p>
                  {r.matchedMaterials.map((m, i) => m.opmerking && (
                    <p key={i} className="text-sm text-foreground/70 mt-1">"{m.opmerking}"</p>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
