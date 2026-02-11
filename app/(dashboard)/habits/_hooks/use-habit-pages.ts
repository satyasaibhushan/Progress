"use client";

import { useCallback, useRef, useState } from "react";
import { getHabitPage, HabitStatus } from "@/lib/api/habits";
import { Habit } from "@/types";
import {
  createEmptyHabitPageState,
  HABITS_PAGE_SIZE,
  HABIT_STATUSES,
  HabitPageState,
  mergeUniqueHabitsById,
} from "../_lib/habit-page-helpers";

export function useHabitPages(activeTab: HabitStatus) {
  const [habitPages, setHabitPages] = useState<Record<HabitStatus, HabitPageState>>({
    active: createEmptyHabitPageState(),
    future: createEmptyHabitPageState(),
    completed: createEmptyHabitPageState(),
  });
  const habitPagesRef = useRef(habitPages);
  const [statusCounts, setStatusCounts] = useState<Record<HabitStatus, number>>({
    active: 0,
    future: 0,
    completed: 0,
  });

  const loadHabitPage = useCallback(
    async (status: HabitStatus, options?: { reset?: boolean; highlightId?: string }): Promise<Habit[] | null> => {
      const reset = options?.reset ?? false;
      const page = habitPagesRef.current[status];
      if (page.loadingMore) return null;
      if (!reset && !page.hasMore) return null;

      setHabitPages((prev) => {
        const next = {
          ...prev,
          [status]: {
            ...prev[status],
            loadingMore: true,
          },
        };
        habitPagesRef.current = next;
        return next;
      });

      try {
        const result = await getHabitPage({
          status,
          limit: HABITS_PAGE_SIZE,
          cursor: reset ? null : page.nextCursor,
          highlightId: options?.highlightId,
        });
        setHabitPages((prev) => {
          const mergedItems = reset
            ? mergeUniqueHabitsById([], result.items)
            : mergeUniqueHabitsById(prev[status].items, result.items);
          const next = {
            ...prev,
            [status]: {
              items: mergedItems,
              nextCursor: result.nextCursor,
              hasMore: result.hasMore,
              initialized: true,
              loadingMore: false,
            },
          };
          habitPagesRef.current = next;
          return next;
        });
        setStatusCounts(result.statusCounts);
        return result.items;
      } catch (error) {
        console.error(`Error loading ${status} habits:`, error);
        setHabitPages((prev) => {
          const next = {
            ...prev,
            [status]: {
              ...prev[status],
              loadingMore: false,
            },
          };
          habitPagesRef.current = next;
          return next;
        });
        return null;
      }
    },
    []
  );

  const refreshInitializedHabitPages = useCallback(
    async (foregroundStatus?: HabitStatus) => {
      const targetStatus = foregroundStatus || activeTab;
      const initializedStatuses = HABIT_STATUSES.filter((status) => habitPagesRef.current[status].initialized);
      if (initializedStatuses.length === 0) {
        await loadHabitPage(targetStatus, { reset: true });
        return;
      }

      const foreground = initializedStatuses.includes(targetStatus)
        ? targetStatus
        : initializedStatuses[0];

      await loadHabitPage(foreground, { reset: true });

      const backgroundStatuses = initializedStatuses.filter((status) => status !== foreground);
      if (backgroundStatuses.length > 0) {
        void Promise.all(backgroundStatuses.map((status) => loadHabitPage(status, { reset: true })));
      }
    },
    [activeTab, loadHabitPage]
  );

  const applyHabitPatchToLoadedPages = useCallback((habitId: string, patch: Partial<Habit>) => {
    setHabitPages((prev) => {
      const next = {
        active: {
          ...prev.active,
          items: prev.active.items.map((habit) => {
            if (habit.id !== habitId) return habit;
            return { ...habit, ...patch };
          }),
        },
        future: {
          ...prev.future,
          items: prev.future.items.map((habit) => {
            if (habit.id !== habitId) return habit;
            return { ...habit, ...patch };
          }),
        },
        completed: {
          ...prev.completed,
          items: prev.completed.items.map((habit) => {
            if (habit.id !== habitId) return habit;
            return { ...habit, ...patch };
          }),
        },
      };
      habitPagesRef.current = next;
      return next;
    });
  }, []);

  return {
    habitPages,
    setHabitPages,
    habitPagesRef,
    statusCounts,
    loadHabitPage,
    refreshInitializedHabitPages,
    applyHabitPatchToLoadedPages,
  };
}
