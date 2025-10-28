"use client";

import * as React from "react";
import {
  Users, MessageSquare, Paperclip, Search, PlusCircle, Send,
  File, Download, Trash2, X, Shield, Lock, FileEdit, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from 'next/dynamic';

// Dynamically import DocEditor to reduce initial bundle size
const DocEditor = dynamic(() => import('@/components/app/DocEditor'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96"><div className="text-muted-foreground">Loading editor...</div></div>
});

interface Peer {
  id: string;
  name: string;
  avatar?: string;
  online: boolean;
  ownerName?: string;
  memberCount?: number;
}

interface Message {
  id: string;
  peer_id: string;
  text: string;
  sender: string;
  created_at: string;
}

interface CollabFile {
  id: string;
  name: string;
  size: string;
  encrypted: boolean;
}

export default function CollabPage() {
  const [activeView, setActiveView] = React.useState<"chat" | "files" | "editor">("chat");
  const [peers, setPeers] = React.useState<Peer[]>([]);
  const [selectedPeer, setSelectedPeer] = React.useState<Peer | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [files, setFiles] = React.useState<CollabFile[]>([]);
  const [newMessage, setNewMessage] = React.useState("");
  const [loadingPeers, setLoadingPeers] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [loadingFiles, setLoadingFiles] = React.useState(false);

  // Fetch peers/collaborations
  React.useEffect(() => {
    fetch('/api/collaborations')
      .then(res => res.json())
      .then(data => {
        // Map collaboration data to peer format
        const mappedPeers = (data.collaborations || []).map((collab: any) => ({
          id: collab.id,
          name: collab.name,
          avatar: collab.avatar || undefined,
          online: true, // Could be based on real-time status later
          ownerName: collab.ownerName,
          memberCount: collab.memberCount
        }));
        setPeers(mappedPeers);
        if (mappedPeers.length > 0) {
          setSelectedPeer(mappedPeers[0]);
        }
      })
      .catch(err => console.error('Failed to fetch peers:', err))
      .finally(() => setLoadingPeers(false));
  }, []);

  // Fetch messages when peer changes
  React.useEffect(() => {
    if (!selectedPeer) return;
    setLoadingMessages(true);
    fetch(`/api/collaborations/${selectedPeer.id}/messages`)
      .then(res => res.json())
      .then(data => setMessages(data.messages || []))
      .catch(err => console.error('Failed to fetch messages:', err))
      .finally(() => setLoadingMessages(false));
  }, [selectedPeer]);

  // Fetch files when peer changes
  React.useEffect(() => {
    if (!selectedPeer) return;
    setLoadingFiles(true);
    fetch(`/api/collaborations/${selectedPeer.id}/files`)
      .then(res => res.json())
      .then(data => setFiles(data.files || []))
      .catch(err => console.error('Failed to fetch files:', err))
      .finally(() => setLoadingFiles(false));
  }, [selectedPeer]);

  const handleSendMessage = async () => {
    if (newMessage.trim() && selectedPeer) {
      const optimisticMessage = {
        id: 'temp-' + Date.now(),
        peer_id: selectedPeer.id,
        text: newMessage,
        sender: "Me",
        created_at: new Date().toISOString()
      };
      setMessages([...messages, optimisticMessage]);
      setNewMessage("");

      try {
        await fetch(`/api/collaborations/${selectedPeer.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newMessage })
        });
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }
  };

  if (loadingPeers) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (peers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
        <Users className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">No collaborations yet</p>
        <Button>
          <PlusCircle className="h-4 w-4 mr-2" />
          Start Collaboration
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8rem)] gap-4 md:gap-0">
      {/* Peer List Sidebar - Hidden on mobile, shown on md+ */}
      <Card className="hidden md:flex md:w-1/4 md:min-w-[250px] flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Peers
          </CardTitle>
          <div className="relative">
            <Input placeholder="Search peers..." className="pl-8" />
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <div className="space-y-2">
            {peers.map((peer, index) => (
              <motion.div
                key={peer.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedPeer?.id === peer.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
                onClick={() => setSelectedPeer(peer)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Avatar className="h-9 w-9 relative">
                  <AvatarImage src={peer.avatar} alt={peer.name} />
                  <AvatarFallback>{peer.name?.charAt(0) || 'U'}</AvatarFallback>
                  {peer.online && (
                    <motion.div
                      className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-green-500 rounded-full border-2 border-background"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </Avatar>
                <span className="font-medium text-sm">{peer.name}</span>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mobile Peer Selector - Only shown on mobile */}
      <div className="md:hidden mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedPeer?.avatar} alt={selectedPeer?.name} />
                <AvatarFallback>{selectedPeer?.name?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <select
                className="flex-1 bg-background border rounded-md px-3 py-2 text-sm"
                value={selectedPeer?.id || ''}
                onChange={(e) => setSelectedPeer(peers.find(p => p.id === e.target.value) || null)}
              >
                {peers.map((peer) => (
                  <option key={peer.id} value={peer.id}>
                    {peer.name} {peer.online ? '🟢' : '⚫'}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 hidden md:block">
                <AvatarImage src={selectedPeer?.avatar} alt={selectedPeer?.name} />
                <AvatarFallback>{selectedPeer?.name?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-base md:text-lg font-semibold">{selectedPeer?.name || 'Select a peer'}</h2>
                <p className="text-xs text-muted-foreground">{selectedPeer?.online ? "Online" : "Offline"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={activeView === 'chat' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveView('chat')} className="text-xs md:text-sm">
                <MessageSquare className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Chat</span>
              </Button>
              <Button variant={activeView === 'editor' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveView('editor')} className="text-xs md:text-sm">
                <FileEdit className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Editor</span>
              </Button>
              <Button variant={activeView === 'files' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveView('files')} className="text-xs md:text-sm">
                <Paperclip className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Files</span>
              </Button>
            </div>
          </CardHeader>
          
          <AnimatePresence mode="wait">
            {activeView === 'chat' ? (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    <AnimatePresence>
                      {messages.filter(m => m.peer_id === selectedPeer?.id).map((msg, i) => (
                        <motion.div
                          key={msg.id}
                          layout
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className={`flex ${msg.sender === 'Me' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[85%] sm:max-w-xs lg:max-w-md p-3 rounded-lg ${msg.sender === 'Me' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-xs text-right mt-1 opacity-70">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </CardContent>
                <div className="p-4 border-t">
                  <div className="relative">
                    <Input 
                      placeholder="Send an encrypted message..." 
                      className="pr-10 text-sm" 
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <Button size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleSendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Lock className="h-3 w-3 text-green-500" /> End-to-end encrypted.</p>
                </div>
              </motion.div>
            ) : activeView === 'editor' ? (
              <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                <CardContent className="flex-1 p-4 overflow-hidden">
                  <DocEditor />
                </CardContent>
              </motion.div>
            ) : (
              <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <CardContent className="flex-1 p-4 space-y-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="border-2 border-dashed rounded-lg p-6 md:p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Paperclip className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    </motion.div>
                    <p className="font-medium text-sm md:text-base">Drag & drop files or click to upload</p>
                    <p className="text-xs text-muted-foreground">All files are end-to-end encrypted.</p>
                  </motion.div>
                  <h3 className="font-semibold text-sm">Shared Files</h3>
                  <div className="space-y-2">
                    {loadingFiles ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : files.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No files shared yet
                      </div>
                    ) : (
                      files.map((file, index) => (
                        <motion.div
                          key={file.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.1 }}
                          whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <File className="h-5 w-5 text-blue-500 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{file.size}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {file.encrypted && (
                              <Badge variant="outline" className="gap-1 text-green-600 border-green-600 hidden sm:flex">
                                <Shield className="h-3 w-3" /> Encrypted
                              </Badge>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hidden sm:inline-flex"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
