// Backend service configuration
// This connects the Next.js frontend to the backend services

export const backendConfig = {
  // WebSocket Gateway
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api',
  
  // Storage
  storageUrl: process.env.NEXT_PUBLIC_STORAGE_URL || 'http://localhost:9000',
  
  // Search
  searchUrl: process.env.NEXT_PUBLIC_SEARCH_URL || 'http://localhost:7700',
  searchKey: process.env.NEXT_PUBLIC_SEARCH_KEY || '',
  
  // TURN Server for WebRTC
  turnUrl: process.env.NEXT_PUBLIC_TURN_URL || 'turn:localhost:3478',
  turnUsername: process.env.NEXT_PUBLIC_TURN_USERNAME || 'oxsig',
  turnCredential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '',
  
  // Database (for server-side operations)
  databaseUrl: process.env.DATABASE_URL || 'postgres://oxsig:changeme@localhost:5432/oxsig',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
} as const;

// Check if backend is available
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${backendConfig.apiUrl.replace('/api', '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    console.warn('Backend health check failed:', error);
    return false;
  }
}

// WebSocket connection helper
export function createWebSocketConnection(onMessage?: (data: any) => void): WebSocket {
  // Append JWT token from localStorage if present
  let url = backendConfig.wsUrl;
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token) {
      const u = new URL(url);
      u.searchParams.set('token', token);
      url = u.toString();
    }
  } catch {}
  const ws = new WebSocket(url);
  
  ws.onopen = () => {
    console.log('✅ Connected to WebSocket Gateway');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage?.(data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };
  
  ws.onclose = () => {
    console.log('🔌 WebSocket connection closed');
  };
  
  return ws;
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
