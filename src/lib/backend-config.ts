// Backend service configuration
// Now using Next.js full-stack (no separate Rust backend)

export const backendConfig = {
  // WebSocket via Socket.io (Next.js custom server)
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 
         (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
  
  // API routes (Next.js)
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 
          (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api'),
  
  // Storage (S3/MinIO)
  storageUrl: process.env.NEXT_PUBLIC_STORAGE_URL || 'http://localhost:9000',
  
  // Search (MeiliSearch)
  searchUrl: process.env.NEXT_PUBLIC_SEARCH_URL || 'http://localhost:7700',
  searchKey: process.env.NEXT_PUBLIC_SEARCH_KEY || '',
  
  // TURN Server for WebRTC (optional)
  turnUrl: process.env.NEXT_PUBLIC_TURN_URL || '',
  turnUsername: process.env.NEXT_PUBLIC_TURN_USERNAME || '',
  turnCredential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '',
  
  // Database (for server-side operations)
  databaseUrl: process.env.DATABASE_URL || 'postgres://oxsig:changeme@localhost:5432/oxsig',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
} as const;

// Check if backend is available
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const baseUrl = backendConfig.apiUrl.replace('/api', '');
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    console.warn('Backend health check failed:', error);
    return false;
  }
}

// WebSocket connection helper (Socket.io) - DEPRECATED
export function createWebSocketConnection(onMessage?: (data: any) => void, userId?: string): any {
  console.warn('createWebSocketConnection is deprecated. Use wsManager from @/lib/websocket instead.');
  return null;
}

// API fetch helper with backend endpoint
export async function apiFetch(endpoint: string, options?: RequestInit) {
  const url = `${backendConfig.apiUrl}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`API fetch failed for ${endpoint}:`, error);
    throw error;
  }
}
