/**
 * Voice Call UI Components
 * React components for WebRTC voice calls
 */

'use client';

import * as React from 'react';
const { useState, useEffect, useRef } = React;

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Settings,
  User
} from 'lucide-react';
import { WebRTCVoiceCall, VoiceCallManager, CallState, CallEvent, formatCallDuration } from '@/lib/voice/webrtc';
import { wsManager } from '@/lib/websocket';

// Call state colors
const getStatusColor = (status: CallState['status']) => {
  switch (status) {
    case 'connecting': return 'blue';
    case 'ringing': return 'yellow';
    case 'active': return 'green';
    case 'ended': return 'gray';
    case 'failed': return 'red';
    default: return 'gray';
  }
};

const getStatusText = (status: CallState['status']) => {
  switch (status) {
    case 'connecting': return 'Connecting...';
    case 'ringing': return 'Ringing...';
    case 'active': return 'Active';
    case 'ended': return 'Call Ended';
    case 'failed': return 'Call Failed';
    default: return 'Unknown';
  }
};

interface VoiceCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callManager: VoiceCallManager;
  currentCall?: WebRTCVoiceCall | null;
  callId?: string;
}

export function VoiceCallDialog({ 
  open, 
  onOpenChange, 
  callManager, 
  currentCall,
  callId 
}: VoiceCallDialogProps): React.ReactElement {
  const [callState, setCallState] = useState<CallState>({
    status: 'idle',
    muted: false,
    speakerEnabled: true,
    quality: 'medium'
  });
  const [volume, setVolume] = useState([50]);
  const [showSettings, setShowSettings] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!currentCall) return;

    // Subscribe to call state changes
    const unsubscribe = currentCall.on((event: CallEvent) => {
      if (event.type === 'state-change') {
        setCallState(event.data);
      } else if (event.type === 'stream-added' && audioRef.current) {
        // Set remote stream to audio element
        audioRef.current.srcObject = event.data;
        audioRef.current.play().catch(console.error);
      }
    });

    // Get initial state
    setCallState(currentCall.getState());

    return unsubscribe;
  }, [currentCall]);

  useEffect(() => {
    // Handle volume changes
    if (audioRef.current) {
      audioRef.current.volume = volume[0] / 100;
    }
  }, [volume]);

  const handleEndCall = async () => {
    if (callId) {
      await callManager.endCall(callId);
    }
    onOpenChange(false);
  };

  const handleToggleMute = () => {
    if (currentCall) {
      currentCall.toggleMute();
    }
  };

  const handleToggleSpeaker = () => {
    if (currentCall) {
      currentCall.toggleSpeaker();
    }
  };

  const handleQualityChange = async (quality: 'low' | 'medium' | 'high') => {
    if (currentCall) {
      await currentCall.setQuality(quality);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...{className: "sm:max-w-md"} as any}>
        <DialogHeader>
          <DialogTitle>
            <Phone className="h-5 w-5 inline mr-2" />
            Voice Call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Call Info */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center w-20 h-20 mx-auto bg-muted rounded-full">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">
                {callState.peer?.displayName || callState.peer?.id || 'Unknown'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline" className={`text-${getStatusColor(callState.status)}-600`}>
                  {getStatusText(callState.status)}
                </Badge>
                {callState.duration !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    {formatCallDuration(callState.duration)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Audio Element */}
          <audio
            ref={audioRef}
            autoPlay
            playsInline
            className="hidden"
          />

          {/* Call Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={callState.muted ? "destructive" : "outline"}
              size="icon"
              onClick={handleToggleMute}
              disabled={callState.status !== 'active'}
            >
              {callState.muted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="destructive"
              size="icon"
              className="h-12 w-12"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-5 w-5" />
            </Button>

            <Button
              variant={callState.speakerEnabled ? "default" : "outline"}
              size="icon"
              onClick={handleToggleSpeaker}
              disabled={callState.status !== 'active'}
            >
              {callState.speakerEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Volume</label>
            <Slider
              value={volume}
              onValueChange={setVolume}
              {...{max: 100, step: 1} as any}
              className="w-full"
            />
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Call Quality</label>
                  <div className="flex gap-2 mt-2">
                    {(['low', 'medium', 'high'] as const).map((quality) => (
                      <Button
                        key={quality}
                        variant={callState.quality === quality ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleQualityChange(quality)}
                        disabled={callState.status !== 'active'}
                      >
                        {quality.charAt(0).toUpperCase() + quality.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                {callState.status === 'active' && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>🎤 Microphone: {callState.muted ? 'Muted' : 'Active'}</p>
                    <p>🔊 Speaker: {callState.speakerEnabled ? 'On' : 'Off'}</p>
                    <p>📶 Quality: {callState.quality}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CallButtonProps {
  peerId: string;
  peerDisplayName?: string;
  className?: string;
  disabled?: boolean;
}

export function CallButton({ 
  peerId, 
  peerDisplayName, 
  className = "",
  disabled = false 
}: CallButtonProps): React.ReactElement {
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [currentCall, setCurrentCall] = useState<WebRTCVoiceCall | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [callManager] = useState(() => new VoiceCallManager(wsManager));

  useEffect(() => {
    // Subscribe to call manager events
    const unsubscribe = callManager.on((event: CallEvent) => {
      if (event.type === 'incoming-call') {
        // Handle incoming call
        console.log('Incoming call:', event.data);
      }
    });

    return unsubscribe;
  }, [callManager]);

  const handleInitiateCall = async () => {
    try {
      const callId = await callManager.initiateCall(peerId, peerDisplayName);
      const call = callManager.getCall(callId);
      
      if (call) {
        setCurrentCall(call);
        setCurrentCallId(callId);
        setIsCallOpen(true);
      }
    } catch (error) {
      console.error('Failed to initiate call:', error);
      alert('Failed to start call. Please check your microphone permissions.');
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleInitiateCall}
        disabled={disabled}
        className={className}
      >
        <Phone className="h-4 w-4 mr-2" />
        Call
      </Button>

      <VoiceCallDialog
        open={isCallOpen}
        onOpenChange={setIsCallOpen}
        callManager={callManager}
        currentCall={currentCall}
        callId={currentCallId || undefined}
      />
    </>
  );
}

interface IncomingCallNotificationProps {
  callId: string;
  offer: string;
  fromId: string;
  fromDisplayName?: string;
  onAccept: (callId: string, offer: string, fromId: string, fromDisplayName?: string) => void;
  onReject: (callId: string) => void;
}

export function IncomingCallNotification({
  callId,
  offer,
  fromId,
  fromDisplayName,
  onAccept,
  onReject
}: IncomingCallNotificationProps): React.ReactElement {
  const [timeRemaining, setTimeRemaining] = useState(30); // 30 second timeout

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev: number) => {
        if (prev <= 1) {
          onReject(callId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [callId, onReject]);

  return (
    <Card className="fixed top-4 right-4 z-50 w-80 shadow-lg border-l-4 border-l-green-500">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full">
              <Phone className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Incoming Voice Call</p>
              <p className="text-sm text-muted-foreground">
                from {fromDisplayName || fromId}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeRemaining}s remaining
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onAccept(callId, offer, fromId, fromDisplayName)}
            >
              <Phone className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => onReject(callId)}
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              Decline
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface VoiceCallManagerProps {
  children?: React.ReactNode;
}

export function VoiceCallProvider({ children }: VoiceCallManagerProps): React.ReactElement {
  const [incomingCalls, setIncomingCalls] = useState<Array<{
    callId: string;
    offer: string;
    fromId: string;
    fromDisplayName?: string;
  }>>([]);
  
  const [activeCall, setActiveCall] = useState<{
    call: WebRTCVoiceCall;
    callId: string;
  } | null>(null);

  const [callManager] = useState(() => new VoiceCallManager(wsManager));

  useEffect(() => {
    // Subscribe to call manager events
    const unsubscribe = callManager.on((event: CallEvent) => {
      if (event.type === 'incoming-call') {
        setIncomingCalls((prev: any[]) => [...prev, {
          callId: event.data.callId,
          offer: event.data.offer,
          fromId: event.data.from,
          fromDisplayName: event.data.fromDisplayName
        }]);
      }
    });

    return unsubscribe;
  }, [callManager]);

  const handleAcceptCall = async (
    callId: string, 
    offer: string, 
    fromId: string, 
    fromDisplayName?: string
  ) => {
    try {
      await callManager.acceptCall(callId, offer, fromId, fromDisplayName);
      const call = callManager.getCall(callId);
      
      if (call) {
        setActiveCall({ call, callId });
      }

      // Remove from incoming calls
      setIncomingCalls((prev: any[]) => prev.filter((c: any) => c.callId !== callId));
    } catch (error) {
      console.error('Failed to accept call:', error);
      handleRejectCall(callId);
    }
  };

  const handleRejectCall = (callId: string) => {
    setIncomingCalls((prev: any[]) => prev.filter((c: any) => c.callId !== callId));
  };

  return (
    <>
      {children}
      
      {/* Incoming call notifications */}
      {incomingCalls.map((call: any) => (
        <IncomingCallNotification
          key={call.callId}
          callId={call.callId}
          offer={call.offer}
          fromId={call.fromId}
          fromDisplayName={call.fromDisplayName}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      ))}

      {/* Active call dialog */}
      {activeCall && (
        <VoiceCallDialog
          open={true}
          onOpenChange={(open) => {
            if (!open && activeCall) {
              callManager.endCall(activeCall.callId);
              setActiveCall(null);
            }
          }}
          callManager={callManager}
          currentCall={activeCall.call}
          callId={activeCall.callId}
        />
      )}
    </>
  );
}