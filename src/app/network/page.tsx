"use client";

import * as React from "react";
import { 
  Network, Radio, Globe, Users, Zap, Shield, 
  CheckCircle2, Clock, Activity, Maximize2, Minimize2, Copy, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { P2PNode, type PeerId } from "@/lib/network/p2p";
import { generatePairingQR, SimpleBarcodeScanner } from "@/lib/qr/pairing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function NetworkPage() {
  const nodeRef = React.useRef<P2PNode | null>(null);
  const [myId, setMyId] = React.useState<string>("-");
  const [peers, setPeers] = React.useState<Record<PeerId, { rttMs?: number; lastSeen: number; missedHeartbeats?: number; status?: 'healthy' | 'degraded' | 'offline'; spike?: boolean; verified?: boolean }>>({});
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Manual signaling state
  const [offerText, setOfferText] = React.useState("");
  const [remoteOfferText, setRemoteOfferText] = React.useState("");
  const [answerText, setAnswerText] = React.useState("");
  const [remoteAnswerText, setRemoteAnswerText] = React.useState("");
  const [copied, setCopied] = React.useState<string | null>(null);
  const [qrOpen, setQrOpen] = React.useState<null | { kind: 'offer' | 'answer'; url: string }>(null);
  const [scanOpen, setScanOpen] = React.useState<null | { target: 'offer' | 'answer' }>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerRef = React.useRef<SimpleBarcodeScanner | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [turnUrl, setTurnUrl] = React.useState('');
  const [turnUsername, setTurnUsername] = React.useState('');
  const [turnCredential, setTurnCredential] = React.useState('');

  React.useEffect(() => {
    // Load settings from localStorage
    try {
      const raw = localStorage.getItem('p2p_settings_v1');
      if (raw) {
        const cfg = JSON.parse(raw);
        setTurnUrl(cfg.turnUrl || '');
        setTurnUsername(cfg.turnUsername || '');
        setTurnCredential(cfg.turnCredential || '');
      } else {
        setTurnUrl(localStorage.getItem('p2p_turn_url') || '');
        setTurnUsername(localStorage.getItem('p2p_turn_username') || '');
        setTurnCredential(localStorage.getItem('p2p_turn_credential') || '');
      }
    } catch {}
  }, []);

  const initNode = React.useCallback(() => {
    const node = new P2PNode();
    nodeRef.current = node;
    setMyId(node.id);
    const onPeer = (peerId: PeerId) => {
      setPeers((prev) => ({ ...prev, [peerId]: { ...prev[peerId], lastSeen: Date.now() } }));
    };
    const onPeerDisconnected = (peerId: PeerId) => {
      setPeers((prev) => {
        const copy = { ...prev };
        delete copy[peerId];
        return copy;
      });
    };
    const onMetrics = (stats: { peerId: PeerId; rttMs?: number; lastSeen: number; missedHeartbeats: number; status: 'healthy'|'degraded'|'offline'; spike?: boolean; verified?: boolean }) => {
      setPeers((prev) => ({
        ...prev,
        [stats.peerId]: {
          rttMs: stats.rttMs,
          lastSeen: stats.lastSeen,
          missedHeartbeats: stats.missedHeartbeats,
          status: stats.status,
          spike: stats.spike,
          verified: stats.verified,
        },
      }));
    };
    node.on("peer", onPeer);
    node.on("peerDisconnected", onPeerDisconnected);
    node.on("metrics", onMetrics);
  }, []);

  React.useEffect(() => {
    initNode();
    return () => {
      if (nodeRef.current) {
        try { nodeRef.current.shutdown(); } catch {}
        nodeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const peerIds = React.useMemo(() => Object.keys(peers) as PeerId[], [peers]);
  const connectedPeers = peerIds.length;
  const avgRtt = peerIds.length
    ? Math.round(peerIds.reduce((acc, id) => acc + (peers[id]?.rttMs ?? 150), 0) / peerIds.length)
    : 0;
  const networkHealth = React.useMemo(() => {
    const score = Math.max(0, 100 - Math.min(80, Math.floor(avgRtt / 3)));
    return score;
  }, [avgRtt]);

  async function handleCreateOffer() {
    if (!nodeRef.current) return;
    const str = await nodeRef.current.createOffer();
    setOfferText(str);
  }
  async function handleAcceptAnswer() {
    if (!nodeRef.current || !remoteAnswerText.trim()) return;
    await nodeRef.current.acceptAnswer(remoteAnswerText.trim());
  }
  async function handleReceiveOfferCreateAnswer() {
    if (!nodeRef.current || !remoteOfferText.trim()) return;
    const ans = await nodeRef.current.receiveOfferCreateAnswer(remoteOfferText.trim());
    setAnswerText(ans);
  }
  function statusForPeer(id: PeerId): "active" | "syncing" {
    const st = peers[id]?.status;
    if (st === 'offline') return 'syncing';
    if (st === 'degraded') return 'syncing';
    return 'active';
  }
  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  async function handleShowQR(kind: 'offer' | 'answer') {
    const text = kind === 'offer' ? offerText : answerText;
    if (!text?.trim()) return;
    const url = await generatePairingQR(text.trim());
    setQrOpen({ kind, url });
  }

  async function startScan(target: 'offer' | 'answer') {
    setScanOpen({ target });
    // Start after dialog opens
    setTimeout(async () => {
      if (!videoRef.current) return;
      const scanner = new SimpleBarcodeScanner();
      scannerRef.current = scanner;
      try {
        await scanner.start(videoRef.current, (text) => {
          if (target === 'offer') setRemoteOfferText(text);
          else setRemoteAnswerText(text);
        });
      } catch (e) {
        // If not supported, we leave the text boxes as manual paste
      }
    }, 50);
  }

  function stopScan() {
    if (scannerRef.current) {
      scannerRef.current.stop(videoRef.current || undefined);
      scannerRef.current = null;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('p2p_settings_v1', JSON.stringify({ turnUrl, turnUsername, turnCredential }));
    } catch {}
  }

  function reinitNode() {
    // Shutdown existing node and clear state, then init a new node which will read latest settings
    if (nodeRef.current) {
      try { nodeRef.current.shutdown(); } catch {}
      nodeRef.current = null;
    }
    setPeers({});
    initNode();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Network Topology</h1>
          <p className="text-sm text-muted-foreground">P2P connections, neighbor discovery, and network health</p>
          <p className="text-xs text-muted-foreground mt-1">Your ID: <span className="font-mono">{myId}</span></p>
        </div>
        <Badge variant="default" className="gap-1 bg-cyan-600">
          <Radio className="h-3 w-3" />
          {connectedPeers} Peers
        </Badge>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="ml-2">P2P Settings</Button>
      </div>

      {/* Network Status */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: "Connected Peers", value: connectedPeers, icon: Users, color: "text-blue-600" },
          { label: "Network Health", value: `${networkHealth}%`, icon: Activity, color: "text-green-600" },
          { label: "Avg Latency", value: `${avgRtt}ms`, icon: Zap, color: "text-yellow-600" },
          { label: "Data Transfer", value: "—", icon: Globe, color: "text-purple-600" },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <span className="text-2xl font-bold">{stat.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Topology */}
        <div className="lg:col-span-2 space-y-6">
          {/* Network Visualization */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    Network Topology
                  </CardTitle>
                  <CardDescription>
                    Visual representation of P2P connections
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="gap-2"
                >
                  {isExpanded ? (
                    <>
                      <Minimize2 className="h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-4 w-4" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className={`rounded-lg bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-2 border-dashed transition-all duration-300 ${
                  isExpanded ? 'h-[600px]' : 'aspect-video'
                }`}
              >
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden">
                  {/* Central Node */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg animate-pulse">
                        <Network className="h-8 w-8 text-white" />
                      </div>
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                        <Badge variant="secondary" className="text-xs">You</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Peer Nodes - Circular Layout (dynamic) */}
                  {(() => {
                    const angleStep = peerIds.length ? 360 / Math.max(peerIds.length, 1) : 0;
                    return peerIds.map((pid, i) => {
                      const angle = i * angleStep;
                      const distance = isExpanded ? 200 : 120;
                      const x = Math.cos((angle * Math.PI) / 180) * distance;
                      const y = Math.sin((angle * Math.PI) / 180) * distance;
                      const status = statusForPeer(pid);
                      return (
                        <div
                          key={pid}
                          className="absolute top-1/2 left-1/2 transition-all duration-300"
                          style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                        >
                          <svg
                            className="absolute top-1/2 left-1/2 pointer-events-none"
                            style={{
                              width: Math.abs(x * 2) + 50,
                              height: Math.abs(y * 2) + 50,
                              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                              transformOrigin: "center",
                            }}
                          >
                            <line
                              x1="50%"
                              y1="50%"
                              x2={-x}
                              y2={-y}
                              stroke={status === "active" ? "#06b6d4" : "#fbbf24"}
                              strokeWidth="2"
                              strokeDasharray={status === "syncing" ? "5,5" : "0"}
                              opacity="0.3"
                            />
                          </svg>
                          <div className="relative">
                            <div
                              className={`h-10 w-10 rounded-full flex items-center justify-center shadow-md ${
                                status === "active"
                                  ? "bg-gradient-to-br from-green-500 to-emerald-500"
                                  : "bg-gradient-to-br from-yellow-500 to-orange-500"
                              }`}
                            >
                              <Radio className="h-5 w-5 text-white" />
                            </div>
                            {isExpanded && (
                              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                                <Badge variant="outline" className="text-xs">
                                  {pid.slice(0, 6)}…{pid.slice(-4)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* Stats Overlay */}
                  {!isExpanded && (
                    <div className="absolute bottom-4 right-4 text-center bg-background/80 backdrop-blur-sm rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">Click Expand for details</p>
                    </div>
                  )}
                  
                  {isExpanded && (
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                      <div className="flex gap-3">
                        <Badge variant="default" className="gap-1 bg-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {peerIds.filter((p) => statusForPeer(p) === "active").length} Active
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {peerIds.filter((p) => statusForPeer(p) === "syncing").length} Syncing
                        </Badge>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setIsExpanded((v) => !v)}>
                        Refresh Topology
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Connections */}
          <Card>
            <CardHeader>
              <CardTitle>Active Connections</CardTitle>
              <CardDescription>
                Currently connected peers in your network
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {peerIds.length === 0 && (
                <div className="text-sm text-muted-foreground">No peers yet. Use manual signaling on the right to connect.</div>
              )}
              {peerIds.map((pid) => {
                const info = peers[pid] || {};
                const rtt = info.rttMs ?? 0;
                const status = statusForPeer(pid);
                return (
                  <div key={pid} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                      <Radio className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-mono truncate">{pid.slice(0, 10)}…{pid.slice(-6)}</p>
                        <Badge variant={status === "active" ? "default" : "secondary"} className="text-xs">
                          {status}
                        </Badge>
                        {info.verified && (
                          <Badge variant="default" className="text-[10px] bg-emerald-600">verified</Badge>
                        )}
                        {info.spike && (
                          <Badge variant="secondary" className="text-[10px]">latency spike</Badge>
                        )}
                        {info.missedHeartbeats && info.missedHeartbeats > 0 && (
                          <Badge variant="secondary" className="text-[10px]">missed {info.missedHeartbeats}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{rtt ? `${rtt}ms latency` : "measuring…"}</p>
                    </div>
                    <div className="text-right">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mb-1" />
                      <p className="text-xs text-muted-foreground">{rtt ? `${rtt}ms` : "—"}</p>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" className="w-full mt-2">View All Connections</Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Stats & Info */}
        <div className="space-y-6">
          {/* Network Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Network Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold">{networkHealth}%</span>
                  <Badge
                    variant="default"
                    className={networkHealth > 80 ? "bg-green-600" : networkHealth > 50 ? "bg-yellow-600" : "bg-red-600"}
                  >
                    {networkHealth > 80 ? "Excellent" : networkHealth > 50 ? "Fair" : "Poor"}
                  </Badge>
                </div>
                <Progress value={networkHealth} className="h-2" />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>Low latency connections</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>Manual peer introductions</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>NAT traversal working</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connection Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Peers</span>
                <span className="font-semibold">{connectedPeers}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active</span>
                <span className="font-semibold text-green-600">42</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Syncing</span>
                <span className="font-semibold text-yellow-600">5</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Offline</span>
                <span className="font-semibold text-gray-600">0</span>
              </div>
            </CardContent>
          </Card>

          {/* Manual Signaling (Peer Discovery) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Manual Signaling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">1) Initiate connection</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={handleCreateOffer}>Generate Offer</Button>
                  <Button size="sm" variant="outline" disabled={!offerText} onClick={() => handleCopy(offerText, "offer")}>
                    {copied === "offer" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />} Copy
                  </Button>
                  <Button size="sm" variant="outline" disabled={!offerText} onClick={() => handleShowQR('offer')}>Show QR</Button>
                </div>
                <Textarea value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder="Share this offer with your peer (paste via chat/QR)" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Textarea value={remoteAnswerText} onChange={(e) => setRemoteAnswerText(e.target.value)} placeholder="Paste remote answer here to complete" />
                  <Button size="sm" onClick={handleAcceptAnswer} disabled={!remoteAnswerText.trim()}>Accept Answer</Button>
                  <Button size="sm" variant="outline" onClick={() => startScan('answer')}>Scan Answer QR</Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">2) Respond to a peer's offer</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Textarea value={remoteOfferText} onChange={(e) => setRemoteOfferText(e.target.value)} placeholder="Paste remote offer here" />
                  <Button size="sm" onClick={handleReceiveOfferCreateAnswer} disabled={!remoteOfferText.trim()}>Create Answer</Button>
                  <Button size="sm" variant="outline" onClick={() => startScan('offer')}>Scan Offer QR</Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" disabled={!answerText} onClick={() => handleCopy(answerText, "answer")}>
                    {copied === "answer" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />} Copy Answer
                  </Button>
                  <Button size="sm" variant="outline" disabled={!answerText} onClick={() => handleShowQR('answer')}>Show Answer QR</Button>
                </div>
                <Textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Share this answer back with the initiator" />
              </div>

              <p className="text-xs text-muted-foreground">Tip: For offline pairing, you can show this text as a QR code using the existing QR utilities.</p>
            </CardContent>
          </Card>

          {/* QR Dialogs */}
          <Dialog open={!!qrOpen} onOpenChange={(open) => { if (!open) setQrOpen(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{qrOpen?.kind === 'offer' ? 'Offer QR' : 'Answer QR'}</DialogTitle>
                <DialogDescription>Have your peer scan this code to transfer the {qrOpen?.kind}.</DialogDescription>
              </DialogHeader>
              {qrOpen?.url && (
                <div className="w-full flex items-center justify-center">
                  <img src={qrOpen.url} alt="pairing-qr" className="max-w-full h-auto" />
                </div>
              )}
              {qrOpen?.url && (
                <div className="w-full flex items-center justify-center mt-2">
                  <Button size="sm" onClick={() => {
                    const a = document.createElement('a');
                    a.href = qrOpen.url!;
                    a.download = `${qrOpen?.kind || 'qr'}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}>Download QR</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={!!scanOpen} onOpenChange={(open) => { if (!open) { setScanOpen(null); stopScan(); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Scan {scanOpen?.target === 'offer' ? 'Offer' : 'Answer'} QR</DialogTitle>
                <DialogDescription>Allow camera access and align the QR within the frame.</DialogDescription>
              </DialogHeader>
              <div className="w-full aspect-video rounded overflow-hidden border">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              </div>
            </DialogContent>
          </Dialog>

          {/* Settings Dialog */}
          <Dialog open={settingsOpen} onOpenChange={(open) => setSettingsOpen(open)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>P2P Settings</DialogTitle>
                <DialogDescription>Configure TURN to improve connectivity on restrictive networks.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">TURN URL</label>
                  <Input value={turnUrl} onChange={(e) => setTurnUrl(e.target.value)} placeholder="turn:your.turn.server:3478" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">TURN Username</label>
                  <Input value={turnUsername} onChange={(e) => setTurnUsername(e.target.value)} placeholder="username" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">TURN Credential</label>
                  <Input type="password" value={turnCredential} onChange={(e) => setTurnCredential(e.target.value)} placeholder="password" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
                  <Button onClick={() => { saveSettings(); reinitNode(); setSettingsOpen(false); }}>Save</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Network Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-muted-foreground">End-to-end encryption</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-muted-foreground">Peer authentication</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-muted-foreground">Traffic obfuscation</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
