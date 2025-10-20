"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import AnimatedBackground from "@/components/app/AnimatedBackground";

/**
 * Controls when the animated background should render.
 * Hides the background on heavy/interactive pages to improve performance.
 */
export default function BackgroundController() {
  const pathname = usePathname() || "";

  // Pages where we want to disable the animated background for performance
  const disabledPaths = ["/architecture", "/sign"];

  const shouldHide = disabledPaths.some((p) => pathname.startsWith(p));

  if (shouldHide) return null;

  return <AnimatedBackground />;
}
