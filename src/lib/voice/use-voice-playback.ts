'use client';

import * as React from 'react';
import { requestOxsigVoiceAudio } from './client';

export function useOxsigVoicePlayback() {
  const [speakingKey, setSpeakingKey] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const generationRef = React.useRef(0);

  const stop = React.useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSpeakingKey(null);
  }, []);

  React.useEffect(() => stop, [stop]);

  const play = React.useCallback(async (text: string, key: string) => {
    stop();
    const generation = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setSpeakingKey(key);

    try {
      const blob = await requestOxsigVoiceAudio(text, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;

      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('The ElevenLabs audio stream could not be played.'));
        void audio.play().catch(reject);
      });
    } finally {
      if (generation === generationRef.current) stop();
    }
  }, [stop]);

  return { speakingKey, play, stop };
}
