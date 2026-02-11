"use client";

import { useEffect, useState, useRef, useMemo, useCallback, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useHeaderAction } from "../layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getHabit, getHabitLogs, logHabit, deleteHabitLog, updateHabitLogCount, getHabitPage, HabitStatus } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getTasks } from "@/lib/api/tasks";
import { getLabels } from "@/lib/api/labels";
import { createHabit, updateHabit, deleteHabit, CreateHabitInput, UpdateHabitInput } from "@/lib/api/habits";
import { Habit, Group, Task, HabitLog, Label } from "@/types";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitCalendar } from "@/components/habits/habit-calendar";
import { HabitForm } from "@/components/habits/habit-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ServerLazyList } from "@/components/shared/server-lazy-list";
import { Calendar as CalendarIcon, ListTodo } from "lucide-react";
import { parseISO } from "date-fns";
import { useDayRollover } from "@/lib/use-day-rollover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function getHabitProgressValue(habit: Habit): number {
  const progress = typeof habit.progress === "number" ? habit.progress : 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUtcDateKeyFromIso(isoDate: string): string {
  const parsed = parseISO(isoDate);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getProgressFromCounts(currentCount: number, targetCount: number): number {
  if (!targetCount) return 0;
  return Math.min(100, Math.max(0, Math.round((currentCount / targetCount) * 100)));
}

function getHabitStatus(habit: Habit): HabitStatus {
  const progress = getHabitProgressValue(habit);
  if (progress >= 100) return "completed";

  if (habit.startDate) {
    const startDate = parseISO(habit.startDate);
    if (Number.isNaN(startDate.getTime())) return "active";
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate > today) return "future";
  }

  return "active";
}

function getStreakLabel(period?: Habit["type"]): string {
  if (period === "WEEKLY") return "weeks";
  if (period === "MONTHLY") return "months";
  if (period === "YEARLY") return "years";
  return "days";
}

interface HabitPageState {
  items: Habit[];
  nextCursor: string | null;
  hasMore: boolean;
  initialized: boolean;
  loadingMore: boolean;
}

function createEmptyHabitPageState(): HabitPageState {
  return {
    items: [],
    nextCursor: null,
    hasMore: true,
    initialized: false,
    loadingMore: false,
  };
}

const HABITS_PAGE_SIZE = 10;
const HABIT_STATUSES: HabitStatus[] = ["active", "future", "completed"];

function mergeUniqueHabitsById(existing: Habit[], incoming: Habit[]): Habit[] {
  const merged: Habit[] = [];
  const seen = new Set<string>();

  for (const habit of [...existing, ...incoming]) {
    if (seen.has(habit.id)) continue;
    seen.add(habit.id);
    merged.push(habit);
  }

  return merged;
}

interface HabitFormPayload {
  title: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  targetCount?: number | null;
  countPerPeriod?: number;
  maxCountPerDay?: number;
  importance?: number;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  activeDays?: number[] | null;
  groupId?: string | null;
  parentTaskId?: string | null;
  labelIds?: string[];
}

function HabitsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setHeaderRightAction, setHeaderSubtitle } = useHeaderAction();
  const [habitPages, setHabitPages] = useState<Record<HabitStatus, HabitPageState>>({
    active: createEmptyHabitPageState(),
    future: createEmptyHabitPageState(),
    completed: createEmptyHabitPageState(),
  });
  const [statusCounts, setStatusCounts] = useState<Record<HabitStatus, number>>({
    active: 0,
    future: 0,
    completed: 0,
  });
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedHabitLogs, setSelectedHabitLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);
  const [creatingHabit, setCreatingHabit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<HabitStatus>("active");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const dayKey = useDayRollover();
  const selectedHabitId = selectedHabit?.id;
  const habitRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const habitPagesRef = useRef(habitPages);
  const selectedHabitLogsRequestRef = useRef(0);
  const highlightHabitId = searchParams.get("highlight");
  const initialHighlightIdRef = useRef(highlightHabitId);
  const processedHighlightRef = useRef<string | null>(null);
  const suppressAutoActiveTabRef = useRef(false);
  const previousDayKeyRef = useRef(dayKey);
  const habits = useMemo(() => {
    return [
      ...habitPages.active.items,
      ...habitPages.future.items,
      ...habitPages.completed.items,
    ];
  }, [habitPages]);

  // Set header action and subtitle on mount and when habits change
  useEffect(() => {
    habitPagesRef.current = habitPages;
  }, [habitPages]);

  useEffect(() => {
    setHeaderRightAction(
      <Button onClick={() => setCreatingHabit(true)}>
        <Plus className="w-4 h-4 mr-2" />
        New Habit
      </Button>
    );
    setHeaderSubtitle(habits.length > 0 ? `${habits.length} total` : null);
    return () => {
      setHeaderRightAction(null);
      setHeaderSubtitle(null);
    };
  }, [setHeaderRightAction, setHeaderSubtitle, habits.length]);

  const loadHabitPage = useCallback(async (status: HabitStatus, options?: { reset?: boolean; highlightId?: string }): Promise<Habit[] | null> => {
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
  }, []);

  const refreshInitializedHabitPages = useCallback(async (foregroundStatus?: HabitStatus) => {
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
      void Promise.all(
        backgroundStatuses.map((status) => loadHabitPage(status, { reset: true }))
      );
    }
  }, [activeTab, loadHabitPage]);

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

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch static page metadata first. Habit list pages load per-tab.
        const [groupsData, labelsData] = await Promise.all([
          getGroups(),
          getLabels(),
        ]);
        setGroups(groupsData);
        setLabels(labelsData);
        const highlightId = initialHighlightIdRef.current;
        if (!highlightId) {
          setActiveTab("active");
        }
        const activePageItems = await loadHabitPage("active", { reset: true });
        if (!highlightId) {
          setSelectedHabit(activePageItems && activePageItems.length > 0 ? activePageItems[0] : null);
        }
      } catch (error) {
        console.error("Error loading habits:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [loadHabitPage]);

  useEffect(() => {
    if (previousDayKeyRef.current === dayKey) return;
    previousDayKeyRef.current = dayKey;
    if (loading) return;

    void refreshInitializedHabitPages();

    if (!selectedHabitId) return;
    const currentHabitId = selectedHabitId;
    const requestId = ++selectedHabitLogsRequestRef.current;
    let cancelled = false;

    void Promise.all([
      getHabitLogs(currentHabitId),
      getHabit(currentHabitId),
    ])
      .then(([logsData, refreshedHabit]) => {
        if (cancelled || selectedHabitLogsRequestRef.current !== requestId) return;
        setSelectedHabitLogs(logsData);
        setSelectedHabit(refreshedHabit);
        applyHabitPatchToLoadedPages(refreshedHabit.id, {
          progress: refreshedHabit.progress,
          currentCount: refreshedHabit.currentCount,
          streak: refreshedHabit.streak,
          streakPeriod: refreshedHabit.streakPeriod,
          currentPeriodCount: refreshedHabit.currentPeriodCount,
          currentPeriodTarget: refreshedHabit.currentPeriodTarget,
          currentPeriodComplete: refreshedHabit.currentPeriodComplete,
          weeklyDistinctDays: refreshedHabit.weeklyDistinctDays,
        });
      })
      .catch((error) => {
        if (cancelled || selectedHabitLogsRequestRef.current !== requestId) return;
        console.error("Error refreshing habit data after day rollover:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [dayKey, loading, selectedHabitId, refreshInitializedHabitPages, applyHabitPatchToLoadedPages]);

  useEffect(() => {
    const page = habitPages[activeTab];
    if (!page.initialized && !page.loadingMore) {
      loadHabitPage(activeTab, { reset: true });
    }
  }, [activeTab, habitPages, loadHabitPage]);

  useEffect(() => {
    async function loadTasksForForm() {
      try {
        const tasksData = await getTasks({ includeChildren: true, parentId: null, includeHabits: false });
        setTasks(tasksData);
      } catch (error) {
        console.error("Error loading tasks for habit form:", error);
      }
    }

    const shouldLoadTasks = (creatingHabit || !!editingHabit) && tasks.length === 0;
    if (shouldLoadTasks) {
      loadTasksForForm();
    }
  }, [creatingHabit, editingHabit, tasks.length]);

  useEffect(() => {
    if (pathname !== "/habits") return;
    if (highlightHabitId) return;
    if (suppressAutoActiveTabRef.current) {
      suppressAutoActiveTabRef.current = false;
      return;
    }

    setActiveTab("active");
  }, [pathname, highlightHabitId]);

  useEffect(() => {
    if (!highlightHabitId || processedHighlightRef.current === highlightHabitId) {
      if (!highlightHabitId) {
        processedHighlightRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const ensureHighlightedHabitLoaded = async () => {
      const focusHighlightedHabit = (status: HabitStatus, habit: Habit) => {
        processedHighlightRef.current = highlightHabitId;
        const switchingTab = activeTab !== status;
        if (switchingTab) {
          setActiveTab(status);
        }

        const scrollToHabit = () => {
          const element = habitRefs.current[highlightHabitId];
          if (element && element.offsetParent !== null) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("bg-indigo-50");

            setTimeout(() => {
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

        setTimeout(() => {
          setSelectedHabit(habit);
          if (!scrollToHabit()) {
            setTimeout(() => {
              if (!scrollToHabit()) {
                setTimeout(() => {
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

    ensureHighlightedHabitLoaded();

    return () => {
      cancelled = true;
    };
  }, [highlightHabitId, activeTab, loadHabitPage]);

  useEffect(() => {
    const requestId = ++selectedHabitLogsRequestRef.current;

    if (!selectedHabitId) {
      setSelectedHabitLogs([]);
      return;
    }
    const habitId = selectedHabitId;

    // Clear previous habit logs immediately to avoid stale flash on habit switch.
    setSelectedHabitLogs([]);

    let cancelled = false;
    async function loadSelectedHabitLogs() {
      try {
        const logsData = await getHabitLogs(habitId);
        if (cancelled || selectedHabitLogsRequestRef.current !== requestId) return;
        setSelectedHabitLogs(logsData);
      } catch (error) {
        if (cancelled || selectedHabitLogsRequestRef.current !== requestId) return;
        console.error("Error loading selected habit logs:", error);
        setSelectedHabitLogs([]);
      }
    }

    loadSelectedHabitLogs();

    return () => {
      cancelled = true;
    };
  }, [selectedHabitId]);

  const handleDateClick = async (date: Date, decrease: boolean = false) => {
    if (!selectedHabit) return;

    const dateStr = getDateKey(date);
    const clickKey = `${selectedHabit.id}-${dateStr}`;
    const previousLogs = [...selectedHabitLogs];
    const previousHabit = selectedHabit;

    try {
      const existingLog = previousLogs.find((log) => {
        return getUtcDateKeyFromIso(log.date) === dateStr;
      });
      const maxCountPerDay = selectedHabit.maxCountPerDay || 1;

      let operation:
        | { kind: "create" }
        | { kind: "increment"; logId: string }
        | { kind: "update"; logId: string; count: number }
        | { kind: "delete"; logId: string; removedCount: number }
        | null = null;

      if (existingLog && existingLog.habitId === selectedHabit.id) {
        if (decrease) {
          const nextCount = existingLog.count - 1;
          if (nextCount <= 0) {
            operation = { kind: "delete", logId: existingLog.id, removedCount: existingLog.count };
          } else {
            operation = { kind: "update", logId: existingLog.id, count: nextCount };
          }
        } else if (maxCountPerDay > 1) {
          if (existingLog.count < maxCountPerDay) {
            operation = { kind: "increment", logId: existingLog.id };
          }
        } else {
          operation = { kind: "delete", logId: existingLog.id, removedCount: existingLog.count };
        }
      } else if (!decrease) {
        operation = { kind: "create" };
      }

      if (!operation) {
        return;
      }

      const baseCount = selectedHabit.currentCount ?? previousLogs.reduce((sum, log) => sum + log.count, 0);
      let deltaCount = 0;
      let optimisticLogs = previousLogs;

      if (operation.kind === "create") {
        deltaCount = 1;
        const optimisticLog: HabitLog = {
          id: `optimistic-${clickKey}`,
          habitId: selectedHabit.id,
          date: `${dateStr}T00:00:00.000Z`,
          count: 1,
        };
        optimisticLogs = [optimisticLog, ...previousLogs];
      } else if (operation.kind === "increment") {
        deltaCount = 1;
        optimisticLogs = previousLogs.map((log) => {
          if (log.id !== operation.logId) return log;
          return { ...log, count: log.count + 1 };
        });
      } else if (operation.kind === "update") {
        const currentLog = previousLogs.find((log) => log.id === operation.logId);
        const currentCount = currentLog?.count || 0;
        deltaCount = operation.count - currentCount;
        optimisticLogs = previousLogs.map((log) => {
          if (log.id !== operation.logId) return log;
          return { ...log, count: operation.count };
        });
      } else {
        deltaCount = -operation.removedCount;
        optimisticLogs = previousLogs.filter((log) => log.id !== operation.logId);
      }

      const nextCurrentCount = Math.max(0, baseCount + deltaCount);
      const nextProgress = getProgressFromCounts(nextCurrentCount, selectedHabit.targetCount);

      setSelectedHabitLogs(optimisticLogs);
      setSelectedHabit((prev) => {
        if (!prev || prev.id !== selectedHabit.id) return prev;
        return {
          ...prev,
          currentCount: nextCurrentCount,
          progress: nextProgress,
        };
      });
      applyHabitPatchToLoadedPages(selectedHabit.id, {
        currentCount: nextCurrentCount,
        progress: nextProgress,
      });

      let mutationResult: Awaited<ReturnType<typeof logHabit>> | null = null;

      if (operation.kind === "create" || operation.kind === "increment") {
        mutationResult = await logHabit(selectedHabit.id, {
          date: `${dateStr}T00:00:00.000Z`,
          count: 1,
        });
        setSelectedHabitLogs((prev) => {
          const filtered = prev.filter((log) => {
            return !(log.habitId === selectedHabit.id && getUtcDateKeyFromIso(log.date) === dateStr);
          });
          if (!mutationResult?.log) return filtered;
          return [mutationResult.log, ...filtered].sort((a, b) => {
            const dateA = parseISO(a.date).getTime();
            const dateB = parseISO(b.date).getTime();
            return dateB - dateA;
          });
        });
      } else if (operation.kind === "update") {
        mutationResult = await updateHabitLogCount(selectedHabit.id, operation.logId, operation.count);
      } else {
        mutationResult = await deleteHabitLog(selectedHabit.id, operation.logId);
      }

      if (mutationResult) {
        const serverPatch: Partial<Habit> = {};
        if (typeof mutationResult.currentCount === "number") {
          serverPatch.currentCount = mutationResult.currentCount;
        }
        if (typeof mutationResult.progress === "number") {
          serverPatch.progress = mutationResult.progress;
        }
        if (typeof mutationResult.streak === "number") {
          serverPatch.streak = mutationResult.streak;
        }
        if (mutationResult.streakPeriod) {
          serverPatch.streakPeriod = mutationResult.streakPeriod;
        }
        if (typeof mutationResult.currentPeriodCount === "number") {
          serverPatch.currentPeriodCount = mutationResult.currentPeriodCount;
        }
        if (typeof mutationResult.currentPeriodTarget === "number") {
          serverPatch.currentPeriodTarget = mutationResult.currentPeriodTarget;
        }
        if (typeof mutationResult.currentPeriodComplete === "boolean") {
          serverPatch.currentPeriodComplete = mutationResult.currentPeriodComplete;
        }
        if (typeof mutationResult.weeklyDistinctDays === "number") {
          serverPatch.weeklyDistinctDays = mutationResult.weeklyDistinctDays;
        }

        if (Object.keys(serverPatch).length > 0) {
          setSelectedHabit((prev) => {
            if (!prev || prev.id !== selectedHabit.id) return prev;
            return {
              ...prev,
              ...serverPatch,
            };
          });
          applyHabitPatchToLoadedPages(selectedHabit.id, serverPatch);
        }
      }

    } catch (error: unknown) {
      console.error("Error toggling habit log:", error);
      setSelectedHabitLogs(previousLogs);
      setSelectedHabit(previousHabit);

      if (previousHabit) {
        const rollbackCount = previousHabit.currentCount ?? previousLogs.reduce((sum, log) => sum + log.count, 0);
        const rollbackProgress = typeof previousHabit.progress === "number"
          ? previousHabit.progress
          : getProgressFromCounts(rollbackCount, previousHabit.targetCount);
        applyHabitPatchToLoadedPages(previousHabit.id, {
          currentCount: rollbackCount,
          progress: rollbackProgress,
          streak: previousHabit.streak,
          streakPeriod: previousHabit.streakPeriod,
          currentPeriodCount: previousHabit.currentPeriodCount,
          currentPeriodTarget: previousHabit.currentPeriodTarget,
          currentPeriodComplete: previousHabit.currentPeriodComplete,
          weeklyDistinctDays: previousHabit.weeklyDistinctDays,
        });
      }

      if (error instanceof Error && error.message.includes("Log not found")) {
        void getHabitLogs(selectedHabit.id)
          .then((updatedLogs) => setSelectedHabitLogs(updatedLogs))
          .catch((syncError) => console.error("Error syncing habit logs after failure:", syncError));
      }
    }
  };

  const handleCreate = async (data: HabitFormPayload) => {
    setSaving(true);
    try {
      if (data.targetCount == null || data.importance == null) {
        throw new Error("Missing required habit fields");
      }
      const createData: CreateHabitInput = {
        title: data.title,
        type: data.type,
        targetCount: data.targetCount,
        countPerPeriod: data.countPerPeriod,
        maxCountPerDay: data.maxCountPerDay,
        importance: data.importance,
        description: data.description,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
        activeDays: data.activeDays ?? undefined,
        groupId: data.groupId || undefined,
        parentTaskId: data.parentTaskId || undefined,
        labelIds: data.labelIds,
      };
      await createHabit(createData);
      await refreshInitializedHabitPages();
      setCreatingHabit(false);
    } catch (error) {
      console.error("Error creating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: HabitFormPayload) => {
    if (!editingHabit) return;
    setSaving(true);
    try {
      if (data.targetCount == null || data.importance == null) {
        throw new Error("Missing required habit fields");
      }
      const updateData: UpdateHabitInput = {
        id: editingHabit.id,
        title: data.title,
        type: data.type,
        targetCount: data.targetCount,
        countPerPeriod: data.countPerPeriod,
        maxCountPerDay: data.maxCountPerDay,
        importance: data.importance,
        description: data.description,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
        activeDays: data.activeDays ?? undefined,
        groupId: data.groupId || undefined,
        parentTaskId: data.parentTaskId || undefined,
        labelIds: data.labelIds,
      };
      await updateHabit(updateData);
      const updatedHabit = await getHabit(editingHabit.id);
      setSelectedHabit(updatedHabit);
      await refreshInitializedHabitPages();
      setEditingHabit(null);
    } catch (error) {
      console.error("Error updating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingHabit) return;
    try {
      await deleteHabit(deletingHabit.id);
      if (deletingHabit.id === selectedHabit?.id) {
        setSelectedHabit(null);
        setSelectedHabitLogs([]);
      }
      await refreshInitializedHabitPages();
      setDeletingHabit(null);
    } catch (error) {
      console.error("Error deleting habit:", error);
    }
  };

  const activeHabits = habitPages.active.items;
  const futureHabits = habitPages.future.items;
  const completedHabits = habitPages.completed.items;

  // Calculate progress and streak for selected habit
  const selectedHabitProgress = selectedHabit ? getHabitProgressValue(selectedHabit) : 0;
  const selectedHabitStreak = selectedHabit?.streak || 0;

  const renderHabitItem = (habit: Habit) => {
    const habitProgress = getHabitProgressValue(habit);
    const currentCount = habit.currentCount || 0;
    const streak = selectedHabit?.id === habit.id
      ? (selectedHabit.streak ?? habit.streak ?? 0)
      : (habit.streak ?? 0);
    const group = groups.find((g) => g.id === habit.groupId);
    const linkedTask = habit.parentTask;

    return (
      <div
        key={habit.id}
        ref={(el) => {
          if (el) {
            habitRefs.current[habit.id] = el;
          }
        }}
      >
        <HabitCard
          habit={habit}
          group={group}
          streak={streak}
          linkedTaskTitle={linkedTask?.title}
          isSelected={selectedHabit?.id === habit.id}
          onClick={() => setSelectedHabit(habit)}
          onTaskClick={() => {
            if (habit.parentTaskId) {
              router.push(`/tasks?highlight=${habit.parentTaskId}`);
            }
          }}
          onEdit={() => setEditingHabit(habit)}
          onDelete={() => setDeletingHabit(habit)}
          progress={habitProgress}
          currentCount={currentCount}
        />
      </div>
    );
  };

  const hasAnyInitializedHabitPage = HABIT_STATUSES.some((status) => habitPages[status].initialized);
  const anyHabitPageLoading = HABIT_STATUSES.some((status) => habitPages[status].loadingMore);
  const isInitialHabitDataPending =
    loading ||
    (!hasAnyInitializedHabitPage && (anyHabitPageLoading || !!highlightHabitId));

  if (isInitialHabitDataPending) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  const totalHabitsCount = statusCounts.active + statusCounts.future + statusCounts.completed;

  return (
    <div className="max-w-6xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Create Habit button will be in header via layout */}

      {totalHabitsCount === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="No habits yet"
          description="Start building good habits by creating your first one"
          action={{
            label: "Create Habit",
            onClick: () => setCreatingHabit(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Habits List - Left Column */}
          <div className="lg:col-span-1 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HabitStatus)} className="flex flex-col h-full">
              <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                <TabsTrigger value="active">
                  Active
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({statusCounts.active})
                  </span>
                </TabsTrigger>
                <TabsTrigger value="future">
                  Future
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({statusCounts.future})
                  </span>
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({statusCounts.completed})
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="flex-1 overflow-y-auto pr-2 space-y-3 mt-4">
                {!habitPages.active.initialized || (habitPages.active.loadingMore && activeHabits.length === 0) ? (
                  <LoadingSkeleton count={4} />
                ) : activeHabits.length > 0 ? (
                  <ServerLazyList
                    items={activeHabits}
                    hasMore={habitPages.active.hasMore}
                    loadingMore={habitPages.active.loadingMore}
                    onLoadMore={() => loadHabitPage("active")}
                    className="space-y-3"
                    render={(pagedHabits) => (
                      <>{pagedHabits.map(renderHabitItem)}</>
                    )}
                  />
                ) : (
                  <p className="text-center text-muted-foreground py-8">No active habits</p>
                )}
              </TabsContent>

              <TabsContent value="future" className="flex-1 overflow-y-auto pr-2 space-y-3 mt-4">
                {!habitPages.future.initialized || (habitPages.future.loadingMore && futureHabits.length === 0) ? (
                  <LoadingSkeleton count={4} />
                ) : futureHabits.length > 0 ? (
                  <ServerLazyList
                    items={futureHabits}
                    hasMore={habitPages.future.hasMore}
                    loadingMore={habitPages.future.loadingMore}
                    onLoadMore={() => loadHabitPage("future")}
                    className="space-y-3"
                    render={(pagedHabits) => (
                      <>{pagedHabits.map(renderHabitItem)}</>
                    )}
                  />
                ) : (
                  <p className="text-center text-muted-foreground py-8">No future habits</p>
                )}
              </TabsContent>

              <TabsContent value="completed" className="flex-1 overflow-y-auto pr-2 space-y-3 mt-4">
                {!habitPages.completed.initialized || (habitPages.completed.loadingMore && completedHabits.length === 0) ? (
                  <LoadingSkeleton count={4} />
                ) : completedHabits.length > 0 ? (
                  <ServerLazyList
                    items={completedHabits}
                    hasMore={habitPages.completed.hasMore}
                    loadingMore={habitPages.completed.loadingMore}
                    onLoadMore={() => loadHabitPage("completed")}
                    className="space-y-3"
                    render={(pagedHabits) => (
                      <>{pagedHabits.map(renderHabitItem)}</>
                    )}
                  />
                ) : (
                  <p className="text-center text-muted-foreground py-8">No completed habits</p>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Calendar View - Right Column */}
          {selectedHabit && (
            <div className="lg:col-span-1 flex flex-col h-full min-h-0">
              <Card className="flex flex-col h-full flex-1 min-h-0 !py-3 !gap-0">
                <CardHeader className="flex-shrink-0 !px-4 !pb-1 !pt-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{selectedHabit.title}</CardTitle>
                      {selectedHabit.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {selectedHabit.description}
                        </p>
                      )}
                                {selectedHabit.parentTaskId && selectedHabit.parentTask ? (
                                  <button
                                    onClick={() => router.push(`/tasks?highlight=${selectedHabit.parentTaskId}`)}
                                    className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 mt-0.5 transition-colors"
                                  >
                                    <ListTodo className="w-4 h-4" />
                                    <span>{selectedHabit.parentTask.title}</span>
                                  </button>
                                ) : null}
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      {selectedHabit.type === "DAILY" ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-muted-foreground">Max/day:</span>
                          <span className="text-sm font-medium">{selectedHabit.maxCountPerDay || 1}x</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-muted-foreground">Per {selectedHabit.type.toLowerCase()}:</span>
                          <span className="text-sm font-medium">{selectedHabit.countPerPeriod || 1}x</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Importance:</span>
                        <ImportanceIndicator
                          importance={selectedHabit.importance}
                          size="md"
                          showValue
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col min-h-0 space-y-2.5 !px-4 !pt-2 !pb-2">
                  {/* Progress Overview */}
                  <div className="bg-muted rounded-lg p-2.5 flex-shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground">Progress</span>
                      <span className="text-sm font-medium">{selectedHabitProgress}%</span>
                    </div>
                    <UnifiedProgressBar
                      value={selectedHabitProgress}
                      interactive={false}
                      showPercentageOnHover={false}
                    />
                              <div className="grid grid-cols-3 gap-2.5 text-sm">
                                <div>
                                  <p className="text-muted-foreground mb-0.5 text-xs">Current</p>
                                  <p className="text-base font-semibold">
                                    {selectedHabitLogs.reduce((sum, log) => sum + log.count, 0)}
                                  </p>
                                </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5 text-xs">Target</p>
                        <p className="text-base font-semibold">
                          {selectedHabit.targetCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5 text-xs">Streak</p>
                        <p className="text-base font-semibold">
                          {selectedHabitStreak} {getStreakLabel(selectedHabit.streakPeriod || selectedHabit.type)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Calendar - Fixed height, not scrollable, occupies remaining space */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <HabitCalendar
                      habit={selectedHabit}
                      logs={selectedHabitLogs}
                      onDateClick={handleDateClick}
                      currentMonth={currentMonth}
                      onMonthChange={setCurrentMonth}
                    />
                  </div>

                  {/* Labels - Removed to give more space to calendar */}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Create Habit Dialog */}
      <Dialog open={creatingHabit} onOpenChange={setCreatingHabit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Habit</DialogTitle>
          </DialogHeader>
          <HabitForm
            groups={groups}
            labels={labels}
            availableTasks={tasks}
            onSubmit={handleCreate}
            onCancel={() => setCreatingHabit(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Habit Dialog */}
      <Dialog open={!!editingHabit} onOpenChange={(open) => !open && setEditingHabit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Habit</DialogTitle>
          </DialogHeader>
          {editingHabit && (
            <HabitForm
              habit={editingHabit}
              groups={groups}
              labels={labels}
              availableTasks={tasks}
              onSubmit={handleEdit}
              onCancel={() => setEditingHabit(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingHabit} onOpenChange={(open) => !open && setDeletingHabit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the habit and all its logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function HabitsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton count={10} />}>
      <HabitsPageContent />
    </Suspense>
  );
}
