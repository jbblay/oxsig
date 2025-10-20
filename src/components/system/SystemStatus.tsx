"use client";

import React from "react";
import { useEffect, useState } from "react";
import { ShieldCheck, Link as LinkIcon, Database, Cloud, Search, RefreshCw } from "lucide-react";
import { wsManager } from "@/lib/websocket";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { backgroundSync } from "@/lib/db/sync";

type Health = {
  postgres: boolean;
  minio: boolean;
  meilisearch: boolean;
  timestamp: string;
};

export default function SystemStatus() {
  const [wsConnected, setWsConnected] = useState(wsManager.getStatus().connected);
  const [health, setHealth] = useState<Health | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ inProgress: boolean; pending: number; last?: string }>({
    inProgress: false,
    pending: 0,
    last: undefined,
  });

  useEffect(() => {
    const offConnected = wsManager.on("connected", () => setWsConnected(true));
    const offDisconnected = wsManager.on("disconnected", () => setWsConnected(false));
    const offError = wsManager.on("error", () => setWsConnected(false));

    fetchHealth();
    updateSyncStatus();

    const id = setInterval(() => {
      fetchHealth();
      updateSyncStatus();
    }, 10000);

    return () => {
      offConnected();
      offDisconnected();
      offError();
      clearInterval(id);
    };
  }, []);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data: Health = await res.json();
        setHealth(data);
      }
    } catch {
      setHealth(null);
    }
  }

  async function updateSyncStatus() {
    const status = await backgroundSync.getStatus();
    setSyncStatus({
      inProgress: status.inProgress,
      pending: status.pendingChanges,
      last: status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : undefined,
    });
  }

  async function runSync() {
    await backgroundSync.sync();
    await updateSyncStatus();
  }

  const indicator = (ok: boolean) =>
    ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";

  return (
    <Card className="w-full max-w-4xl mx-auto p-3 md:p-4 border border-border/50 bg-card/80 backdrop-blur">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-500" />
          <span className="font-medium">System Status</span>
        </div>

        <div className="grid grid-cols-2 md:flex md:flex-row gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <LinkIcon className={`w-4 h-4 ${indicator(wsConnected)}`} />
            <span>WS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database className={`w-4 h-4 ${indicator(!!health?.postgres)}`} />
            <span>DB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Cloud className={`w-4 h-4 ${indicator(!!health?.minio)}`} />
            <span>Storage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Search className={`w-4 h-4 ${indicator(!!health?.meilisearch)}`} />
            <span>Search</span>
          </div>
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4 text-emerald-500" />
            <span>
              Sync{syncStatus.inProgress ? "…" : ""} ({syncStatus.pending})
              {syncStatus.last ? ` • ${syncStatus.last}` : ""}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={runSync}>
          Run Sync
        </Button>
      </div>
    </Card>
  );
}