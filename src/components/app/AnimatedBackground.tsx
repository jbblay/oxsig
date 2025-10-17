"use client";

import * as React from "react";

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      {/* Gradient Orbs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-3xl opacity-70 animate-blob" />
      <div className="absolute top-0 -right-4 w-96 h-96 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
      
      {/* Animated Network Lines */}
      <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Diagonal Lines */}
        <line x1="0" y1="0" x2="100%" y2="100%" stroke="url(#line-gradient)" strokeWidth="2" className="animate-pulse" />
        <line x1="100%" y1="0" x2="0" y2="100%" stroke="url(#line-gradient)" strokeWidth="2" className="animate-pulse" style={{ animationDelay: '1s' }} />
        
        {/* Horizontal Lines */}
        <line x1="0" y1="33%" x2="100%" y2="33%" stroke="url(#line-gradient)" strokeWidth="1" opacity="0.5" className="animate-pulse" style={{ animationDelay: '2s' }} />
        <line x1="0" y1="66%" x2="100%" y2="66%" stroke="url(#line-gradient)" strokeWidth="1" opacity="0.5" className="animate-pulse" style={{ animationDelay: '3s' }} />
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
          className="absolute w-2 h-2 bg-blue-500 rounded-full animate-ping"
          style={{
            left: node.x,
            top: node.y,
            animationDelay: node.delay,
            animationDuration: '3s'
          }}
        />
      ))}

      {/* Floating Particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-blue-400/40 rounded-full"
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
