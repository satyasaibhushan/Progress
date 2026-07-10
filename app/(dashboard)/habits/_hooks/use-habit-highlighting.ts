"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { getHabit, HabitStatus } from "@/lib/api/habits";
import { Habit } from "@/types";
import { HABIT_STATUSES, getHabitStatus, HabitPageState } from "../_lib/habit-page-helpers";

interface UseHabitHighlightingProps {
  pathname: string;
  highlightHabitId: string | null;
  activeTab: HabitStatus;
  setActiveTab: (status: HabitStatus) => void;
  setSelectedHabit: (habit: Habit | null) => void;
  habitRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  habitPagesRef: MutableRefObject<Record<HabitStatus, HabitPageState>>;
  loadHabitPage: (status: HabitStatus, options?: { reset?: boolean; highlightId?: string }) => Promise<Habit[] | null>;
}

export function useHabitHighlighting({
  pathname,
  highlightHabitId,
  activeTab,
  setActiveTab,
  setSelectedHabit,
  habitRefs,
  habitPagesRef,
  loadHabitPage,
}: UseHabitHighlightingProps) {
  const processedHighlightRef = useRef<string | null>(null);
  const suppressAutoActiveTabRef = useRef(false);

  useEffect(() => {
    if (pathname !== "/habits") return;
    if (highlightHabitId) return;
    if (suppressAutoActiveTabRef.current) {
      suppressAutoActiveTabRef.current = false;
      return;
    }

    setActiveTab("active");
  }, [pathname, highlightHabitId, setActiveTab]);

  useEffect(() => {
    if (!highlightHabitId || processedHighlightRef.current === highlightHabitId) {
      if (!highlightHabitId) {
        processedHighlightRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    const ensureHighlightedHabitLoaded = async () => {
      const focusHighlightedHabit = (status: HabitStatus, habit: Habit) => {
        processedHighlightRef.current = highlightHabitId;
        const switchingTab = activeTab !== status;
        if (switchingTab) {
          setActiveTab(status);
        }

        const scrollToHabit = () => {
          if (cancelled) return false;
          const element = habitRefs.current[highlightHabitId];
          if (element && element.offsetParent !== null) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("bg-indigo-50");

            schedule(() => {
              if (cancelled) return;
              element.classList.remove("bg-indigo-50");
              const params = new URLSearchParams(window.location.search);
              if (params.has("highlight")) {
                suppressAutoActiveTabRef.current = true;
                params.delete("highlight");
                const nextUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
                window.history.replaceState({}, "", nextUrl);
              }
              processedHighlightRef.current = null;
            }, 2000);
            return true;
          }
          return false;
        };

        schedule(() => {
          if (cancelled) return;
          setSelectedHabit(habit);
          if (!scrollToHabit()) {
            schedule(() => {
              if (cancelled) return;
              if (!scrollToHabit()) {
                schedule(() => {
                  if (cancelled) return;
                  scrollToHabit();
                }, 500);
              }
            }, 500);
          }
        }, switchingTab ? 250 : 0);
      };

      for (const status of HABIT_STATUSES) {
        if (cancelled) return;

        if (!habitPagesRef.current[status].initialized) {
          await loadHabitPage(status, { reset: true, highlightId: highlightHabitId });
          if (cancelled) return;
        }

        let habit = habitPagesRef.current[status].items.find((h) => h.id === highlightHabitId);
        const seenPaginationStates = new Set<string>();
        let paginationAttempts = 0;
        while (!habit && habitPagesRef.current[status].hasMore) {
          const before = habitPagesRef.current[status];
          const pageStateKey = `${before.nextCursor ?? "null"}:${before.items.length}`;
          if (seenPaginationStates.has(pageStateKey) || paginationAttempts >= 50) {
            break;
          }
          seenPaginationStates.add(pageStateKey);
          paginationAttempts += 1;

          await loadHabitPage(status);
          if (cancelled) return;
          const after = habitPagesRef.current[status];
          habit = habitPagesRef.current[status].items.find((h) => h.id === highlightHabitId);

          if (!habit && after.items.length === before.items.length && after.nextCursor === before.nextCursor) {
            break;
          }
        }

        if (!habit) continue;

        focusHighlightedHabit(status, habit);
        return;
      }

      try {
        const fallbackHabit = await getHabit(highlightHabitId);
        if (cancelled) return;

        const fallbackStatus = getHabitStatus(fallbackHabit);
        if (!habitPagesRef.current[fallbackStatus].initialized) {
          await loadHabitPage(fallbackStatus, { reset: true, highlightId: highlightHabitId });
          if (cancelled) return;
        }

        let habit = habitPagesRef.current[fallbackStatus].items.find((h) => h.id === highlightHabitId);
        const seenPaginationStates = new Set<string>();
        let paginationAttempts = 0;

        while (!habit && habitPagesRef.current[fallbackStatus].hasMore) {
          const before = habitPagesRef.current[fallbackStatus];
          const pageStateKey = `${before.nextCursor ?? "null"}:${before.items.length}`;
          if (seenPaginationStates.has(pageStateKey) || paginationAttempts >= 50) {
            break;
          }
          seenPaginationStates.add(pageStateKey);
          paginationAttempts += 1;

          await loadHabitPage(fallbackStatus);
          if (cancelled) return;
          const after = habitPagesRef.current[fallbackStatus];
          habit = after.items.find((h) => h.id === highlightHabitId);

          if (!habit && after.items.length === before.items.length && after.nextCursor === before.nextCursor) {
            break;
          }
        }

        if (habit) {
          focusHighlightedHabit(fallbackStatus, habit);
          return;
        }

        if (activeTab !== fallbackStatus) {
          setActiveTab(fallbackStatus);
        }
        setSelectedHabit(fallbackHabit);
      } catch (error) {
        console.error("Error resolving highlighted habit:", error);
      }
    };

    void ensureHighlightedHabitLoaded();

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [highlightHabitId, activeTab, loadHabitPage, habitPagesRef, habitRefs, setActiveTab, setSelectedHabit]);
}
