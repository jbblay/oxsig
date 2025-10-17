"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, EyeOff, Anchor, AlertTriangle } from "lucide-react";

export default function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => toast.info("AI suggests: Use Anonymity mode for ephemeral chats.")}>
          <EyeOff className="mr-2" /> Suggest Privacy
        </Button>
        <Button variant="destructive" onClick={() => toast.warning("AI alert: Unusual signing velocity detected.")}>
          <AlertTriangle className="mr-2" /> Duress Warning
        </Button>
        <Button onClick={() => toast.success("Verification steps passed. Anchoring recommended.")}>
          <Anchor className="mr-2" /> Verify & Anchor
        </Button>
        <Button variant="secondary" onClick={() => toast.success("Consent policy updated.")}>
          <ShieldCheck className="mr-2" /> Update Consent
        </Button>
      </CardContent>
    </Card>
  );
}