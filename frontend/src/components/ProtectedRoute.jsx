import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function ProtectedRoute({ children, requireValidated = true, requireAdmin = false, allowDonnateur = false }) {
  const { user } = useAuth();

  if (user === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <span className="overline">Laden…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (requireValidated && user.status !== 'validated') {
    if (allowDonnateur && user.role === 'donnateur') return children;
    if (user.status === 'pending') return <Navigate to="/wachtkamer" replace />;
    if (user.status === 'rejected') return <Navigate to="/afgewezen" replace />;
  }
  return children;
}
