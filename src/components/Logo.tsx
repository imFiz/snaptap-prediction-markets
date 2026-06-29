import React from 'react';
import logoUrl from '../assets/logo.png';

export const Logo = ({ className = 'w-12 h-12' }: { className?: string }) => (
  <img src={logoUrl} alt="SnapTap Logo" className={`object-contain snaptap-logo ${className}`} />
);

export default Logo;
