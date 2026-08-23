import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import html2canvas from 'html2canvas';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import InstagramTemplate from '@/components/InstagramTemplate';
import { cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_KEYS = [
  { v: 'beschikbaar', k: 'catalogus.filter_available' },
  { v: 'in_magazijn', k: 'catalogus.filter_warehouse' },
  { v: 'herbestemd', k: 'catalogus.filter_rehomed' },
];

function FilterPanel({ status, setStatus, onClose }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" data-testid="filter-panel">
      <div>
        <p className="overline mb-3">{t('catalogus.status')}</p>
        <ul className="space-y-2">
          {STATUS_KEYS.map((opt) => (
            <li key={opt.v}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="status-filter"
                  checked={status === opt.v}
                  onChange={() => { setStatus(opt.v); onClose?.(); }}
                  data-testid={`filter-status-${opt.v}`}
                />
                <span className="text-sm">{t(opt.k)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ListingTile({ item, isValidated, isAdmin }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [readyFile, setReadyFile] = useState(null); // voorbereid bestand, wacht op de "verse" deel-tik
  const exportRef = useRef(null);

  // Tik 1: bereidt de afbeelding voor (html2canvas + toBlob zijn async). Roept
  // bewust GEEN navigator.share() aan — elke await hiervoor zou de "directe
  // gebruikersactie" doorbreken die Safari op iOS vereist voor de Share API.
  const handlePrepare = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (exporting || readyFile || !item.photos?.[0]) return;
    setExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const canvas = await html2canvas(exportRef.current, {
        useCORS: true,
        allowTaint: false,
        scale: 1,
        width: 1080,
        height: 1350,
        backgroundColor: null,
      });
      const fileName = `${item.title.replace(/\s+/g, '-').toLowerCase()}-inlimbo.png`;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Klaar, maar nog niet delen — toon nu de "Deel"-knop en wacht op een
        // verse tik. Dát is de tik die navigator.share() rechtstreeks aanroept.
        setReadyFile(file);
        setExporting(false);
      } else {
        // Geen Share API-ondersteuning (desktop) — hier speelt de
        // gebruikersactie-vereiste niet, dus meteen downloaden zonder tweede tik.
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        setExporting(false);
      }
    } catch (err) {
      console.error('Export mislukt:', err);
      setExporting(false);
    }
  };

  // Tik 2: dit is een verse, directe gebruikersactie zonder enige await
  // ervoor — dat is precies wat Safari op iOS vereist om navigator.share()
  // toe te staan. De await's hieronder gebeuren pas NA de aanroep.
  const handleShareTap = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!readyFile) return;
    const file = readyFile;
    navigator.share({ files: [file], title: item.title })
      .catch((shareErr) => {
        // AbortError = gebruiker heeft het deelvenster zelf gesloten — geen echte fout.
        if (shareErr?.name !== 'AbortError') {
          console.error('Delen mislukt:', shareErr);
        }
      })
      .finally(() => setReadyFile(null));
  };

  const photo = item.photos?.[0];
  const isDonateurParticulier = !item.limited && item.offererIsDonateur
    && item.offererDonorType !== 'bedrijf' && item.offererUsername;
  const isDonateurBedrijf = !item.limited && item.offererIsDonateur
    && item.offererDonorType === 'bedrijf' && item.offererFirstName && item.offererCompanyName;
  const showOfferer = !item.limited && item.offererFirstName && item.organisation;

  const goToListing = () => navigate(`/aanbieding/${item.slug || item.id}`);
  const goToOrg = (e) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/organisaties/${item.organisation.slug || item.organisation.id}`);
  };

  return (
    <div
      onClick={goToListing}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && goToListing()}
      data-testid={`listing-tile-${item.id}`}
      className="group block animate-fade-in cursor-pointer"
    >
      <div className="aspect-[4/5] bg-muted overflow-hidden relative">
        {photo ? (
          <img
            src={cloudinaryThumb(photo, 800, 1000)}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">{t('listing.geen_foto')}</div>
        )}
        <div className="absolute top-3 left-3"><StatusBadge status={item.status} /></div>
        {isAdmin && item.photos?.[0] && (
          <button
            onClick={readyFile ? handleShareTap : handlePrepare}
            disabled={exporting}
            title={readyFile ? 'Delen' : 'Exporteer als Instagram afbeelding'}
            data-testid={readyFile ? `share-instagram-btn-${item.id}` : `export-instagram-btn-${item.id}`}
            className={`absolute top-3 right-3 text-white w-8 h-8 flex items-center justify-center transition-colors disabled:opacity-50 z-10 text-base ${
              readyFile ? 'bg-primary hover:bg-primary/80 animate-pulse' : 'bg-black/50 hover:bg-black/80'
            }`}
          >
            {exporting ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : readyFile ? (
              '⇧'
            ) : (
              '↓'
            )}
          </button>
        )}
        {item.isRecurrent && (
          <div className="absolute bottom-3 left-3 text-[10px] uppercase tracking-widest bg-background/90 px-2 py-0.5">
            Recurrent
          </div>
        )}
        {item.status === 'in_magazijn' && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center bg-[#BBF7D0]/80 py-2 font-heading tracking-[0.3em] uppercase text-xs text-[#14532D]">
            Magazijn
          </div>
        )}
      </div>
      <div className="mt-3">
        <h3 className="font-medium text-base leading-snug group-hover:underline underline-offset-4 line-clamp-2">
          {item.title}
        </h3>
        {/*<p className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">{item.material}</p>*/}
        {isDonateurParticulier && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`listing-tile-donateur-${item.id}`}>
            {t('catalogus.aangeboden_door')} <span className="font-medium text-foreground/85">{item.offererUsername}</span>
            {' - '}{t('auth.donateur_type_particulier')}
          </p>
        )}
        {isDonateurBedrijf && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`listing-tile-donateur-${item.id}`}>
            {t('catalogus.aangeboden_door')} <span className="font-medium text-foreground/85">{item.offererFirstName}</span> {t('catalogus.van')}{' '}
            <span className="font-medium text-foreground/85">{item.offererCompanyName}</span>
            {' - '}{t('auth.donateur_type_bedrijf')}
          </p>
        )}
        {showOfferer && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`listing-tile-offerer-${item.id}`}>
            {t('catalogus.aangeboden_door')} {item.offererFirstName} {t('catalogus.van')}{' '}
            <span
              role="link"
              tabIndex={0}
              onClick={goToOrg}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && goToOrg(e)}
              className="industrial-link text-foreground/80 hover:text-foreground cursor-pointer"
              data-testid={`listing-tile-org-link-${item.id}`}
            >
              {item.organisation.name}
            </span>
          </p>
        )}
        {!isValidated && (
          <p className="mt-2 text-xs text-muted-foreground italic">{t('catalogus.limited_view')}</p>
        )}
      </div>

      {isAdmin && item.photos?.[0] && (
        <div
          ref={exportRef}
          style={{
            position: 'fixed',
            top: '-99999px',
            left: '-99999px',
            width: '1080px',
            height: '1350px',
            overflow: 'hidden',
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <InstagramTemplate listing={item} />
        </div>
      )}
    </div>
  );
}

export default function Catalogus() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [status, setStatus] = useState('beschikbaar');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [fallbackItems, setFallbackItems] = useState([]);
  const [showFallback, setShowFallback] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  const limit = 20;
  const isValidated = user && typeof user === 'object' && user.status === 'validated';
  const isAdmin = user && typeof user === 'object' && user.role === 'admin';

  // 350ms debounce on the search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query]);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    setError('');
    const startSkip = reset ? 0 : skip;
    try {
      const params = { skip: startSkip, limit };
      if (debouncedQuery) {
        params.q = debouncedQuery;
      } else {
        params.filter = status || undefined;
      }
      const { data } = await api.get('/listings', { params });
      setTotal(data.total);
      setItems((prev) => reset ? data.items : [...prev, ...data.items]);
      setSkip(startSkip + data.items.length);

      // Zero-results fallback for search: show all beschikbaar
      if (debouncedQuery && reset && data.total === 0) {
        try {
          const { data: fb } = await api.get('/listings', {
            params: { filter: 'beschikbaar', skip: 0, limit },
          });
          setFallbackItems(fb.items || []);
          setShowFallback(true);
        } catch {
          setFallbackItems([]);
          setShowFallback(false);
        }
      } else if (!debouncedQuery || data.total > 0) {
        setShowFallback(false);
        setFallbackItems([]);
      }
    } catch {
      // Bv. netwerkonderbreking of een geannuleerd request (rapid filter-
      // wissels) — anders bleef dit een onbehandelde promise rejection.
      setError(t('catalogus.load_error'));
    } finally {
      setLoading(false);
    }
  }, [status, skip, debouncedQuery, t]);

  // Reload whenever status filter changes OR debounced search changes
  useEffect(() => {
    setSkip(0);
    setItems([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedQuery]);

  const clearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
    setShowFallback(false);
    setFallbackItems([]);
  };

  const isSearching = !!debouncedQuery;
  const displayItems = showFallback ? fallbackItems : items;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="catalogus-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-5xl font-bold tracking-tight">{t('catalogus.title')}</h1>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('catalogus.search_placeholder')}
            data-testid="catalogus-search-input"
            className="w-full bg-transparent border-b-2 border-foreground/20 focus:border-foreground/80 outline-none py-4 pr-12 text-xl placeholder:text-foreground/40 transition-colors"
          />
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label={t('catalogus.search_clear')}
              data-testid="catalogus-search-clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors text-xl"
            >
              ×
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 text-xl pointer-events-none"
            >
              ⌕
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground" data-testid="catalogus-result-count">
            {isSearching && total > 0 && (
              <>
                <span className="font-medium text-foreground">{total}</span>{' '}
                {t('catalogus.count_listings', { count: '' }).replace('  ', ' ').trim()}{' '}
                — {t('catalogus.search_results_for')} <em>"{debouncedQuery}"</em>
              </>
            )}
            {!isSearching && (
              <>
                <span className="font-medium text-foreground">{total}</span>{' '}
                {t('catalogus.count_listings', { count: '' }).replace('  ', ' ').trim()}
              </>
            )}
          </p>
          <button
            className="md:hidden btn-secondary !py-2"
            onClick={() => setMobileFilterOpen(true)}
            data-testid="filter-open-mobile"
          >
            {t('catalogus.filters')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden md:block md:col-span-3 lg:col-span-2" data-testid="filter-sidebar">
          <div className="sticky top-24">
            <FilterPanel status={status} setStatus={setStatus} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileFilterOpen && (
          <div
            className="fixed inset-0 bg-background z-50 p-6 overflow-y-auto md:hidden"
            data-testid="filter-mobile-drawer"
          >
            <div className="flex items-center justify-between mb-8">
              <p className="overline">{t('catalogus.filters')}</p>
              <button onClick={() => setMobileFilterOpen(false)} data-testid="filter-close-mobile" className="text-2xl">×</button>
            </div>
            <FilterPanel status={status} setStatus={setStatus} onClose={() => setMobileFilterOpen(false)} />
          </div>
        )}

        {/* Grid */}
        <div className="md:col-span-9 lg:col-span-10">
          {error && (
            <p className="text-destructive mb-8" data-testid="catalogus-error">{error}</p>
          )}

          {/* Zero-results banner */}
          {isSearching && showFallback && (
            <div className="mb-8 border-l-2 border-foreground/20 pl-4" data-testid="catalogus-no-results">
              <p className="text-foreground/80 mb-1">
                {t('catalogus.search_no_results')} <em>"{debouncedQuery}"</em>
              </p>
              <p className="text-sm text-muted-foreground">
                {t('catalogus.search_fallback')}
              </p>
            </div>
          )}

          {displayItems.length === 0 && !loading && (
            <p className="text-muted-foreground" data-testid="catalogus-empty">{t('catalogus.empty')}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
            {displayItems.map((item) => (
              <ListingTile key={item.id} item={item} isValidated={isValidated} isAdmin={isAdmin} />
            ))}
          </div>

          {!showFallback && skip < total && (
            <div className="flex justify-center mt-16">
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="btn-secondary"
                data-testid="catalogus-load-more"
              >
                {loading ? t('common.loading') : t('catalogus.load_more')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
