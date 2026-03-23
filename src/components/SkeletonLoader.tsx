import React from 'react';
import { motion } from 'motion/react';

export const SkeletonLoader = () => {
  return (
    <div className="glass-card p-5 mb-4 w-full relative overflow-hidden">
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12"
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
      />
      <div className="flex justify-between items-start mb-4">
        <div className="h-4 bg-pearl-dark/50 rounded-full w-16"></div>
        <div className="h-4 bg-pearl-dark/50 rounded-full w-12"></div>
      </div>
      <div className="h-6 bg-pearl-dark/50 rounded-lg w-3/4 mb-2"></div>
      <div className="h-6 bg-pearl-dark/50 rounded-lg w-1/2 mb-6"></div>
      
      <div className="flex gap-3 mb-4">
        <div className="h-12 bg-pearl-dark/30 rounded-2xl flex-1"></div>
        <div className="h-12 bg-pearl-dark/30 rounded-2xl flex-1"></div>
      </div>
      
      <div className="flex justify-between items-center">
        <div className="h-3 bg-pearl-dark/40 rounded-full w-24"></div>
        <div className="h-3 bg-pearl-dark/40 rounded-full w-20"></div>
      </div>
    </div>
  );
};
