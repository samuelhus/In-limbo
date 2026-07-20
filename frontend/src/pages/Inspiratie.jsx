import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { formatDateNL } from './Nieuws';

export const INSPIRATIE_CATEGORY_COLORS = {
  artikel: '#60A5FA',
  partner_project: '#34D399',
  documentatie: '#9CA3AF',
};

const INSPIRATIE_CATEGORIES = ['artikel', 'partner_project', 'documentatie'];

function pickField(post, base, lang) {
  const primary = post[`${base}${lang === 'fr' ? 'Fr' : 'Nl'}`];
  const fallback = post[`${base}${lang === 'fr' ? 'Nl' : 'Fr'}`];
  return primary || fallback || '';
}

function InspiratieCard({ post, t, i18n }) {
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'nl';
  const color = INSPIRATIE_CATEGORY_COLORS[post.category] || INSPIRATIE_CATEGORY_COLORS.artikel;
  const label = t(`inspiratie.category_${post.category}`);
  const title = pickField(post, 'title', lang);
  const cover = post.photo || (post.photos && post.photos[0]);

  return (
    <Link
      to={`/inspiratie/${post.id}`}
      data-testid={`inspiratie-card-${post.id}`}
      className="group block border border-border hover:border-foreground transition-colors bg-surface"
    >
      <div className="aspect-[4/3] overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white text-3xl font-bold tracking-tight"
            style={{ backgroundColor: color }}
          >
            {label}
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="overline" style={{ color }}>{label}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight leading-tight">
          {title}
        </h3>
        <p className="mt-3 text-xs text-muted-foreground">
          {formatDateNL(post.createdAt)}
        </p>
      </div>
    </Link>
  );
}

function CategoryFilter({ active, setActive, t }) {
  const options = [{ v: null, k: 'inspiratie.filter_all' }, ...INSPIRATIE_CATEGORIES.map((c) => ({ v: c, k: `inspiratie.category_${c}` }))];

  return (
    <div className="flex flex-wrap gap-2 mb-10" data-testid="inspiratie-category-filter">
      {options.map((opt) => {
        const isActive = active === opt.v;
        const color = opt.v ? INSPIRATIE_CATEGORY_COLORS[opt.v] : undefined;
        return (
          <button
            key={opt.v || 'all'}
            type="button"
            onClick={() => setActive(opt.v)}
            data-testid={`inspiratie-filter-${opt.v || 'all'}`}
            className={`px-4 py-2 text-sm tracking-wide border transition-colors ${
              isActive
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            }`}
            style={isActive && color ? { backgroundColor: color, borderColor: color } : undefined}
          >
            {t(opt.k)}
          </button>
        );
      })}
    </div>
  );
}

export default function Inspiratie() {
  const { t, i18n } = useTranslation();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    api.get('/news', { params: { postType: 'inspiratie' } })
      .then(({ data }) => setPosts(data))
      .catch(() => setError('Kon inspiratie niet laden.'));
  }, []);

  const filteredPosts = useMemo(() => {
    if (!posts) return posts;
    if (!activeCategory) return posts;
    return posts.filter((p) => p.category === activeCategory);
  }, [posts, activeCategory]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16" data-testid="inspiratie-page">
      <p className="overline mb-4">{t('inspiratie.subtitle')}</p>
      <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-8">{t('inspiratie.title')}</h1>

      {error && <p className="text-destructive">{error}</p>}
      {posts === null && !error && <p className="text-muted-foreground">{t('common.loading')}</p>}

      {posts && posts.length > 0 && (
        <CategoryFilter active={activeCategory} setActive={setActiveCategory} t={t} />
      )}

      {posts && posts.length === 0 && (
        <p className="text-muted-foreground" data-testid="inspiratie-empty">
          {t('inspiratie.empty')}
        </p>
      )}

      {filteredPosts && filteredPosts.length === 0 && posts && posts.length > 0 && (
        <p className="text-muted-foreground" data-testid="inspiratie-filter-empty">
          {t('inspiratie.empty')}
        </p>
      )}

      {filteredPosts && filteredPosts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((p) => (
            <InspiratieCard key={p.id} post={p} t={t} i18n={i18n} />
          ))}
        </div>
      )}
    </div>
  );
}
