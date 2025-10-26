"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Sparkles } from "lucide-react";

const prompts = [
  "Suggest privacy mode for NDA",
  "Generate decoy signature",
  "Explain ICP anchoring",
];

export default function AIAssistChat() {
  const [input, setInput] = React.useState("");
  const [history, setHistory] = React.useState<{ role: "user" | "ai"; text: string }[]>([]);

  const send = (text: string) => {
    if (!text.trim()) return;
    setHistory((h) => [...h, { role: "user", text }]);
    setInput("");
    // Fake AI reply
    setTimeout(() => {
      const reply = `AI: "${text}" — got it. (This is a stub.)`;
      setHistory((h) => [...h, { role: "ai", text: reply }]);
      toast.info("AI replied");
    }, 600);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles size={16} /> AI Assist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-48 overflow-auto rounded border p-3 space-y-2 text-sm">
          {history.length === 0 && <p className="text-muted-foreground">Ask me anything…</p>}
          {history.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span className={m.role === "user" ? "bg-primary text-primary-foreground px-2 py-1 rounded" : "bg-muted px-2 py-1 rounded"}>
                {m.text}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea
            rows={2}
            placeholder="Type prompt…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <Button onClick={() => send(input)} size="icon">
            <Send size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <Button key={p} size="sm" variant="outline" onClick={() => send(p)}>
              {p}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}