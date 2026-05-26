import React from 'react';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_limbo-stage/artifacts/qxkvv7hu_in%E2%80%94limbo%20logoblack%20%282%29%20%283%29.png';

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
