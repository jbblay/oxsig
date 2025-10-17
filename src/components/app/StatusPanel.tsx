"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

const statuses = [
  { label: "ICP Anchor", status: "healthy", last: "2 s" },
  { label: "EVM Gateway", status: "syncing", last: "12 s" },
  { label: "IPFS Storage", status: "healthy", last: "5 s" },
  { label: "AI Oracle", status: "degraded", last: "30 s" },
];

export default function StatusPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {statuses.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {s.status === "healthy" && <CheckCircle className="text-green-600" size={16} />}
              {s.status === "syncing" && <Clock className="text-blue-600" size={16} />}
              {s.status === "degraded" && <AlertCircle className="text-amber-600" size={16} />}
              <span className="text-sm">{s.label}</span>
            </div>
            <Badge variant={s.status === "healthy" ? "default" : "secondary"}>{s.last}</Badge>
          </div>
        ))}
        <Separator />
        <div className="text-xs text-muted-foreground">Updated just now</div>
      </CardContent>
    </Card>
  );
}