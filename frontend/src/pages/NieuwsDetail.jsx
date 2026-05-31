import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatApiError } from '@/lib/api';
import { CATEGORY_LABELS, CATEGORY_COLORS, formatDateNL } from './Nieuws';

export default function NieuwsDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/news/${id}`)
      .then(({ data }) => setPost(data))
      .catch((e) => setError(formatApiError(e)));
  }, [id]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="nieuws-detail-error">
        <p className="text-destructive">{error}</p>
        <Link to="/nieuws" className="industrial-link mt-4 inline-block">← Terug naar nieuws</Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground">Laden…</div>
    );
  }

  const color = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.ander;

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12" data-testid="nieuws-detail-page">
      <Link
        to="/nieuws"
        className="industrial-link text-sm mb-8 inline-block"
        data-testid="nieuws-detail-back"
      >
        ← Terug naar nieuws
      </Link>

      {post.photo && (
        <div className="aspect-[16/9] overflow-hidden mb-10">
          <img src={post.photo} alt={post.title} className="w-full h-full object-cover" />
        </div>
      )}

      <p className="flex items-center gap-3 text-xs uppercase tracking-widest mb-4">
        <span style={{ color }} data-testid="nieuws-detail-category">
          {CATEGORY_LABELS[post.category]}
        </span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span className="text-muted-foreground" data-testid="nieuws-detail-date">
          {formatDateNL(post.createdAt)}
        </span>
      </p>

      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] mb-10">
        {post.title}
      </h1>

      <div
        className="prose prose-neutral max-w-none text-foreground/85 leading-relaxed whitespace-pre-wrap text-lg"
        data-testid="nieuws-detail-content"
      >
        {post.content}
      </div>
    </article>
  );
}
