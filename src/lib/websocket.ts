/**
 * WebSocket Manager - Real-time communication with auto-reconnect
 */

import { backendConfig } from './backend-config';

export type WebSocketMessage = {
  type: string;
  payload?: any;
  timestamp?: string;
};

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Set<WebSocketEventHandler>> = new Map();
  private messageQueue: WebSocketMessage[] = [];
  private isConnecting = false;
  private isConnected = false;

  constructor(url?: string) {
    this.url = url || backendConfig.wsUrl;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected || this.isConnecting) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected');
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushMessageQueue();
          this.emit('connected', {});
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          this.emit('error', { error });
        };

        this.ws.onclose = () => {
          console.log('[WebSocket] Disconnected');
          this.isConnected = false;
          this.isConnecting = false;
          this.stopHeartbeat();
          this.emit('disconnected', {});
          this.attemptReconnect();
        };

        // Timeout if connection takes too long
        setTimeout(() => {
          if (this.isConnecting) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Send a message
   */
  send(type: string, payload?: any): void {
    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[WebSocket] Queueing message:', type);
      this.messageQueue.push(message);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[WebSocket] Failed to send message:', error);
      this.messageQueue.push(message);
    }
  }

  /**
   * Subscribe to events
   */
  on(eventType: string, handler: WebSocketEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    connecting: boolean;
    queuedMessages: number;
  } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      queuedMessages: this.messageQueue.length,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleMessage(message: WebSocketMessage): void {
    // Handle pong
    if (message.type === 'pong') {
      this.resetHeartbeatTimeout();
      return;
    }

    // Emit to specific event handlers
    const handlers = this.eventHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('[WebSocket] Handler error:', error);
        }
      });
    }

    // Emit to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('[WebSocket] Wildcard handler error:', error);
        }
      });
    }
  }

  private emit(type: string, payload: any): void {
    this.handleMessage({ type, payload, timestamp: new Date().toISOString() });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send('ping');
      }
    }, 30000); // Ping every 30 seconds

    this.resetHeartbeatTimeout();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }

    this.heartbeatTimeout = setTimeout(() => {
      console.log('[WebSocket] Heartbeat timeout - reconnecting');
      this.ws?.close();
    }, 60000); // Timeout after 60 seconds
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`[WebSocket] Flushing ${this.messageQueue.length} queued messages`);

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.send(message.type, message.payload);
    }
  }
}

// ============================================================================
// Global Instance
// ============================================================================

export const wsManager = new WebSocketManager();

// Auto-connect if in browser
if (typeof window !== 'undefined') {
  wsManager.connect().catch((error) => {
    console.error('[WebSocket] Failed to connect:', error);
  });
}

// ============================================================================
// React Hook
// ============================================================================

export function useWebSocket() {
  return wsManager;
}
