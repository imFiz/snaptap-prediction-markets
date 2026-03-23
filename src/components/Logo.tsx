import React from 'react';
import { Target } from 'lucide-react';

export const Logo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <Target className={`text-ink ${className}`} strokeWidth={2.5} />
);
