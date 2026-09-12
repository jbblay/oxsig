"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Circle,
  CircleStop,
  Cloud,
  Copy,
  Download,
  Eraser,
  Grid3X3,
  Link2,
  Loader2,
  Magnet,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Redo2,
  Save,
  Search,
  Share2,
  Square,
  Trash2,
  Undo2,
  UserX,
  ZoomIn,
  ZoomOut,
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
import { useAuth } from "@/lib/auth/use-auth";
import {
  deleteServerStoryboard,
  getServerStoryboard,
  listServerStoryboards,
  listStoryboardShares,
  revokeStoryboardShare,
  saveServerStoryboard,
  shareStoryboard,
} from "@/lib/storyboards/api";
import {
  clampStoryboardZoom,
  snapStoryboardPoint,
  STORYBOARD_GRID_COLUMNS,
  STORYBOARD_GRID_ROWS,
} from "@/lib/storyboards/editor";
import {
  createStoryboardShapeSegments,
  type StoryboardShapeTool,
} from "@/lib/storyboards/shapes";
import {
  GUEST_STORYBOARD_DRAFT_NAMESPACE,
  deleteStoryboardDraft,
  listStoryboardDrafts,
  saveStoryboardDraft,
  storyboardDraftNamespaceForAccount,
  type StoryboardDraftNamespace,
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
  StoryboardServerSession,
  StoryboardShare,
  StoryboardTool,
} from "@/lib/storyboards/types";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;

type RecordingState = "idle" | "recording" | "paused" | "saving";
type EditorTool = StoryboardTool | StoryboardShapeTool;
type SessionFilter = "all" | "mine" | "shared" | "draft" | "ready" | "archived";
type AutosaveStatus = "idle" | "saving" | "saved";

const SHAPE_TOOLS = new Set<EditorTool>(["line", "arrow", "rectangle", "ellipse"]);

function isShapeTool(tool: EditorTool): tool is StoryboardShapeTool {
  return SHAPE_TOOLS.has(tool);
}

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
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

function downloadName(title: string) {
  const safe = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${safe || "oxsig-board"}.png`;
}

export default function StoryboardsPage() {
  const { isAuthenticated, isLoading: authLoading, sessionIdentityId } = useAuth();
  const storageNamespace = React.useMemo<StoryboardDraftNamespace | null>(() => {
    if (isAuthenticated) {
      return sessionIdentityId ? storyboardDraftNamespaceForAccount(sessionIdentityId) : null;
    }
    return authLoading ? null : GUEST_STORYBOARD_DRAFT_NAMESPACE;
  }, [authLoading, isAuthenticated, sessionIdentityId]);
  const storageNamespaceRef = React.useRef<StoryboardDraftNamespace | null>(storageNamespace);
  storageNamespaceRef.current = storageNamespace;

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
  const shapeStartRef = React.useRef<StoryboardPoint | null>(null);
  const drawingRef = React.useRef(false);
  const strokeMovedRef = React.useRef(false);
  const strokeIdRef = React.useRef<string | null>(null);
  const playbackFrameRef = React.useRef<number | null>(null);
  const playbackEventCountRef = React.useRef(-1);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = React.useRef<string | null>(null);
  const deepLinkOpenedRef = React.useRef(false);

  const [title, setTitle] = React.useState("Untitled storyboard");
  const [recordingState, setRecordingState] = React.useState<RecordingState>("idle");
  const [recordingElapsedMs, setRecordingElapsedMs] = React.useState(0);
  const [drafts, setDrafts] = React.useState<StoryboardDraft[]>([]);
  const [loadedDraftNamespace, setLoadedDraftNamespace] =
    React.useState<StoryboardDraftNamespace | null>(null);
  const [activeDraft, setActiveDraft] = React.useState<StoryboardDraft | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [recordingSupported, setRecordingSupported] = React.useState(true);
  const [tool, setTool] = React.useState<EditorTool>("pen");
  const [color, setColor] = React.useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = React.useState(4);
  const [timelineDurationMs, setTimelineDurationMs] = React.useState(0);
  const [playbackMs, setPlaybackMs] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [historyRevision, setHistoryRevision] = React.useState(0);
  const [serverSessions, setServerSessions] = React.useState<StoryboardServerSession[]>([]);
  const [activeServerSession, setActiveServerSession] = React.useState<StoryboardServerSession | null>(null);
  const [serverLoading, setServerLoading] = React.useState(true);
  const [serverSaving, setServerSaving] = React.useState(false);
  const [shares, setShares] = React.useState<StoryboardShare[]>([]);
  const [shareEmail, setShareEmail] = React.useState("");
  const [sharePermission, setSharePermission] = React.useState<"viewer" | "editor">("viewer");
  const [shareBusy, setShareBusy] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState(false);
  const [sessionQuery, setSessionQuery] = React.useState("");
  const [sessionFilter, setSessionFilter] = React.useState<SessionFilter>("all");
  const [showGrid, setShowGrid] = React.useState(false);
  const [snapToGrid, setSnapToGrid] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [autosaveStatus, setAutosaveStatus] = React.useState<AutosaveStatus>("idle");

  const draftContextReady =
    storageNamespace !== null && loadedDraftNamespace === storageNamespace;
  const isCapturing = recordingState === "recording" || recordingState === "paused";
  const isBusy = recordingState === "saving";
  const isReviewingEarlierFrame =
    !!activeDraft && timelineDurationMs > 0 && playbackMs + 5 < timelineDurationMs;
  const canDraw =
    !isBusy &&
    !isPlaying &&
    recordingState !== "paused" &&
    activeDraft?.serverPermission !== "viewer" &&
    !isReviewingEarlierFrame;

  const loadDrafts = React.useCallback(async (namespace: StoryboardDraftNamespace) => {
    try {
      const nextDrafts = await listStoryboardDrafts(namespace);
      if (storageNamespaceRef.current === namespace) {
        setDrafts(nextDrafts);
        setLoadedDraftNamespace(namespace);
      }
      return nextDrafts;
    } catch (error) {
      if (storageNamespaceRef.current === namespace) {
        setDrafts([]);
        setLoadedDraftNamespace(namespace);
        console.error("Failed to load storyboard drafts:", error);
        toast.error("This browser could not open local storyboard storage.");
      }
      return [];
    }
  }, []);

  const loadServerSessions = React.useCallback(async () => {
    try {
      setServerSessions(await listServerStoryboards());
    } catch (error) {
      console.error("Failed to load secure storyboards:", error);
      toast.error("Secure Boards could not be loaded. Local recovery drafts are still available.");
    } finally {
      setServerLoading(false);
    }
  }, []);

  const refreshShares = React.useCallback(async (session: StoryboardServerSession | null) => {
    if (!session || session.permission !== "owner") {
      setShares([]);
      return;
    }
    try {
      setShares(await listStoryboardShares(session.id));
    } catch (error) {
      console.error("Failed to load storyboard shares:", error);
      toast.error("The access list could not be loaded.");
    }
  }, []);

  const getContext = React.useCallback(() => canvasRef.current?.getContext("2d") || null, []);

  const clearCanvas = React.useCallback(() => {
    const ctx = getContext();
    if (ctx) ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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

  const renderShapePreview = React.useCallback(
    (shapeTool: StoryboardShapeTool, start: StoryboardPoint, end: StoryboardPoint) => {
      renderBoardAtTime(Number.POSITIVE_INFINITY);
      const previewId = "preview";
      createStoryboardShapeSegments(shapeTool, start, end, CANVAS_WIDTH, CANVAS_HEIGHT).forEach(
        (segment, index) =>
          renderDrawEvent({
            id: `${previewId}-${index}`,
            strokeId: previewId,
            type: "draw",
            t: 0,
            from: segment.from,
            to: segment.to,
            width: strokeWidth,
            color,
            tool: "pen",
          })
      );
    },
    [color, renderBoardAtTime, renderDrawEvent, strokeWidth]
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
      if (!player.paused && !player.ended) playbackFrameRef.current = requestAnimationFrame(tick);
    };
    playbackFrameRef.current = requestAnimationFrame(tick);
  }, [cancelPlaybackFrame, syncPlaybackFromAudio]);

  React.useEffect(() => {
    setDrafts([]);
    setLoadedDraftNamespace(null);
    setAutosaveStatus("idle");
    stopPlayback();
    eventsRef.current = [];
    playbackEventCountRef.current = -1;
    setHistoryRevision((revision) => revision + 1);
    setActiveDraft(null);
    setActiveServerSession(null);
    setShares([]);
    setTitle("Untitled storyboard");
    setTimelineDurationMs(0);
    setPlaybackMs(0);
    setRecordingElapsedMs(0);
    replaceAudioSource();
    clearCanvas();

    if (storageNamespace) void loadDrafts(storageNamespace);
  }, [clearCanvas, loadDrafts, replaceAudioSource, storageNamespace, stopPlayback]);

  React.useEffect(() => {
    setRecordingSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        !!navigator.mediaDevices?.getUserMedia
    );
    void loadServerSessions();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (playbackFrameRef.current !== null) cancelAnimationFrame(playbackFrameRef.current);
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [loadServerSessions]);

  const getRecordingElapsed = React.useCallback((now = performance.now()) => {
    if (!recordingStartedAtRef.current) return 0;
    const activePause = recordingPausedAtRef.current ? now - recordingPausedAtRef.current : 0;
    return Math.max(
      0,
      now - recordingStartedAtRef.current - recordingPausedTotalRef.current - activePause
    );
  }, []);

  React.useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = window.setInterval(() => setRecordingElapsedMs(getRecordingElapsed()), 200);
    return () => window.clearInterval(timer);
  }, [getRecordingElapsed, recordingState]);

  const eventTime = React.useCallback(() => {
    if (recordingState === "recording" || recordingState === "paused") return getRecordingElapsed();
    return timelineDurationMs;
  }, [getRecordingElapsed, recordingState, timelineDurationMs]);

  const history = React.useMemo(
    () => getStoryboardHistoryState(eventsRef.current),
    [historyRevision]
  );

  const filteredServerSessions = React.useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    return serverSessions.filter((session) => {
      const matchesQuery =
        !query ||
        session.title.toLowerCase().includes(query) ||
        session.ownerName.toLowerCase().includes(query) ||
        (session.ownerEmail || "").toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (sessionFilter === "mine") return session.permission === "owner";
      if (sessionFilter === "shared") return session.permission !== "owner";
      if (["draft", "ready", "archived"].includes(sessionFilter)) return session.status === sessionFilter;
      return true;
    });
  }, [serverSessions, sessionFilter, sessionQuery]);

  const filteredDrafts = React.useMemo(() => {
    if (!draftContextReady) return [];
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return drafts;
    return drafts.filter((draft) => draft.title.toLowerCase().includes(query));
  }, [draftContextReady, drafts, sessionQuery]);

  const pointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): StoryboardPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    return snapStoryboardPoint(point, snapToGrid && isShapeTool(tool));
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
        tool: tool === "eraser" ? "eraser" : "pen",
      };
      eventsRef.current.push(drawEvent);
      renderDrawEvent(drawEvent);
    },
    [color, eventTime, renderDrawEvent, strokeWidth, tool]
  );

  const commitShape = React.useCallback(
    (shapeTool: StoryboardShapeTool, start: StoryboardPoint, end: StoryboardPoint) => {
      const strokeId = strokeIdRef.current || eventId();
      const t = eventTime();
      createStoryboardShapeSegments(shapeTool, start, end, CANVAS_WIDTH, CANVAS_HEIGHT).forEach(
        (segment) => {
          eventsRef.current.push({
            id: eventId(),
            strokeId,
            type: "draw",
            t,
            from: segment.from,
            to: segment.to,
            width: strokeWidth,
            color,
            tool: "pen",
          });
        }
      );
      playbackEventCountRef.current = -1;
      renderBoardAtTime(Number.POSITIVE_INFINITY);
    },
    [color, eventTime, renderBoardAtTime, strokeWidth]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromPointer(event);
    drawingRef.current = true;
    strokeMovedRef.current = false;
    strokeIdRef.current = eventId();
    lastPointRef.current = point;
    shapeStartRef.current = isShapeTool(tool) ? point : null;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const next = pointFromPointer(event);
    if (isShapeTool(tool) && shapeStartRef.current) {
      renderShapePreview(tool, shapeStartRef.current, next);
      strokeMovedRef.current = true;
      lastPointRef.current = next;
      return;
    }
    appendDrawSegment(lastPointRef.current, next);
    strokeMovedRef.current = true;
    lastPointRef.current = next;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const end = pointFromPointer(event);
    if (isShapeTool(tool) && shapeStartRef.current) {
      if (strokeMovedRef.current) commitShape(tool, shapeStartRef.current, end);
      else renderBoardAtTime(Number.POSITIVE_INFINITY);
    } else if (!strokeMovedRef.current && lastPointRef.current) {
      appendDrawSegment(lastPointRef.current, lastPointRef.current);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    shapeStartRef.current = null;
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

  const handleUndo = React.useCallback(() => {
    const state = getStoryboardHistoryState(eventsRef.current);
    if (!state.undoTarget || !canDraw) return;
    appendTimelineCommand({ id: eventId(), type: "undo", targetId: state.undoTarget, t: eventTime() });
  }, [appendTimelineCommand, canDraw, eventTime]);

  const handleRedo = React.useCallback(() => {
    const state = getStoryboardHistoryState(eventsRef.current);
    if (!state.redoTarget || !canDraw) return;
    appendTimelineCommand({ id: eventId(), type: "redo", targetId: state.redoTarget, t: eventTime() });
  }, [appendTimelineCommand, canDraw, eventTime]);

  const handleClear = () => {
    if (canDraw) appendTimelineCommand({ id: eventId(), type: "clear", t: eventTime() });
  };

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
        return;
      }
      if (event.key === "0") {
        setZoom(1);
        return;
      }
      if (!canDraw || mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "g") {
        setShowGrid((value) => !value);
        return;
      }
      if (key === "s") {
        setSnapToGrid((value) => !value);
        return;
      }
      const shortcuts: Record<string, EditorTool> = {
        p: "pen",
        e: "eraser",
        l: "line",
        a: "arrow",
        r: "rectangle",
        o: "ellipse",
      };
      const next = shortcuts[key];
      if (next) setTool(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canDraw, focusMode, handleRedo, handleUndo]);

  React.useEffect(() => {
    if (
      !draftContextReady ||
      !storageNamespace ||
      isCapturing ||
      isBusy ||
      serverSaving ||
      activeDraft?.serverPermission === "viewer" ||
      eventsRef.current.length === 0
    ) return;

    const namespace = storageNamespace;
    const timer = window.setTimeout(() => {
      const saveRecovery = async () => {
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
          serverId: activeDraft?.serverId,
          serverPermission: activeDraft?.serverPermission,
        };

        setAutosaveStatus("saving");
        try {
          await saveStoryboardDraft(namespace, draft);
          if (storageNamespaceRef.current !== namespace) return;
          if (!activeDraft) setActiveDraft(draft);
          await loadDrafts(namespace);
          if (storageNamespaceRef.current === namespace) setAutosaveStatus("saved");
        } catch (error) {
          if (storageNamespaceRef.current !== namespace) return;
          console.error("Board recovery autosave failed:", error);
          setAutosaveStatus("idle");
        }
      };
      void saveRecovery();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    activeDraft,
    draftContextReady,
    historyRevision,
    isBusy,
    isCapturing,
    loadDrafts,
    serverSaving,
    storageNamespace,
    timelineDurationMs,
    title,
  ]);

  const syncDraftToServer = React.useCallback(
    async (draft: StoryboardDraft, namespace: StoryboardDraftNamespace) => {
      setServerSaving(true);
      try {
        const session = await saveServerStoryboard(draft, draft.serverId);
        const securedDraft: StoryboardDraft = {
          ...draft,
          serverId: session.id,
          serverPermission: session.permission,
          updatedAt: Date.now(),
        };
        await saveStoryboardDraft(namespace, securedDraft);
        if (storageNamespaceRef.current !== namespace) return securedDraft;
        setActiveDraft(securedDraft);
        setActiveServerSession(session);
        await Promise.all([loadDrafts(namespace), loadServerSessions()]);
        if (storageNamespaceRef.current !== namespace) return securedDraft;
        await refreshShares(session);
        toast.success(draft.serverId ? "Secure board updated." : "Board secured on the server.");
        return securedDraft;
      } finally {
        setServerSaving(false);
      }
    },
    [loadDrafts, loadServerSessions, refreshShares]
  );

  const startRecording = async () => {
    if (!draftContextReady || !storageNamespace) {
      toast.error("Local recovery storage is still preparing. Try again in a moment.");
      return;
    }
    const namespace = storageNamespace;
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
        if (storageNamespaceRef.current === namespace) {
          setActiveDraft(draft);
          setTimelineDurationMs(durationMs);
          setPlaybackMs(durationMs);
          setRecordingElapsedMs(durationMs);
          replaceAudioSource(draft.audio);
          renderBoardAtTime(Number.POSITIVE_INFINITY, draft.events);
        }

        try {
          await saveStoryboardDraft(namespace, draft);
          await loadDrafts(namespace);
          if (storageNamespaceRef.current === namespace) {
            try {
              await syncDraftToServer(draft, namespace);
            } catch (serverError) {
              console.error("Failed to secure storyboard:", serverError);
              toast.error(
                serverError instanceof Error
                  ? `${serverError.message}. A local recovery copy was kept.`
                  : "Server save failed. A local recovery copy was kept."
              );
            }
          }
        } catch (error) {
          if (storageNamespaceRef.current === namespace) {
            console.error("Failed to save board:", error);
            toast.error("The recording is still open, but it could not be saved locally.");
          }
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
      toast.error("Allow microphone access to record a board explanation.");
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
    shapeStartRef.current = null;
    strokeIdRef.current = null;
  };

  const saveCurrentBoard = async () => {
    if (!draftContextReady || !storageNamespace) {
      toast.error("Local recovery storage is still preparing. Try again in a moment.");
      return;
    }
    const namespace = storageNamespace;
    if (eventsRef.current.length === 0) {
      toast.error("Draw something before saving this board.");
      return;
    }
    const now = Date.now();
    const durationMs = Math.max(timelineDurationMs, getStoryboardTimelineDuration(eventsRef.current));
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
      serverId: activeDraft?.serverId,
      serverPermission: activeDraft?.serverPermission,
    };

    try {
      await saveStoryboardDraft(namespace, draft);
      if (storageNamespaceRef.current !== namespace) return;
      setActiveDraft(draft);
      setTimelineDurationMs(durationMs);
      setPlaybackMs(durationMs);
      await loadDrafts(namespace);
      if (storageNamespaceRef.current !== namespace) return;
      try {
        await syncDraftToServer(draft, namespace);
      } catch (serverError) {
        console.error("Failed to secure board:", serverError);
        toast.error(
          serverError instanceof Error
            ? `${serverError.message}. A local recovery copy was kept.`
            : "Server save failed. A local recovery copy was kept."
        );
      }
    } catch (error) {
      if (storageNamespaceRef.current !== namespace) return;
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
      const linkedSession = draft.serverId
        ? serverSessions.find((session) => session.id === draft.serverId) || null
        : null;
      setActiveServerSession(linkedSession);
      void refreshShares(linkedSession);
    },
    [refreshShares, renderBoardAtTime, replaceAudioSource, serverSessions, stopPlayback]
  );

  const openServerSession = React.useCallback(
    async (session: StoryboardServerSession, autoplay = false) => {
      if (!draftContextReady || !storageNamespace) return;
      const namespace = storageNamespace;
      setServerLoading(true);
      try {
        const loaded = await getServerStoryboard(session.id);
        if (storageNamespaceRef.current !== namespace) return;
        const now = Date.now();
        const draft: StoryboardDraft = {
          version: 1,
          id: `server-${loaded.session.id}`,
          title: loaded.session.title,
          createdAt: new Date(loaded.session.createdAt).getTime() || now,
          updatedAt: new Date(loaded.session.updatedAt).getTime() || now,
          durationMs: loaded.session.durationMs,
          events: loaded.session.events || [],
          audio: loaded.audio,
          audioMimeType: loaded.session.audioMimeType || loaded.audio?.type,
          status: "local-draft",
          serverId: loaded.session.id,
          serverPermission: loaded.session.permission,
        };
        openDraft(draft);
        setActiveServerSession(loaded.session);
        await refreshShares(loaded.session);
        if (storageNamespaceRef.current !== namespace) return;

        if (autoplay && loaded.audio && audioRef.current) {
          audioRef.current.currentTime = 0;
          setPlaybackMs(0);
          playbackEventCountRef.current = -1;
          renderBoardAtTime(0, draft.events);
          await audioRef.current.play();
        }
      } catch (error) {
        if (storageNamespaceRef.current !== namespace) return;
        console.error("Failed to open secure board:", error);
        toast.error(error instanceof Error ? error.message : "Secure board could not be opened.");
      } finally {
        setServerLoading(false);
      }
    },
    [draftContextReady, openDraft, refreshShares, renderBoardAtTime, storageNamespace]
  );

  React.useEffect(() => {
    if (serverLoading || deepLinkOpenedRef.current) return;
    deepLinkOpenedRef.current = true;
    const id = new URLSearchParams(window.location.search).get("session");
    if (!id) return;
    const session = serverSessions.find((candidate) => candidate.id === id);
    if (!session) {
      toast.error("That board link is unavailable or your account does not have access.");
      return;
    }
    void openServerSession(session);
  }, [openServerSession, serverLoading, serverSessions]);

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
      console.error("Failed to play board audio:", error);
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
      console.error("Failed to play board audio:", error);
      toast.error("The browser could not play this recording.");
    });
  };

  const seekPlayback = (value: number[]) => {
    const nextTime = Math.min(timelineDurationMs, Math.max(0, value[0] || 0));
    if (audioRef.current && audioUrl) audioRef.current.currentTime = nextTime / 1000;
    setPlaybackMs(nextTime);
    playbackEventCountRef.current = getStoryboardEventCountAtTime(eventsRef.current, nextTime);
    renderBoardAtTime(nextTime);
  };

  const newBoard = () => {
    if (
      eventsRef.current.length > 0 &&
      !window.confirm("Start a new board? Your recovery draft is saved automatically, but secure the current board if you want it in the cloud.")
    ) return;

    stopPlayback();
    eventsRef.current = [];
    setHistoryRevision((revision) => revision + 1);
    setActiveDraft(null);
    setActiveServerSession(null);
    setShares([]);
    setTitle("Untitled storyboard");
    setTimelineDurationMs(0);
    setPlaybackMs(0);
    setRecordingElapsedMs(0);
    setAutosaveStatus("idle");
    replaceAudioSource();
    clearCanvas();
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || eventsRef.current.length === 0) {
      toast.error("There is nothing on this board to export yet.");
      return;
    }
    const output = document.createElement("canvas");
    output.width = CANVAS_WIDTH;
    output.height = CANVAS_HEIGHT;
    const ctx = output.getContext("2d");
    if (!ctx) {
      toast.error("The browser could not export this board.");
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(canvas, 0, 0);
    output.toBlob((blob) => {
      if (!blob) {
        toast.error("The browser could not export this board.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName(title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Board exported as PNG.");
    }, "image/png");
  };

  const duplicateCurrentBoard = async () => {
    if (!draftContextReady || !storageNamespace) {
      toast.error("Local recovery storage is still preparing. Try again in a moment.");
      return;
    }
    const namespace = storageNamespace;
    if (eventsRef.current.length === 0) {
      toast.error("Add something to the board before duplicating it.");
      return;
    }
    const now = Date.now();
    const duplicate: StoryboardDraft = {
      version: 1,
      id: eventId(),
      title: `${title.trim() || "Untitled storyboard"} copy`,
      createdAt: now,
      updatedAt: now,
      durationMs: timelineDurationMs,
      events: eventsRef.current.map((event) => ({ ...event })),
      audio: activeDraft?.audio,
      audioMimeType: activeDraft?.audioMimeType,
      status: "local-draft",
    };
    try {
      await saveStoryboardDraft(namespace, duplicate);
      await loadDrafts(namespace);
      if (storageNamespaceRef.current !== namespace) return;
      openDraft(duplicate);
      toast.success("A local copy was created. Secure it when you are ready.");
    } catch (error) {
      if (storageNamespaceRef.current !== namespace) return;
      console.error("Failed to duplicate board:", error);
      toast.error("This board could not be duplicated.");
    }
  };

  const copyBoardLink = async (sessionId: string) => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("session", sessionId);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        toast.success("Secure board link copied.");
      } else {
        window.prompt("Copy this secure board link", url.toString());
      }
    } catch (error) {
      console.error("Board link copy failed:", error);
      window.prompt("Copy this secure board link", url.toString());
    }
  };

  const removeServerSession = async (session: StoryboardServerSession) => {
    if (!window.confirm(`Delete secure board “${session.title}”?`)) return;
    setServerSaving(true);
    try {
      await deleteServerStoryboard(session.id);
      if (activeServerSession?.id === session.id) {
        stopPlayback();
        eventsRef.current = [];
        setHistoryRevision((revision) => revision + 1);
        setActiveDraft(null);
        setActiveServerSession(null);
        setShares([]);
        setTitle("Untitled storyboard");
        setTimelineDurationMs(0);
        setPlaybackMs(0);
        replaceAudioSource();
        clearCanvas();
      }
      await loadServerSessions();
      toast.success("Secure board deleted.");
    } catch (error) {
      console.error("Failed to delete secure board:", error);
      toast.error(error instanceof Error ? error.message : "Secure board could not be deleted.");
    } finally {
      setServerSaving(false);
    }
  };

  const addShare = async () => {
    if (!activeServerSession || !shareEmail.trim()) return;
    setShareBusy(true);
    try {
      await shareStoryboard(activeServerSession.id, shareEmail.trim(), sharePermission);
      setShareEmail("");
      await refreshShares(activeServerSession);
      toast.success("Board access granted.");
    } catch (error) {
      console.error("Failed to share board:", error);
      toast.error(error instanceof Error ? error.message : "Board could not be shared.");
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async (share: StoryboardShare) => {
    if (!activeServerSession) return;
    setShareBusy(true);
    try {
      await revokeStoryboardShare(activeServerSession.id, share.userId);
      await refreshShares(activeServerSession);
      toast.success("Board access revoked.");
    } catch (error) {
      console.error("Failed to revoke board access:", error);
      toast.error(error instanceof Error ? error.message : "Access could not be revoked.");
    } finally {
      setShareBusy(false);
    }
  };

  const removeDraft = async (draft: StoryboardDraft) => {
    if (!draftContextReady || !storageNamespace) return;
    const namespace = storageNamespace;
    if (!window.confirm(`Delete “${draft.title}” from this device?`)) return;
    stopPlayback();
    try {
      await deleteStoryboardDraft(namespace, draft.id);
      if (storageNamespaceRef.current !== namespace) return;
      if (activeDraft?.id === draft.id) {
        eventsRef.current = [];
        setHistoryRevision((revision) => revision + 1);
        setActiveDraft(null);
        setTimelineDurationMs(0);
        setPlaybackMs(0);
        replaceAudioSource();
        clearCanvas();
      }
      await loadDrafts(namespace);
      if (storageNamespaceRef.current === namespace) toast.success("Recovery draft deleted.");
    } catch (error) {
      if (storageNamespaceRef.current !== namespace) return;
      console.error("Failed to delete board draft:", error);
      toast.error("This recovery draft could not be deleted.");
    }
  };

  const changeZoom = (delta: number) => setZoom((value) => clampStoryboardZoom(value + delta));
  const gridStyle: React.CSSProperties = showGrid
    ? {
        backgroundColor: "#ffffff",
        backgroundImage:
          "linear-gradient(to right, rgba(100,116,139,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,.18) 1px, transparent 1px)",
        backgroundSize: `${100 / STORYBOARD_GRID_COLUMNS}% ${100 / STORYBOARD_GRID_ROWS}%`,
      }
    : { backgroundColor: "#ffffff" };

  const editorCard = (
    <Card className={focusMode ? "fixed inset-3 z-[80] overflow-y-auto bg-background shadow-2xl md:inset-5" : ""}>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Radio className="h-5 w-5" />
              Board workspace
              {autosaveStatus !== "idle" && (
                <Badge variant="outline" className="font-normal">
                  {autosaveStatus === "saving" ? "Saving recovery…" : "Recovery saved"}
                </Badge>
              )}
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={exportPng} disabled={eventsRef.current.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void duplicateCurrentBoard()} disabled={isCapturing || isBusy || eventsRef.current.length === 0}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            {activeServerSession && (
              <Button type="button" size="sm" variant="outline" onClick={() => void copyBoardLink(activeServerSession.id)}>
                <Link2 className="h-4 w-4" /> Copy link
              </Button>
            )}
            <Button type="button" size="sm" variant={focusMode ? "secondary" : "outline"} onClick={() => setFocusMode((value) => !value)}>
              {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {focusMode ? "Exit focus" : "Focus"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={newBoard} disabled={isCapturing || isBusy}>
              <Plus className="h-4 w-4" /> New board
            </Button>
          </div>
        </div>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Board title" disabled={isCapturing || isBusy} maxLength={120} />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
          <Button type="button" size="sm" variant={tool === "pen" ? "secondary" : "ghost"} onClick={() => setTool("pen")} disabled={!canDraw} title="Pen (P)"><Pencil className="h-4 w-4" /> Pen</Button>
          <Button type="button" size="sm" variant={tool === "eraser" ? "secondary" : "ghost"} onClick={() => setTool("eraser")} disabled={!canDraw} title="Eraser (E)"><Eraser className="h-4 w-4" /> Eraser</Button>
          <Button type="button" size="sm" variant={tool === "line" ? "secondary" : "ghost"} onClick={() => setTool("line")} disabled={!canDraw} title="Line (L)"><Minus className="h-4 w-4" /> Line</Button>
          <Button type="button" size="sm" variant={tool === "arrow" ? "secondary" : "ghost"} onClick={() => setTool("arrow")} disabled={!canDraw} title="Arrow (A)"><ArrowUpRight className="h-4 w-4" /> Arrow</Button>
          <Button type="button" size="sm" variant={tool === "rectangle" ? "secondary" : "ghost"} onClick={() => setTool("rectangle")} disabled={!canDraw} title="Rectangle (R)"><Square className="h-4 w-4" /> Rectangle</Button>
          <Button type="button" size="sm" variant={tool === "ellipse" ? "secondary" : "ghost"} onClick={() => setTool("ellipse")} disabled={!canDraw} title="Ellipse (O)"><Circle className="h-4 w-4" /> Ellipse</Button>

          <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs">
            Color
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0" disabled={!canDraw || tool === "eraser"} aria-label="Pen color" />
          </label>
          <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs">
            Stroke
            <select value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} className="bg-transparent text-xs outline-none" disabled={!canDraw} aria-label="Stroke thickness">
              <option value={2}>Thin</option>
              <option value={4}>Medium</option>
              <option value={8}>Thick</option>
            </select>
          </label>

          <Button type="button" size="sm" variant={showGrid ? "secondary" : "ghost"} onClick={() => setShowGrid((value) => !value)} title="Toggle grid (G)"><Grid3X3 className="h-4 w-4" /> Grid</Button>
          <Button type="button" size="sm" variant={snapToGrid ? "secondary" : "ghost"} onClick={() => setSnapToGrid((value) => !value)} title="Snap shapes to grid (S)"><Magnet className="h-4 w-4" /> Snap</Button>

          <div className="flex items-center rounded-md border bg-background">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => changeZoom(-0.25)} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
            <button type="button" className="min-w-[54px] px-1 text-xs font-medium" onClick={() => setZoom(1)} title="Reset zoom (0)">{Math.round(zoom * 100)}%</button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => changeZoom(0.25)} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
          </div>

          <div className="ml-auto flex gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={handleUndo} disabled={!canDraw || !history.undoTarget} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)"><Undo2 className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={handleRedo} disabled={!canDraw || !history.redoTarget} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)"><Redo2 className="h-4 w-4" /></Button>
            <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={!canDraw || eventsRef.current.length === 0}>Clear</Button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border bg-muted/20 p-2 shadow-inner">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{ ...gridStyle, width: `${zoom * 100}%` }}
            className={`mx-auto block aspect-video touch-none ${canDraw ? "cursor-crosshair" : "cursor-not-allowed"}`}
            aria-label="Storyboard drawing canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>


        <div className="flex flex-wrap gap-2">
          {recordingState === "idle" && (
            <Button type="button" onClick={startRecording} disabled={!recordingSupported || activeDraft?.serverPermission === "viewer" || serverSaving} className="gap-2"><Mic className="h-4 w-4" /> Start recording</Button>
          )}
          {recordingState === "recording" && (
            <>
              <Button type="button" onClick={pauseRecording} variant="outline"><Pause className="h-4 w-4" /> Pause</Button>
              <Button type="button" onClick={stopRecording} variant="destructive"><CircleStop className="h-4 w-4" /> Stop & save</Button>
            </>
          )}
          {recordingState === "paused" && (
            <>
              <Button type="button" onClick={resumeRecording}><Mic className="h-4 w-4" /> Resume</Button>
              <Button type="button" onClick={stopRecording} variant="destructive"><CircleStop className="h-4 w-4" /> Stop & save</Button>
            </>
          )}
          <Button type="button" onClick={saveCurrentBoard} variant="outline" disabled={isCapturing || isBusy || serverSaving || activeDraft?.serverPermission === "viewer" || eventsRef.current.length === 0}>
            {serverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
            {serverSaving ? "Securing…" : activeDraft?.serverId ? "Update securely" : "Save securely"}
          </Button>
        </div>

        {!recordingSupported && (
          <p className="text-sm text-destructive">This browser does not expose the microphone recording APIs required for audio boards. Drawing and local recovery still work.</p>
        )}

        {activeDraft && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-3">
              <Button type="button" size="icon" variant="outline" onClick={togglePlayback} disabled={!activeDraft.audio || timelineDurationMs <= 0} aria-label={isPlaying ? "Pause replay" : "Play replay"}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="min-w-0 flex-1">
                <Slider value={[Math.min(playbackMs, timelineDurationMs)]} min={0} max={Math.max(1, timelineDurationMs)} step={10} onValueChange={seekPlayback} disabled={timelineDurationMs <= 0} aria-label="Board playback position" />
              </div>
              <span className="w-[88px] text-right font-mono text-xs text-muted-foreground">{formatDuration(playbackMs)} / {formatDuration(timelineDurationMs)}</span>
            </div>

            {activeServerSession && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1"><Cloud className="h-3 w-3" /> Server protected</Badge>
                  <Badge variant="secondary">{activeServerSession.permission}</Badge>
                  <Badge variant="outline" className="capitalize">{activeServerSession.status}</Badge>
                  <span className="text-muted-foreground">Owner: {activeServerSession.ownerName}</span>
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => void copyBoardLink(activeServerSession.id)}><Link2 className="h-3.5 w-3.5" /> Copy link</Button>
                </div>

                {activeServerSession.permission === "owner" && (
                  <div className="space-y-3 rounded-md border bg-background p-3">
                    <div className="flex items-center gap-2 text-sm font-medium"><Share2 className="h-4 w-4" /> Share with an OXSIG user</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input type="email" value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} placeholder="user@example.com" disabled={shareBusy} />
                      <select value={sharePermission} onChange={(event) => setSharePermission(event.target.value as "viewer" | "editor")} className="h-9 rounded-md border bg-background px-3 text-sm" disabled={shareBusy} aria-label="Board share permission">
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <Button type="button" onClick={addShare} disabled={shareBusy || !shareEmail.trim()}>
                        {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share
                      </Button>
                    </div>
                    {shares.length > 0 && (
                      <div className="space-y-2">
                        {shares.map((share) => (
                          <div key={share.userId} className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{share.displayName}</p>
                              <p className="truncate text-muted-foreground">{share.email} · {share.permission}</p>
                            </div>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => revokeShare(share)} disabled={shareBusy} aria-label={`Revoke ${share.displayName}`}><UserX className="h-4 w-4" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-2">
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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {draftContextReady ? (
            editorCard
          ) : (
            <Card>
              <CardContent className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing local recovery storage…
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Cloud className="h-4 w-4" /> Secure sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="Search boards or owners" className="pl-9" />
              </div>
              <select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value as SessionFilter)} className="h-9 w-full rounded-md border bg-background px-3 text-sm" aria-label="Filter secure boards">
                <option value="all">All secure boards</option>
                <option value="mine">Owned by me</option>
                <option value="shared">Shared with me</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="archived">Archived</option>
              </select>

              {serverLoading && serverSessions.length === 0 ? (
                <div className="flex items-center justify-center p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading secure sessions…</div>
              ) : filteredServerSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No secure boards match this view.</div>
              ) : (
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1 oxisg-scrollbar">
                  {filteredServerSessions.map((session) => (
                    <div key={session.id} className={`space-y-2 rounded-lg border p-3 ${activeServerSession?.id === session.id ? "border-primary/60 bg-primary/5" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{session.title}</p>
                          <p className="text-xs text-muted-foreground">{session.hasAudio ? formatDuration(session.durationMs) : "Board only"} · {session.ownerName}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={session.permission === "owner" ? "default" : "secondary"}>{session.permission}</Badge>
                          <Badge variant="outline" className="text-[9px] capitalize">{session.status}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => void openServerSession(session)} disabled={isCapturing || isBusy || serverLoading}>Open</Button>
                        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => void openServerSession(session, true)} disabled={!session.hasAudio || isCapturing || isBusy || serverLoading}><Play className="h-3.5 w-3.5" /> Play</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void copyBoardLink(session.id)} aria-label={`Copy link for ${session.title}`}><Link2 className="h-3.5 w-3.5" /></Button>
                        {session.permission === "owner" && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeServerSession(session)} disabled={isCapturing || isBusy || serverSaving} aria-label={`Delete secure board ${session.title}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Save className="h-4 w-4" /> Recovery drafts</CardTitle>
            </CardHeader>
            <CardContent>
              {!draftContextReady ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Switching recovery context…</div>
              ) : filteredDrafts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No local drafts match this view.</div>
              ) : (
                <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1 oxisg-scrollbar">
                  {filteredDrafts.map((draft) => (
                    <div key={draft.id} className={`space-y-2 rounded-lg border p-3 ${activeDraft?.id === draft.id ? "border-primary/60 bg-primary/5" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{draft.title}</p>
                          <p className="text-xs text-muted-foreground">{draft.audio ? formatDuration(draft.durationMs) : "Board only"} · {draft.events.length} events</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">{draft.serverId ? "Cloud + local" : "Local"}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => openDraft(draft)} disabled={isCapturing || isBusy}>Open</Button>
                        <Button type="button" size="sm" variant="outline" className="flex-1 gap-1" onClick={() => playDraft(draft)} disabled={!draft.audio || isCapturing || isBusy}><Play className="h-3.5 w-3.5" /> Play</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeDraft(draft)} disabled={isCapturing || isBusy} aria-label={`Delete ${draft.title}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
