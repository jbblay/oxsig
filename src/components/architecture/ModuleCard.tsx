"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function ModuleCard({
  title,
  description,
  bullets,
  compact = false,
}: {
  title: string;
  description?: string;
  bullets?: string[];
  compact?: boolean;
}) {
  return (
    <Card className={`bg-card h-fit ${compact ? 'p-1.5' : 'p-2'} overflow-hidden`}>
      <CardHeader className={`${compact ? 'pb-1.5 px-2' : 'pb-2 px-3 md:px-4'}`}>
        <CardTitle className={`${compact ? 'text-xs' : 'text-sm md:text-base'} leading-tight break-words`}>
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className={`${compact ? 'text-[10px]' : 'text-xs md:text-sm'} text-muted-foreground leading-tight line-clamp-2`}>
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>

      {bullets && bullets.length ? (
        <CardContent className={`${compact ? 'pt-0 px-2' : 'pt-0 px-3 md:px-4'} overflow-hidden`}>
          <ul className={`list-disc ${compact ? 'ml-2.5' : 'ml-3 md:ml-4'} space-y-0.5 ${compact ? 'text-[10px]' : 'text-xs md:text-sm'}`}>
            {bullets.slice(0, compact ? 3 : bullets.length).map((b, i) => (
              <li key={i} className="leading-snug break-words overflow-hidden">{b}</li>
            ))}
            {compact && bullets.length > 3 && (
              <li className="text-muted-foreground italic">+{bullets.length - 3} more...</li>
            )}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}