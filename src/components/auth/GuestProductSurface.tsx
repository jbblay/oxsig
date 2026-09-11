import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Boxes,
  Check,
  FileCheck2,
  LibraryBig,
  MessageCircle,
  Network,
  RadioTower,
  ShieldCheck,
  Swords,
  Terminal,
  UsersRound,
} from 'lucide-react';
import GuestSampleFlow from '@/components/app/GuestSampleFlow';
import { Button } from '@/components/ui/button';
import { authPathWithReturnTo } from '@/lib/auth-return';

type GuestSurface =
  | 'academy'
  | 'warroom'
  | 'labs'
  | 'collaboration'
  | 'live'
  | 'boards'
  | 'vault'
  | 'resources'
  | 'account';

type SurfaceConfig = {
  title: string;
  kicker: string;
  description: string;
  icon: typeof Terminal;
  capabilities: Array<{ title: string; detail: string; icon: typeof Terminal }>;
  sampleTitle: string;
  sampleLines: string[];
  showFlow?: boolean;
};

const SURFACE_PATH: Record<GuestSurface, string> = {
  academy: '/academy',
  warroom: '/warroom',
  labs: '/labs',
  collaboration: '/collab',
  live: '/live',
  boards: '/collab/storyboards',
  vault: '/vault',
  resources: '/manage',
  account: '/account',
};

const SURFACES: Record<GuestSurface, SurfaceConfig> = {
  academy: {
    title: 'Academy',
    kicker: 'Guest preview // Learning paths',
    description: 'See how guided learning connects lessons, practice, evidence and capability proof before creating an account.',
    icon: BookOpen,
    capabilities: [
      { title: 'Guided paths', detail: 'Move from concept to hands-on capability instead of a disconnected course list.', icon: BookOpen },
      { title: 'Practice in context', detail: 'Exercises connect directly to OXSIG missions and technical environments.', icon: Terminal },
      { title: 'Evidence-backed progress', detail: 'Proof comes from technical outcomes, not a completion click.', icon: FileCheck2 },
    ],
    sampleTitle: 'Sample learning path',
    sampleLines: ['01 · Active Directory discovery', '02 · Kerberos and DNS reasoning', '03 · Service recovery practice', '04 · Evidence review and capability proof'],
  },
  warroom: {
    title: 'WarRoom',
    kicker: 'Guest preview // Team operation',
    description: 'Inspect the multiplayer operation model: shared mission context, assigned stations, presence and evidence coordination.',
    icon: Swords,
    capabilities: [
      { title: '2–4 operators', detail: 'Different stations can investigate the same mission in parallel.', icon: UsersRound },
      { title: 'Shared mission state', detail: 'Operators work from the same topology, objectives and evidence targets.', icon: Network },
      { title: 'AI in context', detail: 'The operator can ask for explanations or supported actions inside the mission.', icon: Bot },
    ],
    sampleTitle: 'Sample team channel',
    sampleLines: ['P1 · Enumerating domain services', 'P2 · Reviewing DNS and authentication failures', 'AI · Mission context loaded', 'EV · 2 / 5 evidence objectives captured'],
    showFlow: true,
  },
  labs: {
    title: 'Cyber Lab',
    kicker: 'Guest preview // Technical workspace',
    description: 'See the terminal-first lab workflow before provisioning anything. Live machines and persistent sessions begin after sign-in.',
    icon: Terminal,
    capabilities: [
      { title: 'Real controls', detail: 'The authenticated product uses terminal and desktop surfaces instead of simulated completion buttons.', icon: Terminal },
      { title: 'Mission-aware AI', detail: 'AI receives the current environment and objective context when a real lab is running.', icon: Bot },
      { title: 'Evidence capture', detail: 'Commands and technical outcomes can become mission evidence and learning proof.', icon: FileCheck2 },
    ],
    sampleTitle: 'Interface preview',
    sampleLines: ['oxsig> operation open black-domain', 'oxsig> topology inspect --mission', 'oxsig> terminal attach operator-01', '✓ evidence channel ready'],
    showFlow: true,
  },
  collaboration: {
    title: 'Collaboration',
    kicker: 'Guest preview // Technical coordination',
    description: 'Preview persistent technical conversations, shared context and the handoff between discussion, boards and active environments.',
    icon: MessageCircle,
    capabilities: [
      { title: 'Technical channels', detail: 'Keep mission discussion next to the work it refers to.', icon: MessageCircle },
      { title: 'Shared context', detail: 'Link operations, resources, boards and evidence into the conversation.', icon: Network },
      { title: 'Persistent team work', detail: 'Signed-in teams keep history and ownership across sessions.', icon: UsersRound },
    ],
    sampleTitle: 'Sample channel',
    sampleLines: ['P2 · I found the domain controller.', 'P1 · Check DNS before changing authentication services.', 'AI · I can explain the dependency chain.', 'BOARD · topology-note-01 linked'],
  },
  live: {
    title: 'Live Workspace',
    kicker: 'Guest preview // Shared control',
    description: 'See how operators bring owned resources into a shared technical session without transferring ownership.',
    icon: RadioTower,
    capabilities: [
      { title: 'Presence', detail: 'See who is connected and what station they are operating.', icon: UsersRound },
      { title: 'Resource links', detail: 'Attach labs and owned resources to one active session.', icon: Network },
      { title: 'Controlled access', detail: 'Ownership and protected actions stay scoped to authenticated operators.', icon: ShieldCheck },
    ],
    sampleTitle: 'Sample live session',
    sampleLines: ['SESSION · black-domain-live', 'P1 · terminal · connected', 'P2 · windows desktop · connected', 'RESOURCE · dc01 · owner scoped'],
  },
  boards: {
    title: 'Boards',
    kicker: 'Guest preview // Visual reasoning',
    description: 'Preview the visual workspace used to explain topology, incident flow and technical decisions alongside active work.',
    icon: Network,
    capabilities: [
      { title: 'Topology maps', detail: 'Explain systems, trust relationships and attack paths visually.', icon: Network },
      { title: 'Team explanation', detail: 'Use a shared board to communicate what the team believes is happening.', icon: UsersRound },
      { title: 'Evidence links', detail: 'Connect diagrams back to mission evidence and reusable knowledge.', icon: FileCheck2 },
    ],
    sampleTitle: 'Sample board',
    sampleLines: ['KALI → WEB01 → DC01', 'DNS → Kerberos → LDAP', 'Finding: authentication dependency failure', 'Evidence: service-state-before.txt'],
  },
  vault: {
    title: 'Vault',
    kicker: 'Guest preview // Operator memory',
    description: 'See how commands, procedures, scripts, concepts and playbooks become reusable technical memory.',
    icon: LibraryBig,
    capabilities: [
      { title: 'Reusable knowledge', detail: 'Save useful technical material instead of losing it in one session.', icon: LibraryBig },
      { title: 'Searchable records', detail: 'Find commands, notes and evidence when the next operation needs them.', icon: FileCheck2 },
      { title: 'Private ownership', detail: 'Personal and team records become persistent after authentication.', icon: ShieldCheck },
    ],
    sampleTitle: 'Sample vault records',
    sampleLines: ['command · ldap service discovery', 'playbook · linux privilege review', 'procedure · incident evidence capture', 'note · kerberos troubleshooting chain'],
  },
  resources: {
    title: 'Resources',
    kicker: 'Guest preview // Control plane',
    description: 'Preview inventory and lifecycle control for labs, live sessions, invitations and saved infrastructure state.',
    icon: Boxes,
    capabilities: [
      { title: 'Inventory', detail: 'See owned environments and collaboration resources in one control plane.', icon: Boxes },
      { title: 'Lifecycle', detail: 'Start, stop and destroy real resources after authentication.', icon: Terminal },
      { title: 'Owner scoped', detail: 'Protected infrastructure never becomes anonymous guest state.', icon: ShieldCheck },
    ],
    sampleTitle: 'Sample inventory',
    sampleLines: ['lab-black-domain · stopped', 'workspace-alpha · 3 operators', 'board-domain-map · saved', 'vault-evidence-pack · private'],
  },
  account: {
    title: 'Operator profile',
    kicker: 'Guest preview // Identity and progress',
    description: 'See what an OXSIG account preserves: operator identity, progress, evidence, achievements and resumable work.',
    icon: ShieldCheck,
    capabilities: [
      { title: 'Persistent progress', detail: 'Resume learning and operations across devices and sessions.', icon: Check },
      { title: 'Evidence history', detail: 'Keep technical proof tied to your operator profile.', icon: FileCheck2 },
      { title: 'Owned resources', detail: 'Identity provides the security boundary for infrastructure and collaboration.', icon: ShieldCheck },
    ],
    sampleTitle: 'What an account unlocks',
    sampleLines: ['Resume active labs', 'Keep mission evidence', 'Join persistent team workspaces', 'Own and manage provisioned resources'],
  },
};

export default function GuestProductSurface({ surface }: { surface: GuestSurface }) {
  const config = SURFACES[surface];
  const Icon = config.icon;
  const returnTo = SURFACE_PATH[surface];
  const signInHref = authPathWithReturnTo('/sign-in', returnTo);
  const signUpHref = authPathWithReturnTo('/sign-up', returnTo);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 py-1" aria-label={`${config.title} guest preview`}>
      <div className="overflow-hidden rounded-2xl border bg-card/70">
        <div className="border-b bg-gradient-to-r from-cyan-500/[0.08] via-background to-violet-500/[0.06] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-background/70 text-primary"><Icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">{config.kicker}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{config.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{config.description}</p>
            </div>
            <span className="w-fit rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">GUEST PREVIEW</span>
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-3 sm:p-4">
          {config.capabilities.map((capability) => {
            const CapabilityIcon = capability.icon;
            return (
              <article key={capability.title} className="rounded-xl border bg-background/45 p-3">
                <CapabilityIcon className="h-4 w-4 text-primary" />
                <h2 className="mt-3 text-sm font-semibold">{capability.title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{capability.detail}</p>
              </article>
            );
          })}
        </div>
      </div>

      {config.showFlow ? <GuestSampleFlow /> : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border bg-slate-950 text-slate-200">
          <div className="flex min-h-9 items-center gap-2 border-b border-white/10 px-3 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
            <Terminal className="h-3.5 w-3.5 text-cyan-300" /> {config.sampleTitle}
            <span className="ml-auto text-emerald-300">read only</span>
          </div>
          <div className="space-y-2 p-4 font-mono text-[11px]">
            {config.sampleLines.map((line, index) => (
              <p key={line} className={index === config.sampleLines.length - 1 ? 'text-emerald-300' : 'text-slate-300'}>
                <span className="mr-2 text-slate-600">{String(index + 1).padStart(2, '0')}</span>{line}
              </p>
            ))}
          </div>
        </div>

        <aside className="flex flex-col rounded-xl border bg-card/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Browse first, identify later</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">You can inspect this product area without an account. Sign in only when you want to create, save, provision, collaborate persistently or perform protected actions.</p>
          <div className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Navigation stays available</span>
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> No protected API calls in guest preview</span>
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Real actions remain identity-gated</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link href="/operations">Browse missions</Link></Button>
            <Button asChild size="sm"><Link href={signUpHref}>Create account <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
          </div>
          <Link href={signInHref} className="mt-3 text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Already have an account? Log in</Link>
        </aside>
      </div>
    </section>
  );
}
