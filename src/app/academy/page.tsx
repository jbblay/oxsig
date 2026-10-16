import Link from 'next/link';
import { ArrowRight, CheckCircle2, GraduationCap, LifeBuoy, RadioTower, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const workspaces = [
  {
    href: '/academy/engineering-world',
    name: 'Engineering World',
    badge: 'Start here',
    summary: 'Step into connected technical incidents and build a track record of verified engineering decisions.',
    icon: Wrench,
    action: 'Enter Engineering World',
  },
  {
    href: '/academy/missions',
    name: 'Docker Mission Control',
    badge: 'Hands-on',
    summary: 'Deploy, troubleshoot, and persist a live container. Acceptance checks run against your authorized lab.',
    icon: TerminalSquare,
    action: 'Open Mission Control',
  },
  {
    href: '/academy/mentor-forge',
    name: 'Skills Passport & Mentor Forge',
    badge: 'Prove and teach',
    summary: 'Review verified mission evidence and demonstrate teaching skill when applying for mentorship.',
    icon: ShieldCheck,
    action: 'View Skills Passport',
  },
] as const;

export default function AcademyPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 py-5 sm:py-8">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-sky-500/10 p-5 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">OXSIG Academy · Mission control</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Learn by doing. Prove it in a real environment.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          Academy now starts with engineering challenges, live labs, and evidence-based verification.
          You work on systems and resolve incidents instead of advancing through static lessons.
          Unverified attempts never become completed missions.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild><Link href="/academy/engineering-world">Start engineering <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          <Button asChild variant="outline"><Link href="/academy/missions">Open Docker missions</Link></Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {workspaces.map(({ href, name, summary, badge, icon: Icon, action }) => (
          <Card key={href} className="flex h-full flex-col">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span>
              </div>
              <CardTitle className="text-lg">{name}</CardTitle>
              <CardDescription className="leading-6">{summary}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button variant="outline" className="w-full" asChild><Link href={href}>{action} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="h-4 w-4" /> Need a human mentor?</CardTitle>
            <CardDescription>Get help with a mission in a learner-controlled Rescue Room. Mentor access must be approved and can be revoked.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" asChild><Link href="/academy/mentors">Find a mentor</Link></Button>
            <Button variant="outline" asChild><Link href="/academy/sessions"><RadioTower className="mr-2 h-4 w-4" /> My sessions</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4" /> Your verified record</CardTitle>
            <CardDescription>See your Skills Passport and previously demonstrated capabilities. Earlier achievement evidence remains available.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" asChild><Link href="/academy/mentor-forge"><CheckCircle2 className="mr-2 h-4 w-4" /> Skills Passport</Link></Button>
            <Button variant="ghost" asChild><Link href="/academy/transcript">Past skill records</Link></Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
