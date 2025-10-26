/**
 * Debug Utility
 * Only logs in development mode to prevent console spam in production
 */

const IS_DEV = process.env.NODE_ENV === 'development';
const IS_BROWSER = typeof window !== 'undefined';

export const debug = {
  log: (...args: any[]) => {
    if (IS_DEV) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (IS_DEV) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  },
  
  info: (...args: any[]) => {
    if (IS_DEV) {
      console.info(...args);
    }
  },
  
  table: (data: any) => {
    if (IS_DEV && console.table) {
      console.table(data);
    }
  },
  
  group: (label: string) => {
    if (IS_DEV && console.group) {
      console.group(label);
    }
  },
  
  groupEnd: () => {
    if (IS_DEV && console.groupEnd) {
      console.groupEnd();
    }
  },
};

/**
 * Performance measurement utility
 */
export const perf = {
  start: (label: string) => {
    if (IS_DEV && IS_BROWSER && performance.mark) {
      performance.mark(`${label}-start`);
    }
  },
  
  end: (label: string) => {
    if (IS_DEV && IS_BROWSER && performance.mark && performance.measure) {
      performance.mark(`${label}-end`);
      try {
        performance.measure(label, `${label}-start`, `${label}-end`);
        const measure = performance.getEntriesByName(label)[0];
        debug.log(`⏱️ ${label}: ${measure.duration.toFixed(2)}ms`);
      } catch (e) {
        // Ignore if marks don't exist
      }
    }
  },
};

export default debug;
