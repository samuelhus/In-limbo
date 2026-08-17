import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { cloudinaryThumb } from '@/lib/cloudinary';

export default function MijnZoekertjes() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/search-requests/mine')
      .then(({ data }) => setItems(data))
      .catch((e) => setError(formatApiError(e)));
  };

  useEffect(() => { load(); }, []);

  const closeRequest = async (id) => {
    if (!window.confirm(t('search_request.confirm_close'))) return;
    setBusy(true);
    try {
      await api.patch(`/search-requests/${id}`, { closed: true });
      load();
    } catch (e) {
      alert(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (items === null && !error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="mijn-zoekertjes-loading">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="mijn-zoekertjes-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <p className="overline">{t('search_request.mijn_zoekertjes_title')} · {items?.length ?? 0}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">{t('search_request.mijn_zoekertjes_title')}</h1>
        </div>
        <Link to="/zoekertje/nieuw" className="btn-primary" data-testid="mijn-zoekertjes-new-btn">
          {t('search_request.new_search_request')} →
        </Link>
      </div>

      {error && <p className="text-destructive mb-6" data-testid="mijn-zoekertjes-error">{error}</p>}

      {items && items.length === 0 && (
        <p className="text-muted-foreground" data-testid="mijn-zoekertjes-empty">
          {t('search_request.mijn_zoekertjes_empty')}
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((sr) => (
            <li key={sr.id} className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-start" data-testid={`zoekertje-item-${sr.id}`}>
              <div className="md:col-span-2">
                <div className="w-16 h-16 bg-muted overflow-hidden">
                  {sr.photos?.[0] && (
                    <img src={cloudinaryThumb(sr.photos[0], 200, 200)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              </div>
              <div className="md:col-span-6">
                <p className="font-medium">{sr.projectName || t('search_request.untitled')}</p>
                {sr.location && <p className="text-sm text-muted-foreground">{sr.location}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {t('search_request.field_deadline')}: {sr.deadline ? new Date(sr.deadline).toLocaleDateString('nl-BE') : '—'}
                  {' · '}{sr.materials?.length || 0} {t('search_request.materials_count_label')}
                </p>
              </div>
              <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
                <Link to={`/zoekertje/${sr.id}/bewerken`} className="btn-secondary !py-2" data-testid={`zoekertje-edit-${sr.id}`}>
                  {t('common.edit')}
                </Link>
                <button
                  onClick={() => closeRequest(sr.id)}
                  disabled={busy}
                  className="btn-ghost !py-2 text-sm"
                  data-testid={`zoekertje-close-${sr.id}`}
                >
                  {t('search_request.close_request')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
