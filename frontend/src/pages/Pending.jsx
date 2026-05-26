import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function Pending() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-24" data-testid="pending-page">
      <p className="overline mb-4">Status · in afwachting</p>
      <h1 className="text-5xl font-bold tracking-tight">
        Je account staat <em className="not-italic underline decoration-2 underline-offset-8">in limbo</em>.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-foreground/80">
        Bedankt voor je registratie, {user.firstName}. Een beheerder bekijkt je
        aanvraag en valideert je account zo snel mogelijk. Tot dan kan je de
        catalogus bekijken met beperkte rechten — net als een bezoeker.
      </p>
      <p className="mt-4 text-foreground/70">
        Je krijgt bericht zodra je toegang krijgt tot het volledige platform.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/catalogus" className="btn-primary" data-testid="pending-catalogus-btn">
          Bekijk de catalogus
        </Link>
        <button onClick={logout} className="btn-secondary" data-testid="pending-logout-btn">
          Uitloggen
        </button>
      </div>
    </div>
  );
}
