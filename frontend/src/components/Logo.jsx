import React from 'react';

const LOGO_URL = 'https://res.cloudinary.com/dbjizykvb/image/upload/v1782338137/logoil_uoqeoo.png';

export default function Logo({ className = '', size = 'md' }) {
  const heights = { sm: 'h-6', md: 'h-8', lg: 'h-12', xl: 'h-20' };
  return (
    <img
      src={LOGO_URL}
      alt="in—limbo"
      className={`${heights[size] || heights.md} w-auto select-none ${className}`}
      draggable={false}
      data-testid="logo"
    />
  );
}
