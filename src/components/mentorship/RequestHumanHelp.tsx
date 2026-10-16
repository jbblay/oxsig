import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Entry point from a mission or lesson into the mentor directory, carrying only the topic text. */
export default function RequestHumanHelp({ topic }: { topic: string }) {
  const query = new URLSearchParams({ topic: topic.slice(0, 160), share: 'lesson' });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed p-3 text-xs text-muted-foreground">
      <LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">Still stuck after trying it and asking the AI instructor? Book a free session with a qualified mentor.</span>
      <Button size="sm" variant="outline" asChild><Link href={`/academy/mentors?${query.toString()}`}>Request human help</Link></Button>
    </div>
  );
}
