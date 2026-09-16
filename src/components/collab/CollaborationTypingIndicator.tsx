'use client';

import * as React from 'react';

type TypingEventDetail = {
  collaborationId?: string;
  typingIds?: string[];
};

export default function CollaborationTypingIndicator() {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    const onTyping = (event: Event) => {
      const detail = (event as CustomEvent<TypingEventDetail>).detail;
      setCount(Array.isArray(detail?.typingIds) ? detail.typingIds.length : 0);
    };
    window.addEventListener('oxsig:collaboration:typing', onTyping);
    return () => window.removeEventListener('oxsig:collaboration:typing', onTyping);
  }, []);

  if (!count) return null;

  return (
    <div className="pointer-events-none absolute bottom-[6.75rem] left-1/2 z-20 -translate-x-1/2 sm:bottom-[6.25rem]" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
        </span>
        {count === 1 ? 'Someone is typing…' : `${count} people are typing…`}
      </div>
    </div>
  );
}
