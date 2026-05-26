import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function Rejected() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-24" data-testid="rejected-page">
      <p className="overline mb-4 text-destructive">Aanvraag afgewezen</p>
      <h1 className="text-5xl font-bold tracking-tight">
        Je registratie werd niet goedgekeurd.
      </h1>
      {user.rejectionReason ? (
        <div className="mt-8 border-l-2 border-destructive pl-4">
          <p className="overline mb-1">Reden</p>
          <p className="text-foreground/85 leading-relaxed">{user.rejectionReason}</p>
        </div>
      ) : (
        <p className="mt-6 text-foreground/75">
          De beheerder heeft geen specifieke reden achtergelaten.
        </p>
      )}
      <p className="mt-8 text-foreground/80">
        Je kan opnieuw registreren met dezelfde of een andere organisatie. De
        beheerder ziet je vorige aanvraag als context.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/registreer" className="btn-primary" data-testid="rejected-reregister-btn">
          Opnieuw registreren
        </Link>
        <button onClick={logout} className="btn-secondary" data-testid="rejected-logout-btn">
          Uitloggen
        </button>
      </div>
    </div>
  );
}
