import React from 'react';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-24" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5">
          <Logo size="md" />
          <p className="mt-4 text-sm text-muted-foreground max-w-md leading-relaxed">
            Een marktplaats voor materiaal in transit. In Limbo verbindt
            socio-culturele organisaties die materiaal teveel hebben met diegenen
            die het nog kunnen gebruiken.
          </p>
        </div>
        <div className="md:col-span-2">
          <p className="overline mb-3">Navigatie</p>
          <ul className="space-y-2 text-sm">
            <li><a href="/" className="industrial-link">Home</a></li>
            <li><a href="/catalogus" className="industrial-link">Catalogus</a></li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <p className="overline mb-3">Project</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="/over-ons" className="industrial-link">Over ons</a></li>
            <li>Contact</li>
            <li><a href="/voorwaarden" className="industrial-link">Voorwaarden</a></li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <p className="overline mb-3">Socials</p>
          <ul className="space-y-3">
            <li>
              <a href="https://www.instagram.com/inlimbo.brussels" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                </svg>
                <span>@inlimbo.brussels</span>
              </a>
            </li>
            <li>
              <a href="https://www.toestand.be" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
                <span>toestand.be</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} in—limbo</span>
          <span className="tracking-widest uppercase">Material in transit</span>
        </div>
      </div>
    </footer>
  );
}
