"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, EyeOff, Anchor, AlertTriangle } from "lucide-react";

export default function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm sm:text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Button 
          className="w-full text-xs sm:text-sm" 
          onClick={() => toast.info("AI suggests: Use Anonymity mode for ephemeral chats.")}
        >
          <EyeOff className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> 
          <span className="truncate">Suggest Privacy</span>
        </Button>
        <Button 
          variant="destructive" 
          className="w-full text-xs sm:text-sm" 
          onClick={() => toast.warning("AI alert: Unusual signing velocity detected.")}
        >
          <AlertTriangle className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> 
          <span className="truncate">Duress Warning</span>
        </Button>
        <Button 
          className="w-full text-xs sm:text-sm" 
          onClick={() => toast.success("Verification steps passed. Anchoring recommended.")}
        >
          <Anchor className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> 
          <span className="truncate">Verify & Anchor</span>
        </Button>
        <Button 
          variant="secondary" 
          className="w-full text-xs sm:text-sm" 
          onClick={() => toast.success("Consent policy updated.")}
        >
          <ShieldCheck className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> 
          <span className="truncate">Update Consent</span>
        </Button>
      </CardContent>
    </Card>
  );
}