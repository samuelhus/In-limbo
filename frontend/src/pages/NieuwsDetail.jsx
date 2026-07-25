import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { CATEGORY_COLORS, formatDateNL } from './Nieuws';
import { sanitizeRichText, legacyContentToHtml, hydrateRichTextEmbeds } from '@/lib/richtext';

export default function NieuwsDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'nl';
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const contentRef = useRef(null);

  useEffect(() => {
    api.get(`/news/${id}`)
      .then(({ data }) => {
        if (data.postType === 'nieuws' && !data.languages?.includes(lang)) {
          setError(t('news.not_available_in_language'));
          return;
        }
        setPost(data);
      })
      .catch((e) => setError(formatApiError(e)));
  }, [id, lang, t]);

  const content = post
    ? (lang === 'fr' ? (post.contentFr || post.contentNl) : (post.contentNl || post.contentFr))
    : '';

  useEffect(() => {
    hydrateRichTextEmbeds(contentRef.current);
  }, [content]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="nieuws-detail-error">
        <p className="text-destructive">{error}</p>
        <Link to="/nieuws" className="industrial-link mt-4 inline-block">{t('news.back_to_news')}</Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground">{t('common.loading')}</div>
    );
  }

  const color = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.nieuws;
  const label = t(`news.category_${post.category}`);
  const title = lang === 'fr' ? (post.titleFr || post.titleNl) : (post.titleNl || post.titleFr);

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12" data-testid="nieuws-detail-page">
      <Link
        to="/nieuws"
        className="industrial-link text-sm mb-8 inline-block"
        data-testid="nieuws-detail-back"
      >
        {t('news.back_to_news')}
      </Link>

      {post.photo && (
        <div className="aspect-[16/9] overflow-hidden mb-10">
          <img src={post.photo} alt={title} className="w-full h-full object-cover" />
        </div>
      )}

      <p className="flex items-center gap-3 text-xs uppercase tracking-widest mb-4">
        <span style={{ color }} data-testid="nieuws-detail-category">
          {label}
        </span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span className="text-muted-foreground" data-testid="nieuws-detail-date">
          {formatDateNL(post.createdAt)}
        </span>
      </p>

      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] mb-10">
        {title}
      </h1>

      <div
        ref={contentRef}
        className="richtext-content max-w-none text-foreground/85 leading-relaxed text-lg"
        data-testid="nieuws-detail-content"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(legacyContentToHtml(content)) }}
      />
    </article>
  );
}
