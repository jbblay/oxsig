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
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {bullets && bullets.length ? (
        <CardContent>
          <ul className="list-disc ml-5 space-y-1 text-sm">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}