import React from 'react';

const LOGO_B64 = "data:image/png;base64,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";

export default function InstagramTemplate({ listing }) {
  const photo = listing.photos?.[0];
  const description = listing.description
    ? listing.description.slice(0, 120) + (listing.description.length > 120 ? '…' : '')
    : '';

  return (
    <div style={{ width: '1080px', height: '1350px', position: 'relative', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", overflow: 'hidden', backgroundColor: '#1A1A1A' }}>

      {photo && (
        <img src={photo} alt="" crossOrigin="anonymous"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center center',
          }} />
      )}

      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 0%, transparent 55%, rgba(0,0,0,0.6) 68%, rgba(0,0,0,0.93) 80%, rgba(0,0,0,0.98) 100%)',
      }} />

      {/* Logo linksboven — base64 embedded, no CORS */}
      <div style={{ position: 'absolute', top: '64px', left: '72px', backgroundColor: '#FFFFFF', padding: '20px 36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={LOGO_B64} alt="in-limbo" style={{ height: '56px', width: 'auto', display: 'block' }} />
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '64px 72px' }}>

        <h2 style={{ color: '#FFFFFF', fontSize: '80px', fontWeight: '800', lineHeight: '1.0', letterSpacing: '-0.02em', marginBottom: '32px' }}>
          {listing.title}
        </h2>

        {description && (
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '34px', lineHeight: '1.5', marginBottom: '48px', maxWidth: '880px' }}>
            {description}
          </p>
        )}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '32px' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '32px', fontWeight: '700', letterSpacing: '0.01em', margin: '0 0 8px', lineHeight: '1.2' }}>
            Nu beschikbaar op · actuellement disponible sur
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '32px', fontWeight: '400', letterSpacing: '0.06em', margin: 0 }}>
            inlimbo.brussels
          </p>
        </div>

      </div>
    </div>
  );
}
