"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FolderLock, Presentation, Share2 } from "lucide-react";
import ConsentDashboard from "@/components/app/ConsentDashboard";
import KeyringViewer from "@/components/app/KeyringViewer";
import AIAssistChat from "@/components/app/AIAssistChat";
import StatusPanel from "@/components/app/StatusPanel";
import ActivityFeed from "@/components/app/ActivityFeed";

export default function Workspace() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    const handleResize = () => checkMobile();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Card className="overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-300 shadow-sm">
      <CardHeader className="px-4 py-3 md:px-6 md:py-4">
        <CardTitle className="text-base md:text-lg">Workspace</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* On small screens stack panels vertically by switching the Resizable group to column layout */}
        <ResizablePanelGroup 
          direction={isMobile ? "vertical" : "horizontal"} 
          className="min-h-[400px] sm:min-h-[500px] md:min-h-[600px] md:h-[600px]"
        >
          <ResizablePanel defaultSize={isMobile ? 60 : 55} minSize={isMobile ? 40 : 35} className="min-w-0">
            <div className="h-full p-2 md:p-4 scrollbar-hidden">
              <Tabs defaultValue="share" className="h-full flex flex-col">
                <TabsList className="w-full rounded-md border bg-card/80 backdrop-blur px-1 h-auto">
                  <TabsTrigger
                    value="share"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary py-2 text-xs md:text-sm"
                  >
                    Share
                  </TabsTrigger>
                  <TabsTrigger
                    value="consent"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary py-2 text-xs md:text-sm"
                  >
                    Consent
                  </TabsTrigger>
                  <TabsTrigger
                    value="keys"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary py-2 text-xs md:text-sm"
                  >
                    Keys
                  </TabsTrigger>
                  <TabsTrigger
                    value="chat"
                    className="flex-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary py-2 text-xs md:text-sm"
                  >
                    Chat
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto scrollbar-hidden">
                  <TabsContent value="share" className="h-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4 p-4">
                      <div className="flex items-center gap-2"><Share2 className="h-5 w-5 text-primary" /><h3 className="font-semibold">ShareDocs workflow</h3></div>
                      <p className="text-sm text-muted-foreground">Store a protected file, grant access through collaboration, then attach a visual explanation when useful.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button asChild variant="outline"><Link href="/storage"><FolderLock className="mr-2 h-4 w-4" />Secure Storage</Link></Button>
                        <Button asChild variant="outline"><Link href="/collab/storyboards"><Presentation className="mr-2 h-4 w-4" />Secure Canvas</Link></Button>
                      </div>
                    </div>
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

          <ResizableHandle 
            withHandle 
            className={`transition-colors hover:bg-primary/10 ${isMobile ? 'my-1' : 'md:mx-2'}`} 
          />

          <ResizablePanel defaultSize={isMobile ? 40 : 45} minSize={isMobile ? 25 : 30} className="min-w-0">
            <div className="h-full p-2 md:p-4 space-y-2 md:space-y-4 overflow-auto animate-in fade-in-0 slide-in-from-right-2 duration-300 scrollbar-hidden">
              <StatusPanel />
              <ActivityFeed />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </CardContent>
    </Card>
  );
}
