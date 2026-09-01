import Link from 'next/link';
import { ArrowRight, FileUp, FolderLock, Presentation, Share2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  { title: 'Store a document', description: 'Upload and manage the source file in Secure Storage.', href: '/storage', action: 'Open storage', icon: FolderLock },
  { title: 'Share with a room', description: 'Use an authorized collaboration room to work with specific people.', href: '/collab', action: 'Open collaboration', icon: Users },
  { title: 'Explain it visually', description: 'Record a synchronized Secure Canvas explanation for authorized viewers.', href: '/collab/storyboards', action: 'Open storyboards', icon: Presentation },
];

export default function ShareDocsPage() {
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Share2 className="h-7 w-7 text-indigo-500" /><h1 className="text-2xl font-bold md:text-3xl">ShareDocs</h1></div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Securely store a document, choose who may access it, and optionally attach the explanation behind it.</p>
        </div>
        <Badge variant="outline" className="w-fit">Backend permissions required</Badge>
      </div>

      <Card className="border-indigo-500/30 bg-indigo-500/5">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Start with the protected source file</p><p className="mt-1 text-sm text-muted-foreground">Files remain in Secure Storage; ShareDocs coordinates storage, collaboration, and explanation instead of duplicating them.</p></div>
          <Button asChild className="shrink-0"><Link href="/storage"><FileUp className="mr-2 h-4 w-4" />Upload a file</Link></Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <Card key={step.href}>
            <CardHeader><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><step.icon className="h-5 w-5 text-primary" /></div><CardTitle className="text-lg">{index + 1}. {step.title}</CardTitle><CardDescription>{step.description}</CardDescription></CardHeader>
            <CardContent><Button asChild variant="outline" className="w-full"><Link href={step.href}>{step.action}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
          </Card>
        ))}
      </div>

      <Card><CardHeader><CardTitle>Real protection, not decoration</CardTitle><CardDescription>ShareDocs replaces the old signing simulation.</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">ShareDocs follows the actual OXSIG direction: secure storage, backend-controlled access, collaboration, revocation, auditing, and Secure Canvas explanations. It does not claim that a decorative signature or simulated blockchain action protects a file.</CardContent></Card>
    </div>
  );
}
