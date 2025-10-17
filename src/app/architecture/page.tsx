"use client";

import * as React from "react";
import SystemDiagram from "@/components/architecture/SystemDiagram";
import ModuleCard from "@/components/architecture/ModuleCard";
import PipelineDescription from "@/components/architecture/PipelineDescription";
import PrivacyModeSwitch, { type PrivacyMode } from "@/components/privacy/PrivacyModeSwitch";
import DuressAlertBanner from "@/components/security/DuressAlertBanner";
import { MODULES } from "@/lib/architecture";
import { SCHEMAS } from "@/lib/schemas";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import UXFlow from "@/components/architecture/UXFlow";
import { TooltipProvider } from "@/components/ui/tooltip";
import QuickActions from "@/components/app/QuickActions";
import StatusPanel from "@/components/app/StatusPanel";
import ActivityFeed from "@/components/app/ActivityFeed";
import ConsentDashboard from "@/components/app/ConsentDashboard";
import KeyringViewer from "@/components/app/KeyringViewer";
import AIAssistChat from "@/components/app/AIAssistChat";
import Workspace from "@/components/app/Workspace";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AppHero from "@/components/app/AppHero";

export default function ArchitecturePage() {
  const [mode, setMode] = React.useState<PrivacyMode>("persistent");

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <AppHero
          title="Decentralized Secure Comms & Signing"
          subtitle="A dApp-style workspace for secure messaging and smart-signing"
        />

        <Tabs defaultValue="workspace">
          <TabsList className="w-full">
            <TabsTrigger value="workspace" className="flex-1">App Workspace</TabsTrigger>
            <TabsTrigger value="architecture" className="flex-1">Architecture Details</TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="mt-4 space-y-6">
            <div className="animate-in fade-in-0 duration-300">
              <QuickActions />
            </div>
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <Workspace />
            </div>
          </TabsContent>

          <TabsContent value="architecture" className="mt-4 space-y-6">
            <Separator />
            <div className="grid gap-4 md:grid-cols-2 animate-in fade-in-0 duration-300">
              {MODULES.map((m: { id: string; title: string; description?: string; bullets?: string[] }) => (
                <ModuleCard key={m.id} title={m.title} description={m.description} bullets={m.bullets} />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 animate-in fade-in-0 duration-300">
              <PipelineDescription />
              <UXFlow />
            </div>

            <PrivacyModeSwitch
              value={mode}
              onChange={(v: PrivacyMode) => {
                setMode(v);
                toast.info(`Privacy mode set to ${v}`);
              }}
            />

            <DuressAlertBanner />

            <div className="rounded-lg border bg-card p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="text-sm font-medium">Data Schemas</div>
              <Separator className="my-2" />
              <pre className="text-xs overflow-auto max-h-[300px] p-3 bg-muted rounded">
                {JSON.stringify(SCHEMAS, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function UXFooter() {
  return (
    <div className="space-y-4">
      <Separator />
      <div className="grid gap-4 md:grid-cols-2">
        <PipelineDescription />
        <UXAside />
      </div>
    </div>
  );
}

function UXAside() {
  return (
    <div className="space-y-4">
      <UXFlow />
    </div>
  );
}