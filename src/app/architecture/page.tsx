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
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const compact = isMobile;

  return (
    <TooltipProvider>
      <div className="container mx-auto px-2 sm:px-4 md:px-6 py-2 sm:py-4 md:py-6 space-y-2 sm:space-y-4 md:space-y-6 max-w-6xl overflow-x-hidden">
        <AppHero
          title="Decentralized Secure Comms & Signing"
          subtitle="A secure workspace for storage, sharing, collaboration, and visual explanations"
        />

        <Tabs defaultValue="workspace" className="w-full overflow-hidden">
          <TabsList className="w-full grid grid-cols-2 h-auto gap-1 max-w-sm mx-auto">
            <TabsTrigger value="workspace" className="w-full py-1.5 sm:py-2 md:py-2.5 text-xs sm:text-sm truncate">
              <span className="hidden sm:inline">Workspace</span>
              <span className="sm:hidden">Work</span>
            </TabsTrigger>
            <TabsTrigger value="architecture" className="w-full py-1.5 sm:py-2 md:py-2.5 text-xs sm:text-sm truncate">
              <span className="hidden sm:inline">Architecture</span>
              <span className="sm:hidden">Arch</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="mt-2 sm:mt-4 space-y-2 sm:space-y-4 md:space-y-6 overflow-x-hidden">
            <div className="animate-in fade-in-0 duration-300 overflow-hidden">
              <QuickActions />
            </div>
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 overflow-hidden">
              <Workspace />
            </div>
          </TabsContent>

          <TabsContent value="architecture" className="mt-2 sm:mt-4 space-y-2 sm:space-y-4 md:space-y-6 overflow-x-hidden">
            <Separator />
            
            {/* System Diagram */}
            <div className="animate-in fade-in-0 duration-300 overflow-hidden">
              <SystemDiagram compact={compact} />
            </div>
            
          {/* Module cards - Single column on mobile, 2 columns on tablet+, max 3 on large screens */}
          <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-300 max-w-5xl mx-auto overflow-hidden">
              {MODULES.map((m: { id: string; title: string; description?: string; bullets?: string[] }) => (
                <ModuleCard key={m.id} title={m.title} description={m.description} bullets={m.bullets} compact={compact} />
              ))}
            </div>
            
            {/* Pipeline and UX Flow - Stacked on small, side-by-side on md+ */}
            <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-1 md:grid-cols-2 animate-in fade-in-0 duration-300 max-w-5xl mx-auto overflow-hidden">
              <PipelineDescription compact={compact} />
              <UXFlow compact={compact} />
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
              <div className="rounded-lg border bg-card p-2 sm:p-3 md:p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto overflow-hidden">
              <div className="text-sm sm:text-sm font-medium mb-2">Data Schemas</div>
              <Separator className="my-2" />
              <div className="overflow-hidden">
                <div className="overflow-y-auto max-h-[180px] sm:max-h-[220px] md:max-h-[280px] lg:max-h-[320px] overflow-x-hidden">
                  <pre className="text-[10px] sm:text-xs p-2 sm:p-3 md:p-4 bg-muted rounded whitespace-pre-wrap break-all font-mono leading-relaxed overflow-x-hidden">
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
