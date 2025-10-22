"use client";

import * as React from "react";

export default function PWARegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // console.log("Service worker registered");
      } catch (e) {
        // console.warn("Service worker registration failed", e);
      }
    };
    register();
  }, []);

  return null;
}