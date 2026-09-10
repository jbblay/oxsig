'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Box,
  Check,
  Cloud,
  Code2,
  Crosshair,
  FileCheck2,
  Headphones,
  LibraryBig,
  LockKeyhole,
  MessageCircle,
  Network,
  Pause,
  Play,
  RadioTower,
  Server,
  ShieldCheck,
  Sparkles,
  Swords,
  Terminal,
  UsersRound,
  Volume2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { operations } from '@/lib/operations/catalog';
import { PublicSiteFooter, PublicSiteHeader } from './PublicSiteChrome';
import styles from './guest-explore.module.css';

const briefingText = 'Operator, authentication services are failing across the domain. Users are reporting login failures. Identify the domain controller, determine the cause, restore the required service, and preserve evidence of every change.';

const previewCommands = [
  {
    command: 'nslookup -type=SRV _ldap._tcp.dc._msdcs.corp.local',
    result: 'Domain service discovery staged for the live environment.',
  },
  {
    command: 'nmap -sV 10.10.20.10 -p 53,88,389,445',
    result: 'Service enumeration staged for the live environment.',
  },
  {
    command: 'evidence capture --objective domain-discovery',
    result: 'Evidence workflow preview complete.',
  },
] as const;

const learningPaths = [
  {
    id: 'active-directory',
    title: 'Active Directory',
    subtitle: 'Windows identity, Kerberos, SMB and domain operations',
    state: 'Runtime ready',
    href: '/operations?operation=black-domain',
    icon: Network,
    accent: '#a78bfa',
  },
  {
    id: 'linux',
    title: 'Linux',
    subtitle: 'Shells, privilege boundaries, services and host operations',
    state: 'Mission ready',
    href: '/operations?operation=ghost-shell',
    icon: Terminal,
    accent: '#4ade80',
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    subtitle: 'Web, pivoting, forensics and evidence-driven investigation',
    state: 'Mission ready',
    href: '/operations',
    icon: ShieldCheck,
    accent: '#fb7185',
  },
  {
    id: 'cloud',
    title: 'Cloud',
    subtitle: 'AWS trust, workloads and contained misconfiguration scenarios',
    state: 'Mission ready',
    href: '/operations?operation=cloudfall',
    icon: Cloud,
    accent: '#60a5fa',
  },
  {
    id: 'devops',
    title: 'DevOps',
    subtitle: 'Pipelines, containers, deployment and service recovery',
    state: 'Next environment',
    href: '#platform',
    icon: Workflow,
    accent: '#22d3ee',
  },
] as const;

const platformLoop = [
  { label: 'Launch', note: 'Real isolated environment', icon: Cloud },
  { label: 'Operate', note: 'Terminal or desktop', icon: Terminal },
  { label: 'Assist', note: 'Contextual AI + authorized actions', icon: Bot },
  { label: 'Collaborate', note: 'Humans in the same operation', icon: UsersRound },
  { label: 'Prove', note: 'Evidence-backed completion', icon: FileCheck2 },
  { label: 'Retain', note: 'Profile, notes and Vault', icon: LibraryBig },
] as const;

function nodeIcon(platform?: string, kind?: string) {
  const value = `${platform || ''} ${kind || ''}`.toLowerCase();
  if (value.includes('windows')) return <Server className="h-4 w-4" />;
  if (value.includes('operator')) return <Terminal className="h-4 w-4" />;
  return <Box className="h-4 w-4" />;
}

export default function GuestExploreExperience() {
  const mission = operations.find((operation) => operation.slug === 'black-domain') ?? operations[0];
  const [voiceState, setVoiceState] = React.useState<'idle' | 'playing' | 'unavailable'>('idle');
  const [previewStep, setPreviewStep] = React.useState(0);

  React.useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  function toggleBriefing() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceState('unavailable');
      return;
    }

    if (voiceState === 'playing') {
      window.speechSynthesis.cancel();
      setVoiceState('idle');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(briefingText);
    utterance.rate = 0.92;
    utterance.pitch = 0.92;
    utterance.onend = () => setVoiceState('idle');
    utterance.onerror = () => setVoiceState('unavailable');
    setVoiceState('playing');
    window.speechSynthesis.speak(utterance);
  }

  function advancePreview() {
    setPreviewStep((current) => current >= previewCommands.length - 1 ? 0 : current + 1);
  }

  return (
    <main className={styles.page}>
      <PublicSiteHeader />

      <section className={styles.hero} id="start">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><RadioTower className="h-3.5 w-3.5" /> Guest access // no account required</div>
          <h1>Touch the platform <span>before you create an account.</span></h1>
          <p>
            Browse real mission dossiers, inspect technical environments, hear an operator briefing and try the OXSIG interface. Create an account only when you want live infrastructure, persistence or protected actions.
          </p>
          <div className={styles.heroActions}>
            <Button asChild size="lg" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href="#live-environments">Explore a live mission <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] hover:text-white">
              <Link href="/operations">Browse mission catalog</Link>
            </Button>
          </div>
          <div className={styles.heroProof}>
            <span><Check /> Browse before signup</span>
            <span><ShieldCheck /> Protected actions stay protected</span>
            <span><Cloud /> Live infrastructure after account creation</span>
          </div>
        </div>

        <div className={styles.heroSystem} aria-label="OXSIG product loop">
          <div className={styles.systemHeader}>
            <span className={styles.signal} /> OXSIG // PRODUCT LOOP
            <span>GUEST CHANNEL OPEN</span>
          </div>
          <div className={styles.loopGrid}>
            {platformLoop.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={styles.loopItem}>
                  <span className={styles.loopIndex}>0{index + 1}</span>
                  <Icon className="h-4 w-4" />
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.section} id="learn">
        <div className={styles.sectionHead}>
          <div>
            <p>Learn by operating</p>
            <h2>Choose the system, not a thousand-course catalog.</h2>
          </div>
          <span>Start with focused environments. Expand the library as the platform grows.</span>
        </div>
        <div className={styles.pathGrid}>
          {learningPaths.map((path) => {
            const Icon = path.icon;
            return (
              <Link id={path.id} key={path.title} href={path.href} className={styles.pathCard} style={{ '--path-accent': path.accent } as React.CSSProperties}>
                <div className={styles.pathTop}>
                  <span className={styles.pathIcon}><Icon className="h-5 w-5" /></span>
                  <span className={styles.pathState}>{path.state}</span>
                </div>
                <h3>{path.title}</h3>
                <p>{path.subtitle}</p>
                <span className={styles.pathAction}>{path.state === 'Next environment' ? 'See platform model' : 'Open mission'} <ArrowRight className="h-3.5 w-3.5" /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.section} id="live-environments">
        <div className={styles.sectionHead}>
          <div>
            <p>What can you launch today?</p>
            <h2>{mission.codename}</h2>
          </div>
          <span>Active Directory is the current automated operation. Other catalog missions remain clearly marked until their runtimes are connected.</span>
        </div>

        <div className={styles.missionShell} id="active-directory">
          <div className={styles.missionMain}>
            <div className={styles.missionStatusBar}>
              <span><span className={styles.livePulse} /> RUNTIME READY</span>
              <span>{mission.difficulty}</span>
              <span>{mission.estimatedMinutes} MIN</span>
              <span>{mission.players} OPERATORS</span>
            </div>

            <div className={styles.missionTitleRow}>
              <div>
                <p>Active Directory // incident operation</p>
                <h3>{mission.name}</h3>
              </div>
              <div className={styles.voiceControl}>
                <Button type="button" size="sm" variant="outline" onClick={toggleBriefing} className="border-violet-400/20 bg-violet-400/[0.06] text-violet-100 hover:bg-violet-400/[0.12] hover:text-white">
                  {voiceState === 'playing' ? <Pause className="mr-2 h-3.5 w-3.5" /> : <Volume2 className="mr-2 h-3.5 w-3.5" />}
                  {voiceState === 'playing' ? 'Pause briefing' : 'Play operator briefing'}
                </Button>
                {voiceState === 'unavailable' ? <small>Voice playback is not available in this browser.</small> : null}
              </div>
            </div>

            <div className={styles.briefing}>
              <div className={styles.briefingIcon}><Headphones className="h-4 w-4" /></div>
              <div>
                <span>MISSION TRANSMISSION</span>
                <p>“{briefingText}”</p>
              </div>
            </div>

            <div className={styles.topology}>
              <div className={styles.panelLabel}>Environment topology</div>
              <div className={styles.topologyNodes}>
                {mission.topologyNodes.map((node, index) => (
                  <React.Fragment key={node.label}>
                    <div className={styles.topologyNode}>
                      <span>{nodeIcon(node.platform, node.kind)}</span>
                      <strong>{node.label}</strong>
                      <small>{node.platform || node.kind}</small>
                    </div>
                    {index < mission.topologyNodes.length - 1 ? <div className={styles.linkLine}><span /></div> : null}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className={styles.previewGrid}>
              <div className={styles.terminalPreview}>
                <div className={styles.previewHeader}>
                  <span><Terminal className="h-3.5 w-3.5" /> INTERFACE PREVIEW</span>
                  <span>NO CLOUD RESOURCES CREATED</span>
                </div>
                <div className={styles.terminalBody}>
                  <p><span>operator@oxsig:~$</span> {previewCommands[previewStep].command}</p>
                  <p className={styles.previewResult}>✓ {previewCommands[previewStep].result}</p>
                  <p className={styles.previewDim}>Live commands execute only after an authenticated environment is provisioned.</p>
                </div>
                <div className={styles.previewFooter}>
                  <div>
                    {previewCommands.map((_, index) => <span key={index} className={index === previewStep ? styles.previewDotActive : styles.previewDot} />)}
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-cyan-200 hover:bg-cyan-400/[0.08] hover:text-cyan-100" onClick={advancePreview}>
                    Next preview <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className={styles.teamPreview} id="collaboration">
                <div className={styles.previewHeader}>
                  <span><Swords className="h-3.5 w-3.5" /> TEAM OPERATION</span>
                  <span>WARROOM</span>
                </div>
                <div className={styles.stationGrid}>
                  <div><span>P1</span><strong>Terminal</strong><small>Lead operator</small></div>
                  <div><span>P2</span><strong>Windows desktop</strong><small>Domain analysis</small></div>
                  <div><span>AI</span><strong>Context ready</strong><small>Ask · explain · authorize</small></div>
                  <div><span>EV</span><strong>0 / {mission.evidence.length}</strong><small>Evidence objectives</small></div>
                </div>
                <div className={styles.chatPreview}>
                  <MessageCircle className="h-3.5 w-3.5" />
                  <div><strong>P2:</strong> I have the domain controller. Check DNS before we change anything.</div>
                </div>
              </div>
            </div>

            <div className={styles.launchBand}>
              <div>
                <strong>Ready for the real controls?</strong>
                <p>The preview stops here. Account creation unlocks the actual isolated runtime and persistence.</p>
              </div>
              <div className={styles.launchActions}>
                <Button asChild variant="outline" className="border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] hover:text-white">
                  <Link href={`/operations?operation=${mission.slug}`}>Read full dossier</Link>
                </Button>
                <Button asChild className="bg-violet-400 text-slate-950 hover:bg-violet-300">
                  <Link href="/sign-up">Create account to provision <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
          </div>

          <aside className={styles.missionRail}>
            <section>
              <div className={styles.panelLabel}><Crosshair className="h-3.5 w-3.5" /> Mission objectives</div>
              <ol>
                {mission.objectives.slice(0, 4).map((objective, index) => <li key={objective}><span>0{index + 1}</span>{objective}</li>)}
              </ol>
            </section>
            <section id="ai">
              <div className={styles.panelLabel}><Sparkles className="h-3.5 w-3.5" /> AI Operator</div>
              <p>Ask why a command failed, request an explanation, or authorize a supported action inside the live environment.</p>
              <div className={styles.aiPrompt}><Bot className="h-4 w-4" /><span>“Investigate why domain authentication is failing.”</span></div>
            </section>
            <section id="proof">
              <div className={styles.panelLabel}><FileCheck2 className="h-3.5 w-3.5" /> Proof, not completion clicks</div>
              <p>Objectives finish with technical artifacts: recon output, compromised identity, privilege proof and final domain evidence.</p>
            </section>
          </aside>
        </div>
      </section>

      <section className={styles.section} id="platform">
        <div className={styles.sectionHead}>
          <div>
            <p>Platform</p>
            <h2>The mission is the story. The environment is real.</h2>
          </div>
          <span>OXSIG adds narrative, guidance and collaboration around actual technical infrastructure instead of disguising a scripted animation as a lab.</span>
        </div>
        <div className={styles.platformGrid}>
          <article><Cloud /><h3>Real runtime</h3><p>Provisioned infrastructure with explicit lifecycle and containment boundaries.</p></article>
          <article><Code2 /><h3>Actual controls</h3><p>Terminal and desktop surfaces are where the learner performs the work.</p></article>
          <article><Bot /><h3>AI in context</h3><p>AI can explain the environment and use supported actions only when the operator authorizes them.</p></article>
          <article><UsersRound /><h3>Human collaboration</h3><p>Move from solo practice into shared operations, roles, presence and conversation.</p></article>
          <article><FileCheck2 /><h3>Evidence</h3><p>Keep proof of what happened instead of reducing technical competence to a completion badge.</p></article>
          <article><LibraryBig /><h3>Persistence</h3><p>Accounts preserve progress, evidence, operator identity and reusable knowledge.</p></article>
        </div>
      </section>

      <section className={styles.accessSection} id="access">
        <div className={styles.accessIntro}>
          <p>Access model</p>
          <h2>Experience first. Identity when it becomes useful.</h2>
          <span>Guests should never discover OXSIG by hitting an “Unauthorized” wall.</span>
        </div>
        <div className={styles.accessCards}>
          <article>
            <div className={styles.accessTitle}><Play className="h-4 w-4" /><strong>Guest</strong><span>No account</span></div>
            <ul>
              <li><Check /> Browse learning paths and mission dossiers</li>
              <li><Check /> Inspect environment topology</li>
              <li><Check /> Hear the operator briefing</li>
              <li><Check /> Try interface and workflow previews</li>
            </ul>
            <Button asChild variant="outline" className="mt-auto border-cyan-400/20 bg-cyan-400/[0.05] text-cyan-100 hover:bg-cyan-400/[0.1] hover:text-white"><Link href="/operations">Continue as guest</Link></Button>
          </article>
          <article className={styles.accountCard}>
            <div className={styles.accessTitle}><LockKeyhole className="h-4 w-4" /><strong>Operator account</strong><span>Persistence + protected actions</span></div>
            <ul>
              <li><Check /> Provision real isolated environments</li>
              <li><Check /> Resume progress and keep evidence</li>
              <li><Check /> Join persistent team operations</li>
              <li><Check /> Use supported AI actions with authorization</li>
            </ul>
            <Button asChild className="mt-auto bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link href="/sign-up">Create free account <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </article>
        </div>
      </section>

      <section className={styles.trustSection} id="trust">
        <div><ShieldCheck className="h-5 w-5" /><strong>Clear boundaries</strong><span>Guest previews do not silently provision cloud resources. Protected operations remain authenticated.</span></div>
        <div><Network className="h-5 w-5" /><strong>Contained environments</strong><span>Security missions belong inside explicit lab boundaries, with infrastructure truth shown to the operator.</span></div>
        <div><FileCheck2 className="h-5 w-5" /><strong>Evidence-aware design</strong><span>The platform records learning through technical outcomes, not invented marketing proof.</span></div>
      </section>

      <section className={styles.finalCta} id="company">
        <div>
          <p>OXSIG // technical operations learning platform</p>
          <h2>Launch it. Operate it. Prove you did it.</h2>
          <span>Start by exploring. Create an account when you want OXSIG to remember you.</span>
        </div>
        <div>
          <Button asChild variant="outline" size="lg" className="border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] hover:text-white"><Link href="/operations">Browse missions</Link></Button>
          <Button asChild size="lg" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link href="/sign-up">Create account <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </section>

      <div id="resources" />
      <PublicSiteFooter />
    </main>
  );
}
