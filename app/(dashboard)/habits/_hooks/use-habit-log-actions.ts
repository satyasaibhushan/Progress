"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { parseISO } from "date-fns";
import { deleteHabitLog, getHabitLogs, logHabit, updateHabitLogCount } from "@/lib/api/habits";
import { Habit, HabitLog } from "@/types";
import {
  getDateKey,
  getProgressFromCounts,
  getUtcDateKeyFromIso,
} from "../_lib/habit-page-helpers";

interface UseHabitLogActionsProps {
  selectedHabit: Habit | null;
  selectedHabitLogs: HabitLog[];
  setSelectedHabitLogs: Dispatch<SetStateAction<HabitLog[]>>;
  setSelectedHabit: Dispatch<SetStateAction<Habit | null>>;
  applyHabitPatchToLoadedPages: (habitId: string, patch: Partial<Habit>) => void;
}

export function useHabitLogActions({
  selectedHabit,
  selectedHabitLogs,
  setSelectedHabitLogs,
  setSelectedHabit,
  applyHabitPatchToLoadedPages,
}: UseHabitLogActionsProps) {
  const handleDateClick = useCallback(async (date: Date, decrease: boolean = false) => {
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
  }, [selectedHabit, selectedHabitLogs, setSelectedHabitLogs, setSelectedHabit, applyHabitPatchToLoadedPages]);

  return { handleDateClick };
}
