import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

export const CATEGORY_LABELS = {
  evenement: 'Evenement',
  artikel: 'Artikel',
  opleidingsmoment: 'Opleidingsmoment',
  oproep: 'Oproep voor hulp',
  ander: 'Ander',
};

export const CATEGORY_COLORS = {
  evenement: '#FBBF24',
  artikel: '#60A5FA',
  opleidingsmoment: '#A78BFA',
  oproep: '#F87171',
  ander: '#9CA3AF',
};

export function formatDateNL(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function NieuwsCard({ post }) {
  const color = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.ander;
  return (
    <Link
      to={`/nieuws/${post.id}`}
      data-testid={`nieuws-card-${post.id}`}
      className="group block border border-border hover:border-foreground transition-colors bg-surface"
    >
      <div className="aspect-[4/3] overflow-hidden">
        {post.photo ? (
          <img
            src={post.photo}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white text-3xl font-bold tracking-tight"
            style={{ backgroundColor: color }}
          >
            {CATEGORY_LABELS[post.category]}
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="overline" style={{ color }}>
          {CATEGORY_LABELS[post.category]}
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight leading-tight">
          {post.title}
        </h3>
        <p className="mt-3 text-xs text-muted-foreground">
          {formatDateNL(post.createdAt)}
        </p>
      </div>
    </Link>
  );
}

export default function Nieuws() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/news')
      .then(({ data }) => setPosts(data))
      .catch(() => setError('Kon nieuws niet laden.'));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16" data-testid="nieuws-page">
      <p className="overline mb-4">Wat speelt er</p>
      <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-12">Nieuws</h1>

      {error && <p className="text-destructive">{error}</p>}
      {posts === null && !error && <p className="text-muted-foreground">Laden…</p>}
      {posts && posts.length === 0 && (
        <p className="text-muted-foreground" data-testid="nieuws-empty">
          Er zijn momenteel geen berichten.
        </p>
      )}

      {posts && posts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((p) => (
            <NieuwsCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
