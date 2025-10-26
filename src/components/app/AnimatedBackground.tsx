"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export default function AnimatedBackground() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Keep the element mounted always to avoid remount flashes when theme changes.
  // Use opacity transitions to cross-fade between semantic styles.
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none transition-opacity duration-200 ease-linear">
      {/* Grid Pattern */}
      <div className={`absolute inset-0 bg-[size:24px_24px] ${isDark ? 'opacity-60' : 'opacity-30'} transition-opacity duration-200`} style={{backgroundImage: isDark ? 'linear-gradient(to right,#ffffff08 1px, transparent 1px), linear-gradient(to bottom,#ffffff08 1px, transparent 1px)' : 'linear-gradient(to right,#00000008 1px, transparent 1px), linear-gradient(to bottom,#00000008 1px, transparent 1px)'}} />
      
      {/* Gradient Orbs */}
      <div className={`absolute top-0 -left-4 w-96 h-96 rounded-full filter blur-3xl animate-blob transition-opacity duration-300 ${isDark ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 mix-blend-soft-light opacity-80' : 'bg-gradient-to-r from-blue-500/12 to-cyan-500/12 mix-blend-multiply opacity-60'}`} />
      <div className={`absolute top-0 -right-4 w-96 h-96 rounded-full filter blur-3xl animate-blob transition-opacity duration-300 ${isDark ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 mix-blend-soft-light opacity-80' : 'bg-gradient-to-r from-purple-500/12 to-pink-500/12 mix-blend-multiply opacity-60'}`} style={{animationDelay: '2s'}} />
      <div className={`absolute -bottom-8 left-20 w-96 h-96 rounded-full filter blur-3xl animate-blob transition-opacity duration-300 ${isDark ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 mix-blend-soft-light opacity-80' : 'bg-gradient-to-r from-emerald-500/12 to-teal-500/12 mix-blend-multiply opacity-60'}`} style={{animationDelay: '4s'}} />
      
      {/* Animated Network Lines */}
      <svg className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${isDark ? 'opacity-20' : 'opacity-30'}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={isDark ? "#60a5fa" : "#3b82f6"} stopOpacity="0" />
            <stop offset="50%" stopColor={isDark ? "#60a5fa" : "#3b82f6"} stopOpacity="1" />
            <stop offset="100%" stopColor={isDark ? "#a78bfa" : "#8b5cf6"} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Diagonal Lines */}
  <line x1="0" y1="0" x2="100%" y2="100%" stroke="url(#line-gradient)" strokeWidth="2" className="animate-pulse" />
  <line x1="100%" y1="0" x2="0" y2="100%" stroke="url(#line-gradient)" strokeWidth="2" className="animate-pulse" style={{ animationDelay: '0.6s' }} />
        
        {/* Horizontal Lines */}
        <line x1="0" y1="33%" x2="100%" y2="33%" stroke="url(#line-gradient)" strokeWidth="1" opacity="0.45" className="animate-pulse" style={{ animationDelay: '1.2s' }} />
        <line x1="0" y1="66%" x2="100%" y2="66%" stroke="url(#line-gradient)" strokeWidth="1" opacity="0.45" className="animate-pulse" style={{ animationDelay: '1.8s' }} />
      </svg>

      {/* Connection Nodes */}
      {[
        { x: '10%', y: '20%', delay: '0s' },
        { x: '90%', y: '30%', delay: '1s' },
        { x: '30%', y: '70%', delay: '2s' },
        { x: '70%', y: '80%', delay: '3s' },
        { x: '50%', y: '50%', delay: '4s' },
      ].map((node, i) => (
        <div
          key={i}
          className={`absolute w-2 h-2 rounded-full animate-ping transition-opacity duration-300 ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`}
          style={{ left: node.x, top: node.y, animationDelay: node.delay, animationDuration: '2.6s' }}
        />
      ))}

      {/* Floating Particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className={`absolute w-1 h-1 rounded-full ${
            isDark ? 'bg-blue-300/30' : 'bg-blue-400/40'
          }`}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${5 + Math.random() * 10}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`
          }}
        />
      ))}
    </div>
  );
}
