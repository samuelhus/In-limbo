import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Logo from './Logo';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isLoggedIn = user && typeof user === 'object';
  const isAdmin = isLoggedIn && user.role === 'admin';
  const isValidated = isLoggedIn && user.status === 'validated';

  const navLink =
    'text-sm tracking-wide text-foreground/80 hover:text-foreground transition-colors industrial-link';
  const activeLink = 'text-foreground';

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between h-16">
        <Link to="/" data-testid="header-home-link" className="flex items-center">
          <Logo size="md" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink
            to="/catalogus"
            data-testid="nav-catalogus"
            className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
          >
            Catalogus
          </NavLink>
          {isValidated && (
            <NavLink
              to="/aanbieding/nieuw"
              data-testid="nav-new-listing"
              className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
            >
              Nieuwe aanbieding
            </NavLink>
          )}
          {isValidated && (
            <NavLink
              to="/aanvragen"
              data-testid="nav-aanvragen"
              className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
            >
              Mijn aanvragen
            </NavLink>
          )}
          {isValidated && (
            <NavLink
              to="/organisatie"
              data-testid="nav-my-org"
              className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
            >
              Mijn organisatie
            </NavLink>
          )}
          {isAdmin && (
            <NavLink
              to="/admin"
              data-testid="nav-admin"
              className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
            >
              Admin
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {!isLoggedIn && (
            <>
              <Link
                to="/login"
                data-testid="header-login-link"
                className="text-sm text-foreground/80 hover:text-foreground transition"
              >
                Inloggen
              </Link>
              <Link
                to="/registreer"
                data-testid="header-register-link"
                className="btn-primary !py-2 !px-4 text-xs"
              >
                Word lid
              </Link>
            </>
          )}
          {isLoggedIn && (
            <>
              <Link
                to="/profiel"
                data-testid="header-profile-link"
                className="text-sm text-foreground/80 hover:text-foreground transition hidden sm:inline"
              >
                {user.firstName}
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
                data-testid="header-logout-btn"
                className="text-sm text-foreground/70 hover:text-foreground transition"
              >
                Uitloggen
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
