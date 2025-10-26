/**
 * WebSocket Manager - Real-time communication with Socket.io
 * Migrated from custom WebSocket to Socket.io client
 */

import { io, Socket } from 'socket.io-client';
import { debug } from '@/lib/utils/debug';

export type WebSocketMessage = {
  type: string;
  payload?: any;
  timestamp?: string;
  from?: string;
  to?: string;
  room?: string;
};

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

export class WebSocketManager {
  private socket: Socket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private eventHandlers: Map<string, Set<WebSocketEventHandler>> = new Map();
  private messageQueue: WebSocketMessage[] = [];
  private isConnecting = false;
  private isConnected = false;
  private userId: string | null = null;

  constructor(url?: string) {
    // Default to Next.js server
    this.url = url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  }

  /**
   * Connect to Socket.io server
   */
  connect(userId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected || this.isConnecting) {
        resolve();
        return;
      }

      this.isConnecting = true;
      this.userId = userId || null;

      try {
        // Initialize Socket.io client
        this.socket = io(this.url, {
          path: '/socket.io/',
          transports: ['websocket', 'polling'],
          auth: {
            userId: this.userId,
          },
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
          debug.log('[Socket.io] Connected:', this.socket?.id);
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.flushMessageQueue();
          this.emit('connected', {});
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          debug.error('[Socket.io] Connection error:', error);
          this.emit('error', { error });
        });

        this.socket.on('disconnect', (reason) => {
          debug.log('[Socket.io] Disconnected:', reason);
          this.isConnected = false;
          this.emit('disconnected', { reason });
        });

        // Handle all custom events
        this.socket.onAny((eventName, ...args) => {
          const message: WebSocketMessage = {
            type: eventName,
            payload: args[0],
            timestamp: new Date().toISOString(),
          };
          this.handleMessage(message);
        });

        // Timeout if connection takes too long
        setTimeout(() => {
          if (this.isConnecting) {
            this.socket?.disconnect();
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
   * Disconnect from Socket.io server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
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

    if (!this.isConnected || !this.socket) {
      debug.log('[Socket.io] Queueing message:', type);
      this.messageQueue.push(message);
      return;
    }

    try {
      this.socket.emit(type, payload);
    } catch (error) {
      debug.error('[Socket.io] Failed to send message:', error);
      this.messageQueue.push(message);
    }
  }

  /**
   * Join a room
   */
  joinRoom(room: string, userId?: string): void {
    this.send('join-room', { room, userId: userId || this.userId });
  }

  /**
   * Leave a room
   */
  leaveRoom(room: string, userId?: string): void {
    this.send('leave-room', { room, userId: userId || this.userId });
  }

  /**
   * Send WebRTC offer
   */
  sendOffer(to: string, sdp: string, from?: string): void {
    this.send('offer', { to, from: from || this.userId, sdp });
  }

  /**
   * Send WebRTC answer
   */
  sendAnswer(to: string, sdp: string, from?: string): void {
    this.send('answer', { to, from: from || this.userId, sdp });
  }

  /**
   * Send ICE candidate
   */
  sendIceCandidate(to: string, candidate: any, from?: string): void {
    this.send('ice-candidate', { to, from: from || this.userId, candidate });
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
    // Emit to specific event handlers
    const handlers = this.eventHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          debug.error('[Socket.io] Handler error:', error);
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
          debug.error('[Socket.io] Wildcard handler error:', error);
        }
      });
    }
  }

  private emit(type: string, payload: any): void {
    this.handleMessage({ type, payload, timestamp: new Date().toISOString() });
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    debug.log(`[Socket.io] Flushing ${this.messageQueue.length} queued messages`);

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
  // Wait for user authentication before auto-connecting
  // wsManager.connect().catch((error) => {
  //   console.error('[Socket.io] Failed to connect:', error);
  // });
}

// ============================================================================
// React Hook
// ============================================================================

export function useWebSocket() {
  return wsManager;
}
