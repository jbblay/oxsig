"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { z } from "zod";
import { SCHEMAS } from "@/lib/schemas";

const AuditTrailSchema = z.object({
  eventId: z.string(),
  type: z.enum(["DID_REGISTER", "CHAT_SEND", "SIGNATURE_CREATE", "CONSENT_UPDATE", "RECOVERY_REQUEST"]),
  actorDid: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.any()).optional(),
  anchors: z.array(z.string()).optional(),
});

type AuditTrail = z.infer<typeof AuditTrailSchema>;

const events: AuditTrail[] = [
  {
    eventId: "evt_1",
    type: "SIGNATURE_CREATE",
    actorDid: "did:example:alice",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    metadata: { title: "NDA with Acme Corp" },
    anchors: ["icp:abc123", "evm:0xdef456"],
  },
  {
    eventId: "evt_2",
    type: "CONSENT_UPDATE",
    actorDid: "did:example:bob",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    metadata: { policy: "share-with-team" },
    anchors: [],
  },
  {
    eventId: "evt_3",
    type: "RECOVERY_REQUEST",
    actorDid: "did:example:carol",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    metadata: { reason: "lost-device" },
    anchors: ["ord:xyz789"],
  },
];

export default function ActivityFeed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Live Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((e) => (
          <div key={e.eventId} className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{e.type}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-sm mt-1">{e.actorDid}</p>
              {e.metadata && (
                <pre className="text-xs text-muted-foreground mt-1">{JSON.stringify(e.metadata, null, 2)}</pre>
              )}
            </div>
            <div className="text-right">
              {e.anchors && e.anchors.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{e.anchors.length} anchors</Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}