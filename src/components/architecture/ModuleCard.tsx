"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function ModuleCard({
  title,
  description,
  bullets,
}: {
  title: string;
  description?: string;
  bullets?: string[];
}) {
  return (
    <Card className="bg-card h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm md:text-base leading-tight">{title}</CardTitle>
        {description ? <CardDescription className="text-xs md:text-sm">{description}</CardDescription> : null}
      </CardHeader>
      {bullets && bullets.length ? (
        <CardContent className="pt-0">
          <ul className="list-disc ml-4 md:ml-5 space-y-1 text-xs md:text-sm">
            {bullets.map((b, i) => (
              <li key={i} className="leading-relaxed">{b}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}