"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getTasks } from "@/lib/api/tasks";
import { getHabits } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { Task, Habit, Group, Label } from "@/types";
import { OverviewStats } from "@/components/analytics/overview-stats";
import { GroupBreakdown } from "@/components/analytics/group-breakdown";
import { LabelStats } from "@/components/analytics/label-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { LazyList } from "@/components/shared/lazy-list";
import { ScrollHint } from "@/components/shared/scroll-hint";
import { parseISO } from "date-fns";
import { useHeaderAction } from "./layout";
import { isPending } from "@/lib/date-helpers";
import { useDayRollover } from "@/lib/use-day-rollover";
import { getAllLeafTasks, getHabitProgress } from "@/lib/item-metrics";

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((task) => [task, ...flattenTasks(task.children || [])]);
}

export default function DashboardPage() {
  const router = useRouter();
  const { setHeaderRightAction } = useHeaderAction();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [loading, setLoading] = useState(true);
  const DASHBOARD_HABITS_PAGE_SIZE = 6;
  const dayKey = useDayRollover();
  const previousDayKeyRef = useRef(dayKey);

  const loadDashboardData = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [tasksData, habitsData, groupsData, labelsData] = await Promise.all([
        getTasks({ includeChildren: true }),
        getHabits({ includeLogs: true }),
        getGroups(),
        getLabels(),
      ]);
      setTasks(tasksData);
      setHabits(habitsData);
      setGroups(groupsData);
      setLabels(labelsData);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setHeaderRightAction(null);
  }, [setHeaderRightAction]);

  useEffect(() => {
    void loadDashboardData(true);
  }, [loadDashboardData]);

  useEffect(() => {
    if (previousDayKeyRef.current === dayKey) return;
    previousDayKeyRef.current = dayKey;
    void loadDashboardData(false);
  }, [dayKey, loadDashboardData]);

  const allLeafTasks = useMemo(() => getAllLeafTasks(tasks), [tasks]);
  const allTasks = useMemo(() => flattenTasks(tasks), [tasks]);

  // Calculate stats
  const totalTasks = allLeafTasks.length;
  const completedTasks = allLeafTasks.filter((t) => t.progress === 100).length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const avgProgress =
    totalTasks > 0
      ? Math.round(
          allLeafTasks.reduce((acc, t) => acc + t.progress, 0) / totalTasks
        )
      : 0;

  // Tasks due this week
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tasksThisWeek = allLeafTasks.filter((task) => {
    if (!task.deadline || task.progress >= 100) return false;
    const deadline = parseISO(task.deadline);
    if (Number.isNaN(deadline.getTime())) return false;
    return deadline >= today && deadline <= weekEnd;
  }).length;
  const overdueTasks = allLeafTasks.filter((task) => {
    if (!task.deadline || task.progress >= 100) return false;
    const deadline = parseISO(task.deadline);
    return !Number.isNaN(deadline.getTime()) && deadline < today;
  }).length;

  // Habits stats
  const activeHabitItems = habits.filter((habit) => (
    !isPending(habit.startDate) && getHabitProgress(habit) < 100
  ));
  const activeHabits = activeHabitItems.length;
  const habitsOnTrack = activeHabitItems.filter((habit) => habit.currentPeriodComplete).length;
  const habitCompletionRate =
    activeHabits > 0 ? Math.round((habitsOnTrack / activeHabits) * 100) : 0;

  useEffect(() => {
    if (!selectedLabel && labels.length > 0) {
      setSelectedLabel(labels[0]);
    }
  }, [selectedLabel, labels]);

  // Group progress
  const groupProgress = useMemo(() => {
    return groups.map((group) => {
      const groupTasks = allLeafTasks.filter((t) => t.groupId === group.id);
      const avg = groupTasks.length > 0
        ? Math.round(
            groupTasks.reduce((acc, t) => acc + t.progress, 0) / groupTasks.length
          )
        : 0;
      return {
        group,
        avgProgress: typeof group.progress === "number" ? group.progress : avg,
        taskCount: group.taskCount ?? groupTasks.length,
      };
    });
  }, [groups, allLeafTasks]);

  const activeHabitsOverview = useMemo(() => {
    return habits
      .map((habit) => ({
        habit,
        progress: getHabitProgress(habit),
      }))
      .filter(({ habit, progress }) => !isPending(habit.startDate) && progress < 100);
  }, [habits]);

  // Label statistics
  const labelStats = useMemo(() => {
    if (!selectedLabel) {
      return {
        totalItems: 0,
        tasksCount: 0,
        habitsCount: 0,
        completedItems: 0,
        avgTaskProgress: 0,
        avgHabitProgress: 0,
      };
    }

    // Filter tasks with label (including inherited labels)
    const tasksWithLabel = allLeafTasks.filter((t) => {
      // Check if task has label directly
      if (t.labels?.some((l) => l.id === selectedLabel.id)) return true;
      // Check if any ancestor has the label (inheritance)
      let currentTask = t;
      while (currentTask.parentId) {
        const parentTask = allTasks.find((task) => task.id === currentTask.parentId);
        if (!parentTask) break;
        if (parentTask.labels?.some((l) => l.id === selectedLabel.id)) return true;
        currentTask = parentTask;
      }
      return false;
    });
    
    // Filter habits with label (including inherited from parent tasks)
    const habitsWithLabel = habits.filter((h) => {
      // Check if habit has label directly
      if (h.labels?.some((l) => l.id === selectedLabel.id)) return true;
      // Check if parent task (or ancestor) has the label
      if (h.parentTaskId) {
        let currentTask: Task | undefined = allTasks.find((t) => t.id === h.parentTaskId);
        while (currentTask) {
          if (currentTask.labels?.some((l) => l.id === selectedLabel.id)) return true;
          if (!currentTask.parentId) break;
          const parentId = currentTask.parentId;
          currentTask = parentId ? allTasks.find((t) => t.id === parentId) : undefined;
        }
      }
      return false;
    });

    const totalItems = tasksWithLabel.length + habitsWithLabel.length;
    const completedItems =
      tasksWithLabel.filter((t) => t.progress >= 100).length +
      habitsWithLabel.filter((habit) => getHabitProgress(habit) >= 100).length;
    const avgTaskProgress =
      tasksWithLabel.length > 0
        ? Math.round(
            tasksWithLabel.reduce((acc, t) => acc + t.progress, 0) /
              tasksWithLabel.length
          )
        : 0;
    const avgHabitProgress =
      habitsWithLabel.length > 0
        ? Math.round(
            habitsWithLabel.reduce((acc, habit) => acc + getHabitProgress(habit), 0) /
              habitsWithLabel.length
          )
        : 0;

    return {
      totalItems,
      tasksCount: tasksWithLabel.length,
      habitsCount: habitsWithLabel.length,
      completedItems,
      avgTaskProgress,
      avgHabitProgress,
    };
  }, [selectedLabel, allLeafTasks, habits, allTasks]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Stats */}
      <OverviewStats
        completionRate={completionRate}
        completedTasks={completedTasks}
        totalTasks={totalTasks}
        avgProgress={avgProgress}
        tasksThisWeek={tasksThisWeek}
        overdueTasks={overdueTasks}
        habitCompletionRate={habitCompletionRate}
        habitsOnTrack={habitsOnTrack}
        activeHabits={activeHabits}
      />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GroupBreakdown groups={groupProgress} limit={5} />
        {selectedLabel && (
          <LabelStats
            labels={labels}
            selectedLabel={selectedLabel}
            onLabelChange={setSelectedLabel}
            stats={labelStats}
          />
        )}
      </div>

      {/* Active Habits Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Active Habits Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ScrollHint
            className="max-h-[360px] pr-2"
            wrapperClassName="relative"
            watch={activeHabitsOverview.length}
          >
            <LazyList
              items={activeHabitsOverview}
              pageSize={DASHBOARD_HABITS_PAGE_SIZE}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              sentinelClassName="col-span-full"
              render={(visibleHabits) => (
                <>
                  {visibleHabits.map(({ habit, progress }) => {
                    const group = groups.find((g) => g.id === habit.groupId);

                    return (
                      <button
                        key={habit.id}
                        onClick={() => router.push(`/habits?highlight=${habit.id}`)}
                        className="text-left p-4 border rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="text-sm font-medium mb-1">{habit.title}</h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                              <span className="px-2 py-0.5 bg-muted rounded">{habit.type}</span>
                              {group && <span>{group.name}</span>}
                            </div>
                          </div>
                          <span className="text-sm text-muted-foreground">{progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                          <div
                            className="bg-green-600 rounded-full h-1.5 transition-all"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {habit.currentCount || 0} / {habit.targetCount}
                          </span>
                          <div className="flex items-center gap-1">
                            <ImportanceIndicator importance={habit.importance} size="sm" />
                            <span>{habit.importance}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            />
          </ScrollHint>
        </CardContent>
      </Card>
    </div>
  );
}
