import { CheckCircle2, CircleDashed, Clock3, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const capabilities = [
  { area: "Authentication", status: "Implemented", detail: "Email registration, sign-in, refresh sessions, logout, and protected routes." },
  { area: "Account", status: "Implemented", detail: "Profile, identity, and privacy controls share one account experience." },
  { area: "Secure Storage", status: "Partial", detail: "Authenticated storage exists; user-to-user grants, revocation, and expiry are the next MVP milestone." },
  { area: "Storyboards", status: "Implemented", detail: "Authorized boards support canvas events, audio recording, persistence, sharing, and replay." },
  { area: "Cyber Lab", status: "Partial", detail: "Authorized Docker-backed Kali lifecycle and terminal work on a Docker-capable host, not Vercel." },
  { area: "Audit Log", status: "Implemented", detail: "Security-relevant authentication, storyboard, and lab actions are recorded without content payloads." },
  { area: "Real-time collaboration", status: "Planned", detail: "Asynchronous sharing is first; multi-user live editing is intentionally deferred." },
];

const styles = {
  Implemented: { icon: CheckCircle2, className: "border-emerald-500/40 text-emerald-500" },
  Partial: { icon: Clock3, className: "border-amber-500/40 text-amber-500" },
  Planned: { icon: CircleDashed, className: "border-slate-500/40 text-slate-400" },
} as const;

export default function ArchitecturePage() {
  return <div className="space-y-6">
    <div><div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-primary" /><h1 className="text-2xl font-bold md:text-3xl">Architecture & Status</h1></div><p className="mt-2 max-w-3xl text-sm text-muted-foreground">A truthful view of what this OXSIG build provides now. Partial and planned capabilities are not presented as active protection.</p></div>
    <div className="grid gap-4 md:grid-cols-2">{capabilities.map((item) => { const style = styles[item.status as keyof typeof styles]; const Icon = style.icon; return <Card key={item.area}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{item.area}</CardTitle><Badge variant="outline" className={style.className}><Icon className="mr-1 h-3 w-3" />{item.status}</Badge></div></CardHeader><CardContent><CardDescription>{item.detail}</CardDescription></CardContent></Card>; })}</div>
    <Card><CardHeader><CardTitle>Current deployment boundary</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Vercel hosts the web application and authenticated APIs backed by PostgreSQL.</p><p>Disposable lab machines require an isolated, Docker-capable runtime. A Vercel deployment correctly reports that runtime as unavailable.</p><p>OXSIG does not claim end-to-end encryption, zero knowledge, onion routing, or AI threat detection unless code and deployment configuration actually provide it.</p></CardContent></Card>
  </div>;
}
