/**
 * WebRTC Voice Call System
 * Implements secure voice communication with E2E encryption
 */

// Declare global process for Node.js environment variables
declare const process: any;

export interface VoiceCallConfig {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate?: number;
  channelCount?: number;
}

export interface CallPeer {
  id: string;
  displayName?: string;
  publicKey?: string;
}

export interface CallState {
  status: 'idle' | 'connecting' | 'ringing' | 'active' | 'ended' | 'failed';
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  peer?: CallPeer;
  startTime?: Date;
  duration?: number;
  muted: boolean;
  speakerEnabled: boolean;
  quality: 'low' | 'medium' | 'high';
}

export type CallEventHandler = (event: CallEvent) => void;

export interface CallEvent {
  type: 'state-change' | 'stream-added' | 'stream-removed' | 'error' | 'quality-change' | 'ice-candidate' | 'incoming-call';
  data?: any;
}

export class WebRTCVoiceCall {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isInitiator = false;
  private callId: string;
  private eventHandlers: Set<CallEventHandler> = new Set();
  
  private state: CallState = {
    status: 'idle',
    muted: false,
    speakerEnabled: true,
    quality: 'medium'
  };

  private config: VoiceCallConfig = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1
  };

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
  ];

  constructor(callId: string, config?: Partial<VoiceCallConfig>) {
    this.callId = callId;
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Load TURN servers from environment
    const turnUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_URL : undefined;
    const turnUsername = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_USERNAME : undefined;
    const turnCredential = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_CREDENTIAL : undefined;

    if (turnUrl) {
      this.iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential
      });
    }
  }

  /**
   * Initialize call as initiator
   */
  async initiate(peer: CallPeer): Promise<string> {
    this.isInitiator = true;
    this.state.peer = peer;
    this.updateState({ status: 'connecting' });

    try {
      await this.setupLocalStream();
      await this.createPeerConnection();
      const offer = await this.createOffer();
      
      this.updateState({ status: 'ringing' });
      return offer;
    } catch (error) {
      this.updateState({ status: 'failed' });
      this.emitEvent({ type: 'error', data: error });
      throw error;
    }
  }

  /**
   * Accept incoming call
   */
  async accept(offer: string, peer: CallPeer): Promise<string> {
    this.isInitiator = false;
    this.state.peer = peer;
    this.updateState({ status: 'connecting' });

    try {
      await this.setupLocalStream();
      await this.createPeerConnection();
      const answer = await this.createAnswer(offer);
      
      this.updateState({ status: 'active', startTime: new Date() });
      this.startCallTimer();
      
      return answer;
    } catch (error) {
      this.updateState({ status: 'failed' });
      this.emitEvent({ type: 'error', data: error });
      throw error;
    }
  }

  /**
   * Complete call setup (for initiator)
   */
  async completeSetup(answer: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      const answerDesc = new RTCSessionDescription(JSON.parse(answer));
      await this.peerConnection.setRemoteDescription(answerDesc);
      
      this.updateState({ status: 'active', startTime: new Date() });
      this.startCallTimer();
    } catch (error) {
      this.updateState({ status: 'failed' });
      this.emitEvent({ type: 'error', data: error });
      throw error;
    }
  }

  /**
   * End the call
   */
  async end(): Promise<void> {
    this.updateState({ status: 'ended' });
    
    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Clear remote stream
    this.remoteStream = null;
    
    this.updateState({ 
      localStream: undefined, 
      remoteStream: undefined,
      duration: this.calculateDuration()
    });
  }

  /**
   * Mute/unmute microphone
   */
  toggleMute(): boolean {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.state.muted = !audioTrack.enabled;
      this.updateState({ muted: this.state.muted });
      return this.state.muted;
    }
    return false;
  }

  /**
   * Toggle speaker on/off
   */
  toggleSpeaker(): boolean {
    this.state.speakerEnabled = !this.state.speakerEnabled;
    this.updateState({ speakerEnabled: this.state.speakerEnabled });
    
    // Set audio output device if supported
    if (this.remoteStream && 'setSinkId' in HTMLAudioElement.prototype) {
      const audioElement = document.querySelector('audio');
      if (audioElement && (audioElement as any).setSinkId) {
        const deviceId = this.state.speakerEnabled ? 'default' : '';
        (audioElement as any).setSinkId(deviceId).catch((error: any) => {
          console.warn('Failed to set audio output device:', error);
        });
      }
    }
    
    return this.state.speakerEnabled;
  }

  /**
   * Set call quality
   */
  async setQuality(quality: 'low' | 'medium' | 'high'): Promise<void> {
    this.state.quality = quality;
    
    if (this.peerConnection && this.localStream) {
      const sender = this.peerConnection.getSenders().find(
        s => s.track && s.track.kind === 'audio'
      );
      
      if (sender && sender.track) {
        const constraints = this.getAudioConstraints(quality);
        await sender.track.applyConstraints(constraints);
        this.updateState({ quality });
        this.emitEvent({ type: 'quality-change', data: quality });
      }
    }
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn('Failed to add ICE candidate:', error);
    }
  }

  /**
   * Get current call state
   */
  getState(): CallState {
    return { ...this.state };
  }

  /**
   * Subscribe to call events
   */
  on(handler: CallEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Get call statistics
   */
  async getStats(): Promise<RTCStatsReport | null> {
    if (!this.peerConnection) return null;
    return await this.peerConnection.getStats();
  }

  // Private methods

  private async setupLocalStream(): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: this.getAudioConstraints(this.state.quality),
        video: false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.updateState({ localStream: this.localStream });
      
      console.log('Local audio stream created');
    } catch (error) {
      console.error('Failed to get user media:', error);
      throw new Error('Failed to access microphone');
    }
  }

  private getAudioConstraints(quality: 'low' | 'medium' | 'high'): MediaTrackConstraints {
    const baseConstraints: MediaTrackConstraints = {
      echoCancellation: this.config.echoCancellation,
      noiseSuppression: this.config.noiseSuppression,
      autoGainControl: this.config.autoGainControl,
      channelCount: this.config.channelCount
    };

    switch (quality) {
      case 'low':
        return {
          ...baseConstraints,
          sampleRate: 16000,
          sampleSize: 16
        };
      case 'high':
        return {
          ...baseConstraints,
          sampleRate: 48000,
          sampleSize: 24
        };
      default: // medium
        return {
          ...baseConstraints,
          sampleRate: this.config.sampleRate || 44100,
          sampleSize: 16
        };
    }
  }

  private async createPeerConnection(): Promise<void> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10
    });

    // Add local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track');
      this.remoteStream = event.streams[0];
      this.updateState({ remoteStream: this.remoteStream });
      this.emitEvent({ type: 'stream-added', data: this.remoteStream });
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emitEvent({ 
          type: 'ice-candidate', 
          data: event.candidate.toJSON() 
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;
      console.log('Connection state:', state);
      
      if (state === 'connected') {
        this.updateState({ status: 'active' });
      } else if (state === 'failed' || state === 'disconnected') {
        this.updateState({ status: 'failed' });
        this.emitEvent({ type: 'error', data: 'Connection failed' });
      }
    };

    console.log('Peer connection created');
  }

  private async createOffer(): Promise<string> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });

    await this.peerConnection.setLocalDescription(offer);
    
    // Wait for ICE gathering
    await this.waitForIceGathering();
    
    return JSON.stringify(this.peerConnection.localDescription);
  }

  private async createAnswer(offerString: string): Promise<string> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = new RTCSessionDescription(JSON.parse(offerString));
    await this.peerConnection.setRemoteDescription(offer);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    // Wait for ICE gathering
    await this.waitForIceGathering();
    
    return JSON.stringify(this.peerConnection.localDescription);
  }

  private async waitForIceGathering(): Promise<void> {
    if (!this.peerConnection) return;
    
    if (this.peerConnection.iceGatheringState === 'complete') {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.peerConnection!.removeEventListener('icegatheringstatechange', handler);
        resolve();
      }, 5000);

      const handler = () => {
        if (this.peerConnection && this.peerConnection.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          this.peerConnection.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };

      if (this.peerConnection) {
        this.peerConnection.addEventListener('icegatheringstatechange', handler);
      }
    });
  }

  private updateState(updates: Partial<CallState>): void {
    this.state = { ...this.state, ...updates };
    this.emitEvent({ type: 'state-change', data: this.state });
  }

  private emitEvent(event: CallEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in call event handler:', error);
      }
    });
  }

  private startCallTimer(): void {
    const interval = setInterval(() => {
      if (this.state.status === 'active' && this.state.startTime) {
        const duration = this.calculateDuration();
        this.updateState({ duration });
      } else {
        clearInterval(interval);
      }
    }, 1000);
  }

  private calculateDuration(): number {
    if (!this.state.startTime) return 0;
    return Math.floor((Date.now() - this.state.startTime.getTime()) / 1000);
  }
}

/**
 * Voice call manager - handles multiple calls and signaling
 */
export class VoiceCallManager {
  private calls: Map<string, WebRTCVoiceCall> = new Map();
  private wsManager: any; // WebSocket manager for signaling
  private eventHandlers: Set<CallEventHandler> = new Set();

  constructor(wsManager: any) {
    this.wsManager = wsManager;
    this.setupSignaling();
  }

  /**
   * Initiate a call to a peer
   */
  async initiateCall(peerId: string, peerDisplayName?: string): Promise<string> {
    const callId = this.generateCallId();
    const call = new WebRTCVoiceCall(callId);
    
    // Subscribe to call events
    call.on((event) => {
      if (event.type === 'ice-candidate') {
        this.wsManager.sendIceCandidate(peerId, event.data, callId);
      }
      this.emitEvent(event);
    });

    this.calls.set(callId, call);

    try {
      const offer = await call.initiate({
        id: peerId,
        displayName: peerDisplayName
      });

      // Send offer via signaling
      this.wsManager.send('voice-call-offer', {
        to: peerId,
        callId,
        offer
      });

      return callId;
    } catch (error) {
      this.calls.delete(callId);
      throw error;
    }
  }

  /**
   * Accept an incoming call
   */
  async acceptCall(callId: string, offer: string, peerId: string, peerDisplayName?: string): Promise<void> {
    const call = new WebRTCVoiceCall(callId);
    
    // Subscribe to call events
    call.on((event) => {
      if (event.type === 'ice-candidate') {
        this.wsManager.sendIceCandidate(peerId, event.data, callId);
      }
      this.emitEvent(event);
    });

    this.calls.set(callId, call);

    try {
      const answer = await call.accept(offer, {
        id: peerId,
        displayName: peerDisplayName
      });

      // Send answer via signaling
      this.wsManager.send('voice-call-answer', {
        to: peerId,
        callId,
        answer
      });
    } catch (error) {
      this.calls.delete(callId);
      throw error;
    }
  }

  /**
   * End a call
   */
  async endCall(callId: string): Promise<void> {
    const call = this.calls.get(callId);
    if (call) {
      await call.end();
      this.calls.delete(callId);
    }
  }

  /**
   * Get call by ID
   */
  getCall(callId: string): WebRTCVoiceCall | undefined {
    return this.calls.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): WebRTCVoiceCall[] {
    return Array.from(this.calls.values()).filter(
      call => call.getState().status === 'active'
    );
  }

  /**
   * Subscribe to call manager events
   */
  on(handler: CallEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private setupSignaling(): void {
    // Handle incoming offers
    this.wsManager.on('voice-call-offer', (data: any) => {
      this.emitEvent({
        type: 'incoming-call',
        data: {
          callId: data.callId,
          offer: data.offer,
          from: data.from
        }
      });
    });

    // Handle answers
    this.wsManager.on('voice-call-answer', async (data: any) => {
      const call = this.calls.get(data.callId);
      if (call) {
        await call.completeSetup(data.answer);
      }
    });

    // Handle ICE candidates
    this.wsManager.on('ice-candidate', async (data: any) => {
      const call = this.calls.get(data.callId);
      if (call) {
        await call.addIceCandidate(data.candidate);
      }
    });

    // Handle call end
    this.wsManager.on('voice-call-end', (data: any) => {
      this.endCall(data.callId);
    });
  }

  private emitEvent(event: CallEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in call manager event handler:', error);
      }
    });
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export convenience functions
export function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function getAudioDevices(): Promise<MediaDeviceInfo[]> {
  return navigator.mediaDevices.enumerateDevices()
    .then(devices => devices.filter(device => device.kind === 'audioinput'));
}

export function getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
  return navigator.mediaDevices.enumerateDevices()
    .then(devices => devices.filter(device => device.kind === 'audiooutput'));
}