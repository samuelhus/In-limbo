import React from 'react';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_limbo-stage/artifacts/4up3hemt_IL.jpg';

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
