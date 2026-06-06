import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';

export default function AdminDonnateurListings() {
  const { userId } = useParams();
  const [listings, setListings] = useState([]);
  const [username, setUsername] = useState('');

  useEffect(() => {
    api.get(`/listings/by-user/${userId}`)
      .then(({ data }) => setListings(data));
    api.get(`/admin/users`)
      .then(({ data }) => {
        const user = data.find(u => u.id === userId);
        if (user) setUsername(user.username);
      });
  }, [userId]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Link to="/admin" className="text-sm text-muted-foreground hover:underline mb-6 block">
        ← Terug naar admin
      </Link>
      <p className="overline mb-2">Donnateur</p>
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        Aanbiedingen van {username}
      </h1>
      <div className="divide-y divide-border border-y border-border">
        {listings.map(l => (
          <div key={l.id} className="py-4 flex items-center justify-between gap-4">
            <div>
              <Link to={`/aanbieding/${l.id}`} className="font-medium hover:underline">
                {l.title}
              </Link>
              <p className="text-sm text-muted-foreground">{l.material} · {l.weight} kg</p>
            </div>
            <StatusBadge status={l.status} />
          </div>
        ))}
        {listings.length === 0 && (
          <p className="py-8 text-muted-foreground text-sm">Geen aanbiedingen.</p>
        )}
      </div>
    </div>
  );
}