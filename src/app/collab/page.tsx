import Link from 'next/link';
import { BookOpen, Box, HardDrive, Users } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  { href: '/collab/storyboards', title: 'Explain and record', description: 'Create a board with drawing events and synchronized voice.', icon: BookOpen },
  { href: '/storage', title: 'Attach resources', description: 'Keep the files and materials used by the lesson.', icon: HardDrive },
  { href: '/labs', title: 'Practice immediately', description: 'Open the temporary cloud environment for hands-on work.', icon: Box },
];

export default function CollaborationPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2"><div className="flex items-center gap-2"><Users className="h-7 w-7" /><h1 className="text-3xl font-semibold">Collaboration</h1></div><p className="max-w-2xl text-muted-foreground">The current collaboration flow connects explanation, resources, and practice. Live multi-user editing and calls will be added only when their production runtime is ready.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href}><Card className="h-full hover:bg-muted/40"><CardHeader><Icon className="h-6 w-6" /><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader></Card></Link>)}
      </div>
    </div>
  );
}
