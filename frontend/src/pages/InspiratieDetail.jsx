import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { formatDateNL } from './Nieuws';
import { INSPIRATIE_CATEGORY_COLORS } from './Inspiratie';
import Lightbox from '@/components/Lightbox';
import { sanitizeRichText, legacyContentToHtml, hydrateRichTextEmbeds } from '@/lib/richtext';

function pickField(post, base, lang) {
  const primary = post[`${base}${lang === 'fr' ? 'Fr' : 'Nl'}`];
  const fallback = post[`${base}${lang === 'fr' ? 'Nl' : 'Fr'}`];
  return primary || fallback || '';
}

export default function InspiratieDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const contentRef = useRef(null);

  useEffect(() => {
    api.get(`/news/${id}`)
      .then(({ data }) => setPost(data))
      .catch((e) => setError(formatApiError(e)));
    api.get('/tags')
      .then(({ data }) => setAllTags(data))
      .catch(() => {}); // niet kritiek — tags tonen zich dan gewoon niet
  }, [id]);

  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'nl';
  const content = post ? pickField(post, 'content', lang) : '';

  useEffect(() => {
    hydrateRichTextEmbeds(contentRef.current);
  }, [content]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="inspiratie-detail-error">
        <p className="text-destructive">{error}</p>
        <Link to="/inspiratie" className="industrial-link mt-4 inline-block">{t('inspiratie.back_to_inspiratie')}</Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground">{t('common.loading')}</div>
    );
  }

  const color = INSPIRATIE_CATEGORY_COLORS[post.category] || INSPIRATIE_CATEGORY_COLORS.artikel;
  const label = t(`inspiratie.category_${post.category}`);
  const title = pickField(post, 'title', lang);
  const gallery = post.photos && post.photos.length > 0 ? post.photos : (post.photo ? [post.photo] : []);
  const postTags = (post.tags || [])
    .map((tid) => allTags.find((tag) => tag.id === tid))
    .filter(Boolean);

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12" data-testid="inspiratie-detail-page">
      <Link
        to="/inspiratie"
        className="industrial-link text-sm mb-8 inline-block"
        data-testid="inspiratie-detail-back"
      >
        {t('inspiratie.back_to_inspiratie')}
      </Link>

      {gallery.length > 0 && (
        <div className="mb-10">
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="block w-full aspect-[16/9] overflow-hidden cursor-zoom-in"
            data-testid="inspiratie-detail-cover-button"
          >
            <img
              src={gallery[0]}
              alt={title}
              className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
            />
          </button>
          {gallery.length > 1 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
              {gallery.slice(1).map((url, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setLightboxIndex(i + 1)}
                  className="aspect-square overflow-hidden cursor-zoom-in"
                  data-testid={`inspiratie-detail-thumb-${i + 1}`}
                >
                  <img
                    src={url}
                    alt={`${t('inspiratie.gallery_photo_alt')} ${i + 2}`}
                    className="w-full h-full object-cover hover:scale-[1.05] transition-transform duration-300"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={gallery}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      <p className="flex items-center gap-3 text-xs uppercase tracking-widest mb-4">
        <span style={{ color }} data-testid="inspiratie-detail-category">
          {label}
        </span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span className="text-muted-foreground" data-testid="inspiratie-detail-date">
          {formatDateNL(post.createdAt)}
        </span>
      </p>

      <h1 className={`text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] ${postTags.length > 0 ? 'mb-6' : 'mb-10'}`}>
        {title}
      </h1>

      {postTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-10" data-testid="inspiratie-detail-tags">
          {postTags.map((tag) => (
            <span
              key={tag.id}
              className="px-2.5 py-1 text-xs uppercase tracking-wide border border-border text-muted-foreground"
            >
              {lang === 'fr' ? tag.nameFr : tag.nameNl}
            </span>
          ))}
        </div>
      )}

      <div
        ref={contentRef}
        className="richtext-content max-w-none text-foreground/85 leading-relaxed text-lg"
        data-testid="inspiratie-detail-content"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(legacyContentToHtml(content)) }}
      />

      {post.category === 'documentatie' && post.link && (
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-block mt-10"
          data-testid="inspiratie-detail-link"
        >
          {t('inspiratie.view_document')}
        </a>
      )}
    </article>
  );
}
