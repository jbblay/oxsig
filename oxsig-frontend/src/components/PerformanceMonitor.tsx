"use client";

import { useEffect } from 'react';

/**
 * Performance monitoring hook and component
 * Tracks Core Web Vitals and reports performance metrics
 */

interface PerformanceMetrics {
  fcp?: number;  // First Contentful Paint
  lcp?: number;  // Largest Contentful Paint
  fid?: number;  // First Input Delay
  cls?: number;  // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte
}

/**
 * Hook to track and report performance metrics
 */
export function usePerformanceMonitoring() {
  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') {
      return;
    }

    const reportMetrics = (metrics: PerformanceMetrics) => {
      // In production, send to analytics service
      console.log('Performance Metrics:', metrics);
      
      // Example: Send to analytics
      // fetch('/api/analytics/performance', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(metrics),
      // });
    };

    // Track Core Web Vitals
    if ('web-vitals' in window || typeof window.PerformanceObserver !== 'undefined') {
      // First Contentful Paint
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcp = entries.find(entry => entry.name === 'first-contentful-paint');
        if (fcp) {
          reportMetrics({ fcp: fcp.startTime });
        }
      }).observe({ entryTypes: ['paint'] });

      // Largest Contentful Paint
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lcp = entries[entries.length - 1];
        if (lcp) {
          reportMetrics({ lcp: lcp.startTime });
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.processingStart && entry.startTime) {
            const fid = entry.processingStart - entry.startTime;
            reportMetrics({ fid });
          }
        });
      }).observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      let clsScore = 0;
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsScore += entry.value;
          }
        });
        reportMetrics({ cls: clsScore });
      }).observe({ entryTypes: ['layout-shift'] });
    }

    // Navigation Timing
    if ('performance' in window && 'getEntriesByType' in performance) {
      const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navigationEntries.length > 0) {
        const entry = navigationEntries[0];
        const ttfb = entry.responseStart - entry.requestStart;
        reportMetrics({ ttfb });
      }
    }

    // Memory usage (Chrome only)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      console.log('Memory Usage:', {
        used: `${Math.round(memory.usedJSHeapSize / 1048576)} MB`,
        total: `${Math.round(memory.totalJSHeapSize / 1048576)} MB`,
        limit: `${Math.round(memory.jsHeapSizeLimit / 1048576)} MB`,
      });
    }
  }, []);
}

/**
 * Performance monitoring component that can be added to layouts
 */
export function PerformanceMonitor() {
  usePerformanceMonitoring();
  return null;
}

/**
 * Development bundle info logger
 */
export function BundleAnalyzer() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && 'performance' in window) {
      // Log basic performance info in development
      setTimeout(() => {
        const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        if (entries.length > 0) {
          const entry = entries[0];
          console.log('Bundle Load Performance:', {
            domContentLoaded: `${Math.round(entry.domContentLoadedEventEnd - entry.startTime)}ms`,
            loadComplete: `${Math.round(entry.loadEventEnd - entry.startTime)}ms`,
            transferSize: entry.transferSize ? `${Math.round(entry.transferSize / 1024)}KB` : 'unknown',
          });
        }
      }, 1000);
    }
  }, []);

  return null;
}

export default PerformanceMonitor;