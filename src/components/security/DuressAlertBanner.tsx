"use client";

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DuressAlertBanner() {
  return (
    <Alert className="bg-card">
      <AlertTitle>Duress-aware signing</AlertTitle>
      <AlertDescription>
        If duress mode is enabled, a decoy signature is generated and a silent alert is recorded; real content remains protected.
      </AlertDescription>
    </Alert>
  );
}