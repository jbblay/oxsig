"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const initial = {
  shareWithTeam: false,
  allowAnalytics: true,
  enableRecovery: true,
  storeOnIPFS: true,
};

export default function ConsentDashboard() {
  const [state, setState] = React.useState(initial);

  const toggle = (key: keyof typeof state) => {
    setState((s) => ({ ...s, [key]: !s[key] }));
    toast.info(`Consent updated: ${key} is now ${!state[key] ? "enabled" : "disabled"}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consent Dashboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(state).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <Label className="capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
            <Switch checked={v} onCheckedChange={() => toggle(k as keyof typeof state)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}