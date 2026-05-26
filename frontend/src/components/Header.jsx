import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Logo from './Logo';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoggedIn = user && typeof user === 'object';
  const isAdmin = isLoggedIn && user.role === 'admin';
  const isValidated = isLoggedIn && user.status === 'validated';

  const navLink =
    'text-sm tracking-wide text-foreground/80 hover:text-foreground transition-colors industrial-link';
  const activeLink = 'text-foreground';

  // -----------------------------------------------------------
  // Mobile menu state — separate from desktop nav, no overlap
  // -----------------------------------------------------------
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const hamburgerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const onMouseDown = (e) => {
      if (
        mobileMenuRef.current && !mobileMenuRef.current.contains(e.target) &&
        hamburgerRef.current && !hamburgerRef.current.contains(e.target)
      ) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [mobileOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Visible nav items based on auth (same logic as desktop)
  const mobileNavItems = [
    { to: '/catalogus', label: 'Catalogus', testId: 'mobile-nav-catalogus', show: true },
    { to: '/aanbieding/nieuw', label: 'Nieuwe aanbieding', testId: 'mobile-nav-new-listing', show: isValidated },
    { to: '/aanvragen', label: 'Mijn aanvragen', testId: 'mobile-nav-aanvragen', show: isValidated },
    { to: '/mijn-aanbiedingen', label: 'Mijn aanbiedingen', testId: 'mobile-nav-mijn-aanbiedingen', show: isValidated },
    { to: '/organisatie', label: 'Mijn organisatie', testId: 'mobile-nav-my-org', show: isValidated },
    { to: '/admin', label: 'Admin', testId: 'mobile-nav-admin', show: isAdmin },
    { to: '/profiel', label: 'Mijn profiel', testId: 'mobile-nav-profiel', show: isLoggedIn },
  ].filter((i) => i.show);

  const mobileItemClass =
    'block px-5 py-3 text-sm tracking-wide text-foreground/80 hover:text-foreground hover:bg-muted transition-colors border-b border-border last:border-b-0';

  const handleMobileLogout = async () => {
    setMobileOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between h-16">
        <Link to="/" data-testid="header-home-link" className="flex items-center">
          <Logo size="md" />
        </Link>

        {/* -------------------------- DESKTOP NAV -------------------------- */}
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
              to="/mijn-aanbiedingen"
              data-testid="nav-mijn-aanbiedingen"
              className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
            >
              Mijn aanbiedingen
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

        {/* -------------------------- DESKTOP RIGHT GROUP -------------------------- */}
        <div className="hidden md:flex items-center gap-3">
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

        {/* -------------------------- MOBILE HAMBURGER -------------------------- */}
        <div className="md:hidden relative">
          <button
            ref={hamburgerRef}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={mobileOpen}
            data-testid="hamburger-button"
            className="p-2 -mr-2 text-foreground hover:bg-muted transition-colors"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {mobileOpen && (
            <div
              ref={mobileMenuRef}
              data-testid="mobile-menu-dropdown"
              className="absolute right-0 top-full mt-2 w-64 bg-background border border-border shadow-lg animate-fade-in"
            >
              {/* Logged-in user info row */}
              {isLoggedIn && (
                <div className="px-5 py-3 border-b border-border bg-muted/40">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Ingelogd als</p>
                  <p className="text-sm font-medium mt-0.5 truncate">{user.firstName} {user.lastName}</p>
                </div>
              )}

              {/* Navigation links */}
              {mobileNavItems.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  data-testid={it.testId}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `${mobileItemClass} ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`
                  }
                >
                  {it.label}
                </NavLink>
              ))}

              {/* Anonymous: login + register */}
              {!isLoggedIn && (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    data-testid="mobile-header-login-link"
                    className={mobileItemClass}
                  >
                    Inloggen
                  </Link>
                  <Link
                    to="/registreer"
                    onClick={() => setMobileOpen(false)}
                    data-testid="mobile-header-register-link"
                    className={`${mobileItemClass} font-medium text-foreground`}
                  >
                    Word lid →
                  </Link>
                </>
              )}

              {/* Logged-in: logout */}
              {isLoggedIn && (
                <button
                  onClick={handleMobileLogout}
                  data-testid="mobile-header-logout-btn"
                  className={`${mobileItemClass} w-full text-left text-destructive`}
                >
                  Uitloggen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
