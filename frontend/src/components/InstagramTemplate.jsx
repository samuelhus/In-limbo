import React from 'react';

const LOGO_URL = 'https://res.cloudinary.com/dbjizykvb/image/upload/v1782338137/logoil_uoqeoo.png';

export default function InstagramTemplate({ listing }) {
  const photo = listing.photos?.[0];
  const description = listing.description
    ? listing.description.slice(0, 120) + (listing.description.length > 120 ? '…' : '')
    : '';

  return (
    <div style={{ width: '1080px', height: '1350px', position: 'relative', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", overflow: 'hidden', backgroundColor: '#1A1A1A' }}>

      {photo && (
        <img src={photo} alt="" crossOrigin="anonymous"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.97) 100%)' }} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '64px 72px' }}>

        <p style={{ color: '#ADEBB3', fontSize: '28px', fontWeight: '600', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '24px' }}>
          {listing.material}
        </p>

        <h2 style={{ color: '#FFFFFF', fontSize: '80px', fontWeight: '800', lineHeight: '1.0', letterSpacing: '-0.02em', marginBottom: '32px' }}>
          {listing.title}
        </h2>

        {description && (
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '34px', lineHeight: '1.5', marginBottom: '48px', maxWidth: '880px' }}>
            {description}
          </p>
        )}

        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '30px', letterSpacing: '0.05em', marginBottom: '60px' }}>
          Nu beschikbaar op In Limbo
        </p>

        <div style={{ display: 'flex', alignItems: 'center', paddingTop: '40px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '14px 24px', display: 'inline-flex', alignItems: 'center' }}>
            <img src={LOGO_URL} alt="in—limbo" crossOrigin="anonymous" style={{ height: '48px', width: 'auto' }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '26px', marginLeft: '32px', letterSpacing: '0.05em' }}>
            inlimbo.be
          </p>
        </div>

      </div>
    </div>
  );
}
