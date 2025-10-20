"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Key } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const keys = [
  { name: "Main", did: "did:key:z6MkhaXgBZDvotGksks8kyDn3Wq", type: "Ed25519" },
  { name: "Recovery", did: "did:key:z6Mkfriq1MqLai", type: "Secp256k1" },
];

export default function KeyringViewer() {
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Key size={16} /> Keyring
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {keys.map((k) => (
          <div key={k.name} className="rounded border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{k.name}</span>
              <Badge variant="outline">{k.type}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{k.did}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(k.did)}>
                <Copy size={14} />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}