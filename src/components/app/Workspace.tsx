"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SigningForm from "@/components/app/SigningForm";
import ConsentDashboard from "@/components/app/ConsentDashboard";
import KeyringViewer from "@/components/app/KeyringViewer";
import AIAssistChat from "@/components/app/AIAssistChat";
import StatusPanel from "@/components/app/StatusPanel";
import ActivityFeed from "@/components/app/ActivityFeed";

export default function Workspace() {
  return (
    <Card className="overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-300 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Workspace</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* On small screens stack panels vertically by switching the Resizable group to column layout */}
        <ResizablePanelGroup direction="horizontal" className="h-auto md:h-[600px]">
          <ResizablePanel defaultSize={55} minSize={35} className="min-w-0">
            <div className="h-full p-4">
              <Tabs defaultValue="sign" className="h-full flex flex-col">
                <TabsList className="w-full rounded-md border bg-card/80 backdrop-blur px-1">
                  <TabsTrigger
                    value="sign"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    Sign
                  </TabsTrigger>
                  <TabsTrigger
                    value="consent"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    Consent
                  </TabsTrigger>
                  <TabsTrigger
                    value="keys"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    Keys
                  </TabsTrigger>
                  <TabsTrigger
                    value="chat"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    Chat
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto">
                  <TabsContent value="sign" className="h-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                    <SigningForm />
                  </TabsContent>
                  <TabsContent value="consent" className="h-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                    <ConsentDashboard />
                  </TabsContent>
                  <TabsContent value="keys" className="h-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                    <KeyringViewer />
                  </TabsContent>
                  <TabsContent value="chat" className="h-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                    <AIAssistChat />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="transition-colors hover:bg-primary/10 md:mx-2" />

          <ResizablePanel defaultSize={45} minSize={30} className="min-w-0">
            <div className="h-full p-4 space-y-4 overflow-auto animate-in fade-in-0 slide-in-from-right-2 duration-300 scrollbar-hidden">
              <StatusPanel />
              <ActivityFeed />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </CardContent>
    </Card>
  );
}