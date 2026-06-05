import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Logo from './Logo';
import NotificationCenter from './NotificationCenter';
import { api } from '@/lib/api';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoggedIn = user && typeof user === 'object';
  const isAdmin = isLoggedIn && user.role === 'admin';
  const isDonateur = isLoggedIn && user.role === 'donateur';
  const isValidated = isLoggedIn && user.status === 'validated' && !isDonateur;
  const canCreateListings = isValidated || isDonateur;
  const displayName = isLoggedIn ? (isDonateur ? user.username : user.firstName) : '';
  const showAanbiedingen = canCreateListings || isValidated;

  const navLink =
    'text-sm tracking-wide text-foreground/80 hover:text-foreground transition-colors industrial-link';
  const activeLink = 'text-foreground';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [aanbiedingenOpen, setAanbiedingenOpen] = useState(false);
  const [mobileAanbiedingenOpen, setMobileAanbiedingenOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) {
      setUnreadCount(0);
      return;
    }
    api.get('/notifications/mine')
      .then(({ data }) => {
        setUnreadCount(data.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }, [isLoggedIn, location.pathname]);

  const mobileMenuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const aanbiedingenRef = useRef(null);

  // Sluit mobiel menu bij klik buiten
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

  // Sluit desktop dropdown bij klik buiten
  useEffect(() => {
    if (!aanbiedingenOpen) return;
    const onMouseDown = (e) => {
      if (aanbiedingenRef.current && !aanbiedingenRef.current.contains(e.target)) {
        setAanbiedingenOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [aanbiedingenOpen]);

  // Sluit alles bij navigatie
  useEffect(() => {
    setMobileOpen(false);
    setAanbiedingenOpen(false);
    setMobileAanbiedingenOpen(false);
  }, [location.pathname]);

  const mobileItemClass =
    'block px-5 py-3 text-sm tracking-wide text-foreground/80 hover:text-foreground hover:bg-[#ADEBB3] transition-colors border-b border-border last:border-b-0';
  const mobileSubItemClass =
    'block px-8 py-2.5 text-sm text-foreground/70 hover:text-foreground hover:bg-[#ADEBB3] transition-colors border-b border-border';

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

        {/* DESKTOP NAV */}
        <nav className="hidden md:flex items-center gap-8">
          <NavLink
            to="/catalogus"
            data-testid="nav-catalogus"
            className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
          >
            Catalogus
          </NavLink>

          <NavLink
            to="/nieuws"
            data-testid="nav-nieuws"
            className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
          >
            Nieuws
          </NavLink>

          {showAanbiedingen && (
            <div className="relative" ref={aanbiedingenRef}>
              <button
                onClick={() => setAanbiedingenOpen((v) => !v)}
                className={`${navLink} flex items-center gap-1`}
                data-testid="nav-aanbiedingen-dropdown"
              >
                Aanbiedingen
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${aanbiedingenOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {aanbiedingenOpen && (
                <div className="absolute left-0 top-full mt-2 w-52 bg-background border border-border shadow-lg z-50">
                  {canCreateListings && (
                    <NavLink
                      to="/aanbieding/nieuw"
                      data-testid="nav-new-listing"
                      className={({ isActive }) =>
                        `block px-4 py-3 text-sm text-foreground/80 hover:text-foreground hover:bg-[#ADEBB3] transition-colors border-b border-border ${isActive ? 'text-foreground font-medium' : ''}`
                      }
                    >
                      Nieuwe aanbieding
                    </NavLink>
                  )}
                  {canCreateListings && (
                    <NavLink
                      to="/mijn-aanbiedingen"
                      data-testid="nav-mijn-aanbiedingen"
                      className={({ isActive }) =>
                        `block px-4 py-3 text-sm text-foreground/80 hover:text-foreground hover:bg-[#ADEBB3] transition-colors border-b border-border ${isActive ? 'text-foreground font-medium' : ''}`
                      }
                    >
                      Mijn aanbiedingen
                    </NavLink>
                  )}
                  {isValidated && (
                    <NavLink
                      to="/aanvragen"
                      data-testid="nav-aanvragen"
                      className={({ isActive }) =>
                        `block px-4 py-3 text-sm text-foreground/80 hover:text-foreground hover:bg-[#ADEBB3] transition-colors ${isActive ? 'text-foreground font-medium' : ''}`
                      }
                    >
                      Mijn aanvragen
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}

          <NavLink
            to="/over-ons"
            data-testid="nav-over-ons"
            className={({ isActive }) => `${navLink} ${isActive ? activeLink : ''}`}
          >
            Over ons
          </NavLink>

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

        {/* DESKTOP RIGHT GROUP */}
        <div className="hidden md:flex items-center gap-3">
          {!isLoggedIn && (
            <>
              <Link to="/login" data-testid="header-login-link" className="text-sm text-foreground/80 hover:text-foreground transition">
                Inloggen
              </Link>
              <Link to="/donateur/registreer" data-testid="header-donateur-btn" className="text-sm text-foreground/80 hover:text-foreground transition">
                Doneer materiaal
              </Link>
              <Link to="/registreer" data-testid="header-register-link" className="btn-primary !py-2 !px-4 text-xs">
                Word lid
              </Link>
            </>
          )}
          {isLoggedIn && (
            <>
              <NotificationCenter />
              <Link to="/profiel" data-testid="header-profile-link" className="text-sm text-foreground/80 hover:text-foreground transition hidden sm:inline">
                {displayName}
              </Link>
              <button
                onClick={async () => { await logout(); navigate('/'); }}
                data-testid="header-logout-btn"
                className="text-sm text-foreground/70 hover:text-foreground transition"
              >
                Uitloggen
              </button>
            </>
          )}
        </div>

        {/* MOBILE HAMBURGER */}
        <div className="md:hidden relative flex items-center gap-2">
          {isLoggedIn && unreadCount > 0 && !mobileOpen && (
            <Link
              to="/notificaties"
              className="relative p-1"
              data-testid="mobile-notif-badge"
            >
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </Link>
          )}
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
              {isLoggedIn && (
                <div className="px-5 py-3 border-b border-border bg-muted/40">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Ingelogd als</p>
                  <p className="text-sm font-medium mt-0.5 truncate">
                    {isDonateur ? user.username : `${user.firstName || ''} ${user.lastName || ''}`.trim()}
                  </p>
                </div>
              )}

              <NavLink
                to="/catalogus"
                data-testid="mobile-nav-catalogus"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `${mobileItemClass} ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`}
              >
                Catalogus
              </NavLink>

              <NavLink
                to="/nieuws"
                data-testid="mobile-nav-nieuws"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `${mobileItemClass} ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`}
              >
                Nieuws
              </NavLink>

              {showAanbiedingen && (
                <>
                  <button
                    onClick={() => setMobileAanbiedingenOpen((v) => !v)}
                    className={`${mobileItemClass} w-full text-left flex items-center justify-between`}
                    data-testid="mobile-nav-aanbiedingen"
                  >
                    Aanbiedingen
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${mobileAanbiedingenOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {mobileAanbiedingenOpen && (
                    <>
                      {canCreateListings && (
                        <NavLink
                          to="/aanbieding/nieuw"
                          data-testid="mobile-nav-new-listing"
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) => `${mobileSubItemClass} ${isActive ? 'text-foreground font-medium' : ''}`}
                        >
                          → Nieuwe aanbieding
                        </NavLink>
                      )}
                      {canCreateListings && (
                        <NavLink
                          to="/mijn-aanbiedingen"
                          data-testid="mobile-nav-mijn-aanbiedingen"
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) => `${mobileSubItemClass} ${isActive ? 'text-foreground font-medium' : ''}`}
                        >
                          → Mijn aanbiedingen
                        </NavLink>
                      )}
                      {isValidated && (
                        <NavLink
                          to="/aanvragen"
                          data-testid="mobile-nav-aanvragen"
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) => `${mobileSubItemClass} ${isActive ? 'text-foreground font-medium' : ''}`}
                        >
                          → Mijn aanvragen
                        </NavLink>
                      )}
                    </>
                  )}
                </>
              )}

              <NavLink
                to="/over-ons"
                data-testid="mobile-nav-over-ons"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `${mobileItemClass} ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`}
              >
                Over ons
              </NavLink>

              {isAdmin && (
                <NavLink
                  to="/admin"
                  data-testid="mobile-nav-admin"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `${mobileItemClass} ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`}
                >
                  Admin
                </NavLink>
              )}

              {isLoggedIn && (
                <NavLink
                  to="/notificaties"
                  data-testid="mobile-nav-notificaties"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `${mobileItemClass} flex items-center justify-between ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`
                  }
                >
                  <span>Notificaties</span>
                  {unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </NavLink>
              )}

              {isLoggedIn && (
                <NavLink
                  to="/profiel"
                  data-testid="mobile-nav-profiel"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `${mobileItemClass} ${isActive ? 'text-foreground bg-muted/50 font-medium' : ''}`}
                >
                  Mijn profiel
                </NavLink>
              )}

              {!isLoggedIn && (
                <>
                  <Link to="/login" onClick={() => setMobileOpen(false)} data-testid="mobile-header-login-link" className={mobileItemClass}>
                    Inloggen
                  </Link>
                  <Link to="/donateur/registreer" onClick={() => setMobileOpen(false)} data-testid="mobile-header-donateur-btn" className={mobileItemClass}>
                    Doe een gift
                  </Link>
                  <Link to="/registreer" onClick={() => setMobileOpen(false)} data-testid="mobile-header-register-link" className={`${mobileItemClass} font-medium text-foreground`}>
                    Word lid →
                  </Link>
                </>
              )}

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
