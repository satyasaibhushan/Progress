"use client";

import { useEffect, useState } from "react";

function getLocalDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useDayRollover(): string {
  const [dayKey, setDayKey] = useState<string>(() => getLocalDayKey());

  useEffect(() => {
    let midnightTimeout: ReturnType<typeof setTimeout> | null = null;

    const updateDayKey = () => {
      const nextDayKey = getLocalDayKey();
      setDayKey((prev) => (prev === nextDayKey ? prev : nextDayKey));
    };

    const scheduleNextMidnightTick = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 1, 0);
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());

      midnightTimeout = setTimeout(() => {
        updateDayKey();
        scheduleNextMidnightTick();
      }, delay);
    };

    const visibilityHandler = () => {
      if (!document.hidden) {
        updateDayKey();
      }
    };

    const focusHandler = () => {
      updateDayKey();
    };

    scheduleNextMidnightTick();
    const heartbeatInterval = window.setInterval(updateDayKey, 60_000);
    document.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("focus", focusHandler);

    return () => {
      if (midnightTimeout) {
        clearTimeout(midnightTimeout);
      }
      window.clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("focus", focusHandler);
    };
  }, []);

  return dayKey;
}
