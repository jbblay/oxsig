"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleStop,
  Eraser,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  deleteStoryboardDraft,
  listStoryboardDrafts,
  saveStoryboardDraft,
} from "@/lib/storyboards/storage";
import {
  createStoryboardInitialFrame,
  getStoryboardEventCountAtTime,
  getStoryboardHistoryState,
  getStoryboardTimelineDuration,
  resolveStoryboardFrame,
} from "@/lib/storyboards/timeline";
import type {
  StoryboardDraft,
  StoryboardDrawEvent,
  StoryboardEvent,
  StoryboardPoint,
  StoryboardTool,
} from "@/lib/storyboards/types";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;

type RecordingState = "idle" | "recording" | "paused" | "saving";

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function eventId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function preferredAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }

  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

export default function StoryboardsPage() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const eventsRef = React.useRef<StoryboardEvent[]>([]);
  const recordingStartedAtRef = React.useRef(0);
  const recordingPausedAtRef = React.useRef(0);
  const recordingPausedTotalRef = React.useRef(0);
  const stoppedDurationRef = React.useRef(0);
  const lastPointRef = React.useRef<StoryboardPoint | null>(null);
  const drawingRef = React.useRef(false);
  const strokeMovedRef = React.useRef(false);
  const strokeIdRef = React.useRef<string | null>(null);
  const playbackFrameRef = React.useRef<number | null>(null);
  const playbackEventCountRef = React.useRef(-1);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = React.useRef<string | null>(null);

  const [title, setTitle] = React.useState("Untitled storyboard");
  const [recordingState, setRecordingState] = React.useState<RecordingState>("idle");
  const [recordingElapsedMs, setRecordingElapsedMs] = React.useState(0);
  const [drafts, setDrafts] = React.useState<StoryboardDraft[]>([]);
  const [activeDraft, setActiveDraft] = React.useState<StoryboardDraft | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [recordingSupported, setRecordingSupported] = React.useState(true);
  const [tool, setTool] = React.useState<StoryboardTool>("pen");
  const [color, setColor] = React.useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = React.useState(4);
  const [timelineDurationMs, setTimelineDurationMs] = React.useState(0);
  const [playbackMs, setPlaybackMs] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [historyRevision, setHistoryRevision] = React.useState(0);

  const isCapturing = recordingState === "recording" || recordingState === "paused";
  const isBusy = recordingState === "saving";
  const isReviewingEarlierFrame =
    !!activeDraft && timelineDurationMs > 0 && playbackMs + 5 < timelineDurationMs;
  const canDraw =
    !isBusy &&
    !isPlaying &&
    recordingState !== "paused" &&
    !isReviewingEarlierFrame;

  const loadDrafts = React.useCallback(async () => {
    try {
      setDrafts(await listStoryboardDrafts());
    } catch (error) {
      console.error("Failed to load storyboard drafts:", error);
      toast.error("This browser could not open local storyboard storage.");
    }
  }, []);

  const getContext = React.useCallback(() => {
    return canvasRef.current?.getContext("2d") || null;
  }, []);

  const clearCanvas = React.useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [getContext]);

  const renderDrawEvent = React.useCallback(
    (event: StoryboardDrawEvent) => {
      const ctx = getContext();
      if (!ctx) return;

      const fromX = event.from.x * CANVAS_WIDTH;
      const fromY = event.from.y * CANVAS_HEIGHT;
      const toX = event.to.x * CANVAS_WIDTH;
      const toY = event.to.y * CANVAS_HEIGHT;

      ctx.save();
      ctx.globalCompositeOperation = event.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = event.color;
      ctx.fillStyle = event.color;
      ctx.lineWidth = event.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (fromX === toX && fromY === toY) {
        ctx.beginPath();
        ctx.arc(fromX, fromY, Math.max(1, event.width / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
      }
      ctx.restore();
    },
    [getContext]
  );

  const renderBoardAtTime = React.useCallback(
    (timeMs: number, events = eventsRef.current) => {
      clearCanvas();
      resolveStoryboardFrame(events, timeMs).forEach(renderDrawEvent);
    },
    [clearCanvas, renderDrawEvent]
  );

  const replaceAudioSource = React.useCallback((audio?: Blob) => {
    const player = audioRef.current;
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }

    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const nextUrl = audio && audio.size > 0 ? URL.createObjectURL(audio) : null;
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);

    if (player && nextUrl) {
      player.src = nextUrl;
      player.load();
    }
  }, []);

  const cancelPlaybackFrame = React.useCallback(() => {
    if (playbackFrameRef.current !== null) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
  }, []);

  const stopPlayback = React.useCallback(() => {
    cancelPlaybackFrame();
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [cancelPlaybackFrame]);

  const syncPlaybackFromAudio = React.useCallback(() => {
    const player = audioRef.current;
    if (!player) return;

    const elapsedMs = Math.min(timelineDurationMs, Math.max(0, player.currentTime * 1000));
    setPlaybackMs(elapsedMs);
    const eventCount = getStoryboardEventCountAtTime(eventsRef.current, elapsedMs);
    if (eventCount !== playbackEventCountRef.current) {
      playbackEventCountRef.current = eventCount;
      renderBoardAtTime(elapsedMs);
    }
  }, [renderBoardAtTime, timelineDurationMs]);

  const startPlaybackFrame = React.useCallback(() => {
    cancelPlaybackFrame();

    const tick = () => {
      const player = audioRef.current;
      if (!player) return;
      syncPlaybackFromAudio();
      if (!player.paused && !player.ended) {
        playbackFrameRef.current = requestAnimationFrame(tick);
      }
    };

    playbackFrameRef.current = requestAnimationFrame(tick);
  }, [cancelPlaybackFrame, syncPlaybackFromAudio]);

  React.useEffect(() => {
    setRecordingSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        !!navigator.mediaDevices?.getUserMedia
    );
    void loadDrafts();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
      }
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [loadDrafts]);

  const getRecordingElapsed = React.useCallback((now = performance.now()) => {
    if (!recordingStartedAtRef.current) return 0;
    const activePause = recordingPausedAtRef.current
      ? now - recordingPausedAtRef.current
      : 0;
    return Math.max(
      0,
      now -
        recordingStartedAtRef.current -
        recordingPausedTotalRef.current -
        activePause
    );
  }, []);

  React.useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = window.setInterval(() => {
      setRecordingElapsedMs(getRecordingElapsed());
    }, 200);
    return () => window.clearInterval(timer);
  }, [getRecordingElapsed, recordingState]);

  const eventTime = React.useCallback(() => {
    if (recordingState === "recording" || recordingState === "paused") {
      return getRecordingElapsed();
    }
    return timelineDurationMs;
  }, [getRecordingElapsed, recordingState, timelineDurationMs]);

  const history = React.useMemo(
    () => getStoryboardHistoryState(eventsRef.current),
    [historyRevision]
  );

  const pointFromPointer = (
    event: React.PointerEvent<HTMLCanvasElement>
  ): StoryboardPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const appendDrawSegment = React.useCallback(
    (from: StoryboardPoint, to: StoryboardPoint) => {
      if (!strokeIdRef.current) return;
      const drawEvent: StoryboardDrawEvent = {
        id: eventId(),
        strokeId: strokeIdRef.current,
        type: "draw",
        t: eventTime(),
        from,
        to,
        width: tool === "eraser" ? Math.max(18, strokeWidth * 3) : strokeWidth,
        color,
        tool,
      };
      eventsRef.current.push(drawEvent);
      renderDrawEvent(drawEvent);
    },
    [color, eventTime, renderDrawEvent, strokeWidth, tool]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    strokeMovedRef.current = false;
    strokeIdRef.current = eventId();
    lastPointRef.current = pointFromPointer(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const next = pointFromPointer(event);
    appendDrawSegment(lastPointRef.current, next);
    strokeMovedRef.current = true;
    lastPointRef.current = next;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    if (!strokeMovedRef.current && lastPointRef.current) {
      appendDrawSegment(lastPointRef.current, lastPointRef.current);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    strokeIdRef.current = null;
    setHistoryRevision((revision) => revision + 1);
  };

  const appendTimelineCommand = React.useCallback(
    (event: StoryboardEvent) => {
      eventsRef.current.push(event);
      setHistoryRevision((revision) => revision + 1);
      playbackEventCountRef.current = -1;
      renderBoardAtTime(Number.POSITIVE_INFINITY);
    },
    [renderBoardAtTime]
  );

  const handleUndo = () => {
    if (!history.undoTarget || !canDraw) return;
    appendTimelineCommand({
      id: eventId(),
      type: "undo",
      targetId: history.undoTarget,
      t: eventTime(),
    });
  };

  const handleRedo = () => {
    if (!history.redoTarget || !canDraw) return;
    appendTimelineCommand({
      id: eventId(),
      type: "redo",
      targetId: history.redoTarget,
      t: eventTime(),
    });
  };

  const handleClear = () => {
    if (!canDraw) return;
    appendTimelineCommand({ id: eventId(), type: "clear", t: eventTime() });
  };

  const startRecording = async () => {
    if (!recordingSupported) {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const initialFrame = createStoryboardInitialFrame(eventsRef.current);

      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      eventsRef.current = initialFrame;
      recordingStartedAtRef.current = performance.now();
      recordingPausedAtRef.current = 0;
      recordingPausedTotalRef.current = 0;
      stoppedDurationRef.current = 0;
      setRecordingElapsedMs(0);
      setTimelineDurationMs(0);
      setPlaybackMs(0);
      setActiveDraft(null);
      setHistoryRevision((revision) => revision + 1);
      replaceAudioSource();
      renderBoardAtTime(Number.POSITIVE_INFINITY, initialFrame);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = (event) => {
        console.error("Storyboard recorder error:", event);
        toast.error("Audio recording stopped because the browser reported an error.");
      };

      recorder.onstop = async () => {
        const durationMs = Math.max(
          stoppedDurationRef.current,
          getStoryboardTimelineDuration(eventsRef.current)
        );
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        const now = Date.now();
        const draft: StoryboardDraft = {
          version: 1,
          id: eventId(),
          title: title.trim() || "Untitled storyboard",
          createdAt: now,
          updatedAt: now,
          durationMs,
          events: [...eventsRef.current],
          audio: audio.size > 0 ? audio : undefined,
          audioMimeType: audio.size > 0 ? audio.type : undefined,
          status: "local-draft",
        };

        recorderRef.current = null;
        setActiveDraft(draft);
        setTimelineDurationMs(durationMs);
        setPlaybackMs(durationMs);
        setRecordingElapsedMs(durationMs);
        replaceAudioSource(draft.audio);
        renderBoardAtTime(Number.POSITIVE_INFINITY, draft.events);

        try {
          await saveStoryboardDraft(draft);
          await loadDrafts();
          toast.success("Storyboard saved on this device.");
        } catch (error) {
          console.error("Failed to save storyboard:", error);
          toast.error("The recording is still open, but it could not be saved locally.");
        } finally {
          setRecordingState("idle");
        }
      };

      recorder.start(250);
      setRecordingState("recording");
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      console.error("Failed to start storyboard recording:", error);
      toast.error("Allow microphone access to record a storyboard explanation.");
    }
  };

  const pauseRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    recordingPausedAtRef.current = performance.now();
    setRecordingElapsedMs(getRecordingElapsed());
    setRecordingState("paused");
  };

  const resumeRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    const now = performance.now();
    recordingPausedTotalRef.current += now - recordingPausedAtRef.current;
    recordingPausedAtRef.current = 0;
    recorder.resume();
    setRecordingState("recording");
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stoppedDurationRef.current = getRecordingElapsed();
    setRecordingElapsedMs(stoppedDurationRef.current);
    setRecordingState("saving");
    recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    drawingRef.current = false;
    lastPointRef.current = null;
    strokeIdRef.current = null;
  };

  const saveCurrentBoard = async () => {
    if (eventsRef.current.length === 0) {
      toast.error("Draw something before saving this board.");
      return;
    }

    const now = Date.now();
    const durationMs = Math.max(
      timelineDurationMs,
      getStoryboardTimelineDuration(eventsRef.current)
    );
    const draft: StoryboardDraft = {
      version: 1,
      id: activeDraft?.id || eventId(),
      title: title.trim() || "Untitled storyboard",
      createdAt: activeDraft?.createdAt || now,
      updatedAt: now,
      durationMs,
      events: [...eventsRef.current],
      audio: activeDraft?.audio,
      audioMimeType: activeDraft?.audioMimeType,
      status: "local-draft",
    };

    try {
      await saveStoryboardDraft(draft);
      setActiveDraft(draft);
      setTimelineDurationMs(durationMs);
      setPlaybackMs(durationMs);
      await loadDrafts();
      toast.success("Board saved on this device.");
    } catch (error) {
      console.error("Failed to save board:", error);
      toast.error("This board could not be saved in the browser.");
    }
  };

  const openDraft = React.useCallback(
    (draft: StoryboardDraft) => {
      stopPlayback();
      eventsRef.current = [...draft.events];
      setHistoryRevision((revision) => revision + 1);
      setActiveDraft(draft);
      setTitle(draft.title);
      setTimelineDurationMs(draft.durationMs);
      setPlaybackMs(draft.durationMs);
      playbackEventCountRef.current = draft.events.length;
      replaceAudioSource(draft.audio);
      renderBoardAtTime(Number.POSITIVE_INFINITY, draft.events);
    },
    [renderBoardAtTime, replaceAudioSource, stopPlayback]
  );

  const playDraft = (draft: StoryboardDraft) => {
    openDraft(draft);
    const player = audioRef.current;
    if (!draft.audio || !player) {
      toast.info("This board has no audio recording yet.");
      return;
    }

    player.currentTime = 0;
    setPlaybackMs(0);
    playbackEventCountRef.current = -1;
    renderBoardAtTime(0, draft.events);
    void player.play().catch((error) => {
      console.error("Failed to play storyboard audio:", error);
      toast.error("The browser could not play this recording.");
    });
  };

  const togglePlayback = () => {
    const player = audioRef.current;
    if (!activeDraft?.audio || !player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    if (player.ended || playbackMs + 10 >= timelineDurationMs) {
      player.currentTime = 0;
      setPlaybackMs(0);
      playbackEventCountRef.current = -1;
      renderBoardAtTime(0);
    }
    void player.play().catch((error) => {
      console.error("Failed to play storyboard audio:", error);
      toast.error("The browser could not play this recording.");
    });
  };

  const seekPlayback = (value: number[]) => {
    const nextTime = Math.min(timelineDurationMs, Math.max(0, value[0] || 0));
    if (audioRef.current && audioUrl) audioRef.current.currentTime = nextTime / 1000;
    setPlaybackMs(nextTime);
    playbackEventCountRef.current = getStoryboardEventCountAtTime(
      eventsRef.current,
      nextTime
    );
    renderBoardAtTime(nextTime);
  };

  const newBoard = () => {
    if (
      eventsRef.current.length > 0 &&
      !window.confirm("Start a new board? Save the current board first if you want to keep it.")
    ) {
      return;
    }
    stopPlayback();
    eventsRef.current = [];
    setHistoryRevision((revision) => revision + 1);
    setActiveDraft(null);
    setTitle("Untitled storyboard");
    setTimelineDurationMs(0);
    setPlaybackMs(0);
    setRecordingElapsedMs(0);
    replaceAudioSource();
    clearCanvas();
  };

  const removeDraft = async (draft: StoryboardDraft) => {
    if (!window.confirm(`Delete “${draft.title}” from this device?`)) return;
    stopPlayback();
    try {
      await deleteStoryboardDraft(draft.id);
      if (activeDraft?.id === draft.id) {
        eventsRef.current = [];
        setHistoryRevision((revision) => revision + 1);
        setActiveDraft(null);
        setTimelineDurationMs(0);
        setPlaybackMs(0);
        replaceAudioSource();
        clearCanvas();
      }
      await loadDrafts();
      toast.success("Storyboard draft deleted.");
    } catch (error) {
      console.error("Failed to delete storyboard:", error);
      toast.error("This storyboard could not be deleted.");
    }
  };

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        className="hidden"
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          startPlaybackFrame();
        }}
        onPause={() => {
          cancelPlaybackFrame();
          syncPlaybackFromAudio();
          setIsPlaying(false);
        }}
        onEnded={() => {
          cancelPlaybackFrame();
          setIsPlaying(false);
          setPlaybackMs(timelineDurationMs);
          playbackEventCountRef.current = eventsRef.current.length;
          renderBoardAtTime(Number.POSITIVE_INFINITY);
        }}
        onSeeked={syncPlaybackFromAudio}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/collab" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Collaboration
            </Link>
            <span>/</span>
            <span>Storyboards</span>
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">Secure Canvas Storyboards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draw freely, then record and replay the explanation on one synchronized timeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Browser-local MVP</Badge>
          {recordingState !== "idle" && (
            <Badge variant={recordingState === "recording" ? "destructive" : "secondary"}>
              {recordingState === "recording"
                ? `Recording ${formatDuration(recordingElapsedMs)}`
                : recordingState === "paused"
                  ? `Paused ${formatDuration(recordingElapsedMs)}`
                  : "Saving…"}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Radio className="h-5 w-5" />
                    Canvas recorder
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Mouse, pen, and touch input use the same normalized canvas coordinates.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={newBoard}
                  disabled={isCapturing || isBusy}
                >
                  <Plus className="h-4 w-4" />
                  New board
                </Button>
              </div>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Storyboard title"
                disabled={isCapturing || isBusy}
                maxLength={120}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
                <Button
                  type="button"
                  size="sm"
                  variant={tool === "pen" ? "secondary" : "ghost"}
                  onClick={() => setTool("pen")}
                  disabled={!canDraw}
                  aria-pressed={tool === "pen"}
                >
                  <Pencil className="h-4 w-4" />
                  Pen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tool === "eraser" ? "secondary" : "ghost"}
                  onClick={() => setTool("eraser")}
                  disabled={!canDraw}
                  aria-pressed={tool === "eraser"}
                >
                  <Eraser className="h-4 w-4" />
                  Eraser
                </Button>

                <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs">
                  Color
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
                    disabled={!canDraw || tool === "eraser"}
                    aria-label="Pen color"
                  />
                </label>

                <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs">
                  Stroke
                  <select
                    value={strokeWidth}
                    onChange={(event) => setStrokeWidth(Number(event.target.value))}
                    className="bg-transparent text-xs outline-none"
                    disabled={!canDraw}
                    aria-label="Stroke thickness"
                  >
                    <option value={2}>Thin</option>
                    <option value={4}>Medium</option>
                    <option value={8}>Thick</option>
                  </select>
                </label>

                <div className="ml-auto flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleUndo}
                    disabled={!canDraw || !history.undoTarget}
                    aria-label="Undo"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleRedo}
                    disabled={!canDraw || !history.redoTarget}
                    aria-label="Redo"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleClear}
                    disabled={!canDraw || eventsRef.current.length === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border bg-white shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className={`block aspect-video w-full touch-none ${canDraw ? "cursor-crosshair" : "cursor-not-allowed"}`}
                  aria-label="Storyboard drawing canvas"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {recordingState === "idle" && (
                  <Button
                    type="button"
                    onClick={startRecording}
                    disabled={!recordingSupported}
                    className="gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    Start recording
                  </Button>
                )}
                {recordingState === "recording" && (
                  <>
                    <Button type="button" onClick={pauseRecording} variant="outline">
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                    <Button type="button" onClick={stopRecording} variant="destructive">
                      <CircleStop className="h-4 w-4" />
                      Stop & save
                    </Button>
                  </>
                )}
                {recordingState === "paused" && (
                  <>
                    <Button type="button" onClick={resumeRecording}>
                      <Mic className="h-4 w-4" />
                      Resume
                    </Button>
                    <Button type="button" onClick={stopRecording} variant="destructive">
                      <CircleStop className="h-4 w-4" />
                      Stop & save
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  onClick={saveCurrentBoard}
                  variant="outline"
                  disabled={isCapturing || isBusy || eventsRef.current.length === 0}
                >
                  <Save className="h-4 w-4" />
                  Save board
                </Button>
              </div>

              {!recordingSupported && (
                <p className="text-sm text-destructive">
                  This browser does not expose the microphone recording APIs required for audio storyboards.
                  Drawing and local board saving still work.
                </p>
              )}

              {activeDraft && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={togglePlayback}
                      disabled={!activeDraft.audio || timelineDurationMs <= 0}
                      aria-label={isPlaying ? "Pause replay" : "Play replay"}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <Slider
                        value={[Math.min(playbackMs, timelineDurationMs)]}
                        min={0}
                        max={Math.max(1, timelineDurationMs)}
                        step={10}
                        onValueChange={seekPlayback}
                        disabled={timelineDurationMs <= 0}
                        aria-label="Storyboard playback position"
                      />
                    </div>
                    <span className="w-[88px] text-right font-mono text-xs text-muted-foreground">
                      {formatDuration(playbackMs)} / {formatDuration(timelineDurationMs)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seeking rebuilds the canvas at that exact point in the audio timeline.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current storage boundary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Boards and audio are real, but this first slice stores them only in this browser using IndexedDB.
              They are not yet uploaded, shared, or represented as encrypted server resources. That boundary is
              explicit until backend ownership and authorization are connected.
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Save className="h-4 w-4" />
              My local boards
            </CardTitle>
            <CardDescription>
              Open a finished board or replay its synchronized recording on this device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Draw or record your first storyboard.
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className={`space-y-2 rounded-lg border p-3 ${
                      activeDraft?.id === draft.id ? "border-primary/60 bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{draft.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {draft.audio ? formatDuration(draft.durationMs) : "Board only"} · {draft.events.length}{" "}
                          events
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        Local
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => openDraft(draft)}
                        disabled={isCapturing || isBusy}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1"
                        onClick={() => playDraft(draft)}
                        disabled={!draft.audio || isCapturing || isBusy}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Play
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDraft(draft)}
                        disabled={isCapturing || isBusy}
                        aria-label={`Delete ${draft.title}`}
                      >
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
