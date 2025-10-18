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
      <div className="container mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-3 sm:space-y-4 md:space-y-6 max-w-7xl">
        <AppHero
          title="Decentralized Secure Comms & Signing"
          subtitle="A dApp-style workspace for secure messaging and smart-signing"
        />

        <Tabs defaultValue="workspace" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-auto gap-1">
            <TabsTrigger value="workspace" className="w-full py-2 sm:py-2.5 md:py-3 text-xs sm:text-sm">
              <span className="hidden sm:inline">App Workspace</span>
              <span className="sm:hidden">Workspace</span>
            </TabsTrigger>
            <TabsTrigger value="architecture" className="w-full py-2 sm:py-2.5 md:py-3 text-xs sm:text-sm">
              <span className="hidden sm:inline">Architecture Details</span>
              <span className="sm:hidden">Architecture</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4 md:space-y-6">
            <div className="animate-in fade-in-0 duration-300">
              <QuickActions />
            </div>
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <Workspace />
            </div>
          </TabsContent>

          <TabsContent value="architecture" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4 md:space-y-6">
            <Separator />
            
            {/* System Diagram - Full width on mobile */}
            <div className="animate-in fade-in-0 duration-300">
              <SystemDiagram />
            </div>
            
            {/* Module cards - Single column on mobile, 2 columns on lg+ */}
            <div className="grid gap-3 sm:gap-4 md:gap-5 grid-cols-1 lg:grid-cols-2 animate-in fade-in-0 duration-300">
              {MODULES.map((m: { id: string; title: string; description?: string; bullets?: string[] }) => (
                <ModuleCard key={m.id} title={m.title} description={m.description} bullets={m.bullets} />
              ))}
            </div>
            
            {/* Pipeline and UX Flow - Stacked on mobile, side-by-side on xl+ */}
            <div className="grid gap-3 sm:gap-4 md:gap-5 grid-cols-1 xl:grid-cols-2 animate-in fade-in-0 duration-300">
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

            {/* Data Schemas - Better mobile formatting */}
            <div className="rounded-lg border bg-card p-3 sm:p-4 md:p-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="text-xs sm:text-sm font-medium mb-2">Data Schemas</div>
              <Separator className="my-2" />
              <div className="overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[200px] sm:max-h-[250px] md:max-h-[300px] lg:max-h-[350px]">
                  <pre className="text-[10px] sm:text-xs p-2 sm:p-3 md:p-4 bg-muted rounded whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {JSON.stringify(SCHEMAS, null, 2)}
                  </pre>
                </div>
              </div>
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