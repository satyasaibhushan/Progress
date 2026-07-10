"use client";

import { useEffect } from "react";

interface TimezoneSyncProps {
  onReady?: () => void;
}

export function TimezoneSync({ onReady }: TimezoneSyncProps) {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) {
      onReady?.();
      return;
    }

    void fetch("/api/user/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    }).catch((error: unknown) => {
      console.error("Failed to synchronize timezone", error);
    }).finally(() => {
      onReady?.();
    });
  }, [onReady]);

  return null;
}
