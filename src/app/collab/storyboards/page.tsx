"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleStop,
  Eraser,
  Mic,
  Play,
  Radio,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  deleteStoryboardDraft,
  listStoryboardDrafts,
  saveStoryboardDraft,
} from "@/lib/storyboards/storage";
import type {
  StoryboardDraft,
  StoryboardEvent,
  StoryboardPoint,
} from "@/lib/storyboards/types";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function eventId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function StoryboardsPage() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const eventsRef = React.useRef<StoryboardEvent[]>([]);
  const startTimeRef = React.useRef<number>(0);
  const lastPointRef = React.useRef<StoryboardPoint | null>(null);
  const drawingRef = React.useRef(false);
  const playbackFrameRef = React.useRef<number | null>(null);
  const playbackIndexRef = React.useRef(0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const [title, setTitle] = React.useState("Untitled storyboard");
  const [isRecording, setIsRecording] = React.useState(false);
  const [drafts, setDrafts] = React.useState<StoryboardDraft[]>([]);
  const [activeDraft, setActiveDraft] = React.useState<StoryboardDraft | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [recordingSupported, setRecordingSupported] = React.useState(true);

  const loadDrafts = React.useCallback(async () => {
    const stored = await listStoryboardDrafts();
    setDrafts(stored);
  }, []);

  React.useEffect(() => {
    setRecordingSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        !!navigator.mediaDevices?.getUserMedia
    );
    void loadDrafts();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
    };
  }, [loadDrafts]);

  React.useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const getContext = React.useCallback(() => {
    return canvasRef.current?.getContext("2d") || null;
  }, []);

  const clearCanvas = React.useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [getContext]);

  const renderEvent = React.useCallback(
    (event: StoryboardEvent) => {
      const ctx = getContext();
      if (!ctx) return;

      if (event.type === "clear") {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        return;
      }

      ctx.strokeStyle = event.color;
      ctx.lineWidth = event.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(event.from.x * CANVAS_WIDTH, event.from.y * CANVAS_HEIGHT);
      ctx.lineTo(event.to.x * CANVAS_WIDTH, event.to.y * CANVAS_HEIGHT);
      ctx.stroke();
    },
    [getContext]
  );

  const pointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): StoryboardPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const appendEvent = React.useCallback((event: StoryboardEvent) => {
    eventsRef.current.push(event);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isRecording) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromPointer(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isRecording || !drawingRef.current || !lastPointRef.current) return;

    const next = pointFromPointer(event);
    const drawEvent: StoryboardEvent = {
      id: eventId(),
      type: "draw",
      t: performance.now() - startTimeRef.current,
      from: lastPointRef.current,
      to: next,
      width: 4,
      color: "#0ea5e9",
    };

    appendEvent(drawEvent);
    renderEvent(drawEvent);
    lastPointRef.current = next;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    clearCanvas();
    if (!isRecording) return;
    appendEvent({
      id: eventId(),
      type: "clear",
      t: performance.now() - startTimeRef.current,
    });
  };

  const startRecording = async () => {
    if (!recordingSupported) {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      eventsRef.current = [];
      startTimeRef.current = performance.now();
      clearCanvas();
      setActiveDraft(null);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const durationMs = performance.now() - startTimeRef.current;
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const now = Date.now();
        const draft: StoryboardDraft = {
          id: eventId(),
          title: title.trim() || "Untitled storyboard",
          createdAt: now,
          updatedAt: now,
          durationMs,
          events: [...eventsRef.current],
          audio,
          audioMimeType: audio.type,
          status: "local-draft",
        };

        await saveStoryboardDraft(draft);
        setActiveDraft(draft);
        await loadDrafts();
        toast.success("Storyboard saved on this device.");
      };

      recorder.start(250);
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start storyboard recording:", error);
      toast.error("Microphone access is required to record a storyboard.");
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const stopPlayback = React.useCallback(() => {
    if (playbackFrameRef.current) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const playDraft = React.useCallback(
    (draft: StoryboardDraft) => {
      stopPlayback();
      setActiveDraft(draft);
      clearCanvas();
      playbackIndexRef.current = 0;

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const nextAudioUrl = draft.audio ? URL.createObjectURL(draft.audio) : null;
      setAudioUrl(nextAudioUrl);

      requestAnimationFrame(() => {
        const audio = audioRef.current;
        if (!audio || !nextAudioUrl) return;
        audio.currentTime = 0;

        const tick = () => {
          const elapsedMs = audio.currentTime * 1000;
          while (
            playbackIndexRef.current < draft.events.length &&
            draft.events[playbackIndexRef.current].t <= elapsedMs
          ) {
            renderEvent(draft.events[playbackIndexRef.current]);
            playbackIndexRef.current += 1;
          }

          if (!audio.paused && !audio.ended) {
            playbackFrameRef.current = requestAnimationFrame(tick);
          }
        };

        void audio.play().then(() => {
          playbackFrameRef.current = requestAnimationFrame(tick);
        });
      });
    },
    [audioUrl, clearCanvas, renderEvent, stopPlayback]
  );

  const removeDraft = async (id: string) => {
    stopPlayback();
    await deleteStoryboardDraft(id);
    if (activeDraft?.id === id) {
      setActiveDraft(null);
      clearCanvas();
    }
    await loadDrafts();
    toast.success("Storyboard draft deleted.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/collab" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Collaboration
            </Link>
            <span>/</span>
            <span>Storyboards</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Storyboards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record an explanation as synchronized drawing events and audio.
          </p>
        </div>
        <Badge variant="outline">Local Draft Mode</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="space-y-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5" />
                  Recorder
                </CardTitle>
                <CardDescription>
                  The first practical version records freehand drawing with precise audio-relative timestamps.
                </CardDescription>
              </div>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Storyboard title"
                disabled={isRecording}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-xl border bg-white dark:bg-slate-950">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className={`block aspect-video w-full touch-none ${isRecording ? "cursor-crosshair" : "cursor-default"}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {!isRecording ? (
                  <Button onClick={startRecording} disabled={!recordingSupported} className="gap-2">
                    <Mic className="h-4 w-4" />
                    Start Recording
                  </Button>
                ) : (
                  <Button onClick={stopRecording} variant="destructive" className="gap-2">
                    <CircleStop className="h-4 w-4" />
                    Stop & Save
                  </Button>
                )}
                <Button onClick={handleClear} variant="outline" className="gap-2">
                  <Eraser className="h-4 w-4" />
                  Clear Board
                </Button>
                {activeDraft && !isRecording && (
                  <Button onClick={() => playDraft(activeDraft)} variant="outline" className="gap-2">
                    <Play className="h-4 w-4" />
                    Replay
                  </Button>
                )}
              </div>

              {!recordingSupported && (
                <p className="text-sm text-destructive">
                  This browser does not expose the MediaRecorder and microphone APIs required for Storyboards.
                </p>
              )}

              {audioUrl && (
                <audio ref={audioRef} src={audioUrl} controls className="w-full" onEnded={stopPlayback} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What is real in this version</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
              <div className="rounded-lg border p-3">
                <strong>Audio</strong>
                <p className="text-muted-foreground mt-1">Captured from the browser microphone using MediaRecorder.</p>
              </div>
              <div className="rounded-lg border p-3">
                <strong>Timeline</strong>
                <p className="text-muted-foreground mt-1">Every drawing segment and clear action receives a recording-relative timestamp.</p>
              </div>
              <div className="rounded-lg border p-3">
                <strong>Playback</strong>
                <p className="text-muted-foreground mt-1">Drawing events are reconstructed against the recorded audio clock.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Save className="h-4 w-4" />
              Drafts
            </CardTitle>
            <CardDescription>
              Stored in this browser for now. Secure room sharing will be connected after server storage authorization is hardened.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Record your first storyboard.
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div key={draft.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{draft.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(draft.durationMs)} · {draft.events.length} timeline events
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">Local</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => playDraft(draft)}>
                        <Play className="h-3.5 w-3.5" />
                        Play
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeDraft(draft.id)} aria-label={`Delete ${draft.title}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
