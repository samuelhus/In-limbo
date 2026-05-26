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
            <li>Over ons</li>
            <li>Contact</li>
            <li>Voorwaarden</li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <p className="overline mb-3">Verbinding</p>
          <p className="text-sm text-muted-foreground">
            Brussel, BE<br />
            hello@inlimbo.be
          </p>
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
