'use client';

import * as React from 'react';
import { requestOxsigVoiceTranscript, type OxsigVoiceTranscript } from './client';

export type OxsigVoiceInputState = 'idle' | 'requesting-permission' | 'recording' | 'processing' | 'error';

type VoiceInputOptions = {
  onTranscript: (result: OxsigVoiceTranscript) => void;
  onError?: (error: Error) => void;
  maxDurationMs?: number;
};

const RECORDING_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

function preferredRecordingType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return new Error('Microphone permission was denied. Allow microphone access to use voice input.');
    }
    if (error.name === 'NotFoundError') return new Error('No microphone was found on this device.');
    if (error.name === 'NotReadableError') return new Error('The microphone is already in use or unavailable.');
  }
  return error instanceof Error ? error : new Error('Could not start microphone recording.');
}

export function useOxsigVoiceInput({
  onTranscript,
  onError,
  maxDurationMs = 60_000,
}: VoiceInputOptions) {
  const [state, setState] = React.useState<OxsigVoiceInputState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<number | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const cancelledRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const onTranscriptRef = React.useRef(onTranscript);
  const onErrorRef = React.useRef(onError);

  React.useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onError, onTranscript]);

  React.useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia)
      && typeof MediaRecorder !== 'undefined'
    );
  }, []);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = React.useCallback(() => {
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    streamRef.current = null;
  }, []);

  const reportError = React.useCallback((value: unknown) => {
    const next = microphoneError(value);
    if (mountedRef.current) {
      setError(next.message);
      setState('error');
    }
    onErrorRef.current?.(next);
  }, []);

  const stop = React.useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, [clearTimer]);

  const cancel = React.useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else stopTracks();
    if (mountedRef.current) {
      setError(null);
      setState('idle');
    }
  }, [clearTimer, stopTracks]);

  const start = React.useCallback(async () => {
    if (
      typeof navigator === 'undefined'
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === 'undefined'
    ) {
      reportError(new Error('Voice input is not supported by this browser.'));
      return;
    }
    if (recorderRef.current?.state === 'recording' || abortRef.current) return;

    setError(null);
    setState('requesting-permission');
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current || cancelledRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      const mimeType = preferredRecordingType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onerror = (event) => {
        cancelledRef.current = true;
        chunksRef.current = [];
        recorder.onstop = null;
        recorderRef.current = null;
        clearTimer();
        stopTracks();
        reportError((event as Event & { error?: DOMException }).error || new Error('Microphone recording failed.'));
      };

      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        recorderRef.current = null;

        if (cancelledRef.current) {
          chunksRef.current = [];
          if (mountedRef.current) setState('idle');
          return;
        }

        const chunks = chunksRef.current;
        chunksRef.current = [];
        const recordingType = recorder.mimeType || chunks[0]?.type || mimeType || 'audio/webm';
        const audio = new Blob(chunks, { type: recordingType });
        if (!audio.size) {
          reportError(new Error('No microphone audio was captured.'));
          return;
        }

        if (mountedRef.current) setState('processing');
        const controller = new AbortController();
        abortRef.current = controller;
        void requestOxsigVoiceTranscript(audio, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return;
            onTranscriptRef.current(result);
            if (mountedRef.current) {
              setError(null);
              setState('idle');
            }
          })
          .catch((value) => {
            if (controller.signal.aborted) return;
            reportError(value);
          })
          .finally(() => {
            if (abortRef.current === controller) abortRef.current = null;
          });
      };

      recorder.start(250);
      setState('recording');
      timerRef.current = window.setTimeout(() => stop(), Math.max(1_000, maxDurationMs));
    } catch (value) {
      clearTimer();
      stopTracks();
      recorderRef.current = null;
      reportError(value);
    }
  }, [clearTimer, maxDurationMs, reportError, stop, stopTracks]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      clearTimer();
      abortRef.current?.abort();
      abortRef.current = null;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      for (const track of streamRef.current?.getTracks() || []) track.stop();
    };
  }, [clearTimer]);

  return {
    state,
    error,
    supported,
    recording: state === 'recording',
    processing: state === 'processing',
    start,
    stop,
    cancel,
  };
}
