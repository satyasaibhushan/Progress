"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useHeaderAction } from "../../layout";
import { getHabit, getHabitLogs, HabitStatus } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getTasks } from "@/lib/api/tasks";
import { getLabels } from "@/lib/api/labels";
import { Habit, Group, Task, HabitLog, Label } from "@/types";
import { HabitCard } from "@/components/habits/habit-card";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Calendar as CalendarIcon } from "lucide-react";
import { useDayRollover } from "@/lib/use-day-rollover";
import { useHabitPages } from "../_hooks/use-habit-pages";
import { useHabitHighlighting } from "../_hooks/use-habit-highlighting";
import { useHabitLogActions } from "../_hooks/use-habit-log-actions";
import { useHabitCrud } from "../_hooks/use-habit-crud";
import { HabitListPanel } from "./habit-list-panel";
import { SelectedHabitPanel } from "./selected-habit-panel";
import { HabitDialogs } from "./habit-dialogs";
import {
  getHabitProgressValue,
  getProgressFromCounts,
  getStreakLabel,
  HABIT_STATUSES,
} from "../_lib/habit-page-helpers";

export function HabitsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setHeaderRightAction, setHeaderSubtitle } = useHeaderAction();
  const [activeTab, setActiveTab] = useState<HabitStatus>("active");
  const {
    habitPages,
    habitPagesRef,
    statusCounts,
    loadHabitPage,
    refreshInitializedHabitPages,
    applyHabitPatchToLoadedPages,
  } = useHabitPages(activeTab);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedHabitLogs, setSelectedHabitLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);
  const [creatingHabit, setCreatingHabit] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const dayKey = useDayRollover();
  const selectedHabitId = selectedHabit?.id;
  const habitRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const selectedHabitLogsRequestRef = useRef(0);
  const highlightHabitId = searchParams.get("highlight");
  const initialHighlightIdRef = useRef(highlightHabitId);
  const previousDayKeyRef = useRef(dayKey);
  const habits = useMemo(() => {
    return [
      ...habitPages.active.items,
      ...habitPages.future.items,
      ...habitPages.completed.items,
    ];
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

  useHabitHighlighting({
    pathname,
    highlightHabitId,
    activeTab,
    setActiveTab,
    setSelectedHabit,
    habitRefs,
    habitPagesRef,
    loadHabitPage,
  });

  const { handleDateClick } = useHabitLogActions({
    selectedHabit,
    selectedHabitLogs,
    setSelectedHabitLogs,
    setSelectedHabit,
    applyHabitPatchToLoadedPages,
  });

  const { saving, handleCreate, handleEdit, handleDelete } = useHabitCrud({
    editingHabit,
    deletingHabit,
    selectedHabit,
    setSelectedHabit,
    setSelectedHabitLogs,
    setCreatingHabit,
    setEditingHabit,
    setDeletingHabit,
    refreshInitializedHabitPages,
  });

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
        // Keep the detail header/progress canonical with the log list. The
        // selected item can come from a paginated list that was fetched just
        // before a concurrent log mutation, which otherwise leaves counts
        // (and the percentage) disagreeing with the calendar.
        const currentCount = logsData.reduce((sum, log) => sum + log.count, 0);
        const currentProgress = getProgressFromCounts(currentCount, selectedHabit?.targetCount ?? 0);
        setSelectedHabit((previous) => {
          if (!previous || previous.id !== habitId) return previous;
          return {
            ...previous,
            currentCount,
            progress: getProgressFromCounts(currentCount, previous.targetCount),
          };
        });
        applyHabitPatchToLoadedPages(habitId, {
          currentCount,
          progress: currentProgress,
        });
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
  }, [selectedHabitId, selectedHabit?.targetCount, applyHabitPatchToLoadedPages]);

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className="lg:col-span-1 flex flex-col min-w-0 overflow-hidden">
            <HabitListPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              statusCounts={statusCounts}
              habitPages={habitPages}
              renderHabitItem={renderHabitItem}
              loadHabitPage={(status) => loadHabitPage(status)}
            />
          </div>

          {selectedHabit && (
            <SelectedHabitPanel
              selectedHabit={selectedHabit}
              selectedHabitLogs={selectedHabitLogs}
              selectedHabitProgress={selectedHabitProgress}
              selectedHabitStreak={selectedHabitStreak}
              streakLabel={getStreakLabel(selectedHabit.streakPeriod || selectedHabit.type)}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              onDateClick={handleDateClick}
              onTaskClick={() => {
                if (selectedHabit.parentTaskId) {
                  router.push(`/tasks?highlight=${selectedHabit.parentTaskId}`);
                }
              }}
            />
          )}
        </div>
      )}
      <HabitDialogs
        creatingHabit={creatingHabit}
        setCreatingHabit={setCreatingHabit}
        editingHabit={editingHabit}
        setEditingHabit={setEditingHabit}
        deletingHabit={deletingHabit}
        setDeletingHabit={setDeletingHabit}
        groups={groups}
        labels={labels}
        tasks={tasks}
        saving={saving}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
