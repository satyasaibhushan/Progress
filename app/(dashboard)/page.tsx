"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Flame, TrendingUp } from "lucide-react";
import { getTasks } from "@/lib/api/tasks";
import { getHabits } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { Task, Habit, Group, Label } from "@/types";
import { OverviewStats } from "@/components/analytics/overview-stats";
import { ProgressChart } from "@/components/analytics/progress-chart";
import { GroupBreakdown } from "@/components/analytics/group-breakdown";
import { LabelStats } from "@/components/analytics/label-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { subDays, subMonths, subQuarters, subYears, format } from "date-fns";

type TimePeriod = "week" | "month" | "quarter" | "year";

// Helper to get all leaf tasks
function getAllLeafTasks(tasks: Task[]): Task[] {
  const leafTasks: Task[] = [];
  const traverse = (taskList: Task[]) => {
    taskList.forEach((task) => {
      if (task.children && task.children.length > 0) {
        traverse(task.children);
      } else {
        leafTasks.push(task);
      }
    });
  };
  traverse(tasks);
  return leafTasks;
}

export default function DashboardPage() {
  const router = useRouter();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("week");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
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
        if (labelsData.length > 0) {
          setSelectedLabel(labelsData[0]);
        }
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Calculate date range
  const getDateRange = () => {
    const today = new Date();
    let startDate: Date;
    switch (timePeriod) {
      case "week":
        startDate = subDays(today, 7);
        break;
      case "month":
        startDate = subMonths(today, 1);
        break;
      case "quarter":
        startDate = subQuarters(today, 1);
        break;
      case "year":
        startDate = subYears(today, 1);
        break;
    }
    return { startDate, endDate: today };
  };

  const { startDate, endDate } = getDateRange();

  // Filter tasks by date range
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!task.createdAt) return false;
      const createdDate = new Date(task.createdAt);
      return createdDate >= startDate && createdDate <= endDate;
    });
  }, [tasks, startDate, endDate]);

  const allLeafTasks = useMemo(() => getAllLeafTasks(tasks), [tasks]);
  const filteredLeafTasks = useMemo(
    () => getAllLeafTasks(filteredTasks),
    [filteredTasks]
  );

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
  const tasksThisWeek = allLeafTasks.filter((task) => {
    if (!task.deadline) return false;
    const deadline = new Date(task.deadline);
    return deadline <= weekEnd;
  }).length;

  // Habits stats
  const activeHabits = habits.length;
  const habitsOnTrack = habits.filter((h) => {
    if (!h.currentCount || !h.targetCount) return false;
    const progress = (h.currentCount / h.targetCount) * 100;
    return progress >= 50;
  }).length;
  const habitCompletionRate =
    activeHabits > 0 ? Math.round((habitsOnTrack / activeHabits) * 100) : 0;

  // Generate trend data
  const generateTrendData = () => {
    const points = timePeriod === "week" ? 7 : timePeriod === "month" ? 30 : 12;
    const data = [];
    for (let i = 0; i < points; i++) {
      let label = "";
      if (timePeriod === "week") {
        label = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i % 7];
      } else if (timePeriod === "month") {
        label = `Day ${i + 1}`;
      } else {
        label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12];
      }
      data.push({
        name: label,
        tasks: Math.min(100, 45 + i * 5 + Math.random() * 10),
        habits: Math.min(100, 40 + i * 4 + Math.random() * 15),
      });
    }
    return data;
  };

  const trendData = generateTrendData();

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
        avgProgress: avg,
        taskCount: groupTasks.length,
      };
    });
  }, [groups, allLeafTasks]);

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
        const parentTask = tasks.find((task) => task.id === currentTask.parentId);
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
        let currentTask = tasks.find((t) => t.id === h.parentTaskId);
        while (currentTask) {
          if (currentTask.labels?.some((l) => l.id === selectedLabel.id)) return true;
          if (!currentTask.parentId) break;
          currentTask = tasks.find((t) => t.id === currentTask.parentId);
        }
      }
      return false;
    });

    const totalItems = tasksWithLabel.length + habitsWithLabel.length;
    const completedItems = tasksWithLabel.filter((t) => t.progress === 100).length;
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
            habitsWithLabel.reduce(
              (acc, h) =>
                acc + ((h.currentCount || 0) / (h.targetCount || 1)) * 100,
              0
            ) / habitsWithLabel.length
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
  }, [selectedLabel, allLeafTasks, habits]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4 mb-6">

        <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <OverviewStats
        completionRate={completionRate}
        completedTasks={completedTasks}
        totalTasks={totalTasks}
        avgProgress={avgProgress}
        tasksThisWeek={tasksThisWeek}
        habitCompletionRate={habitCompletionRate}
        habitsOnTrack={habitsOnTrack}
        activeHabits={activeHabits}
      />

      {/* Progress Trend Chart */}
      <ProgressChart data={trendData} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GroupBreakdown groups={groupProgress} limit={5} showViewMore={true} />
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
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {habits.slice(0, 3).map((habit) => {
              const progress = habit.currentCount && habit.targetCount
                ? Math.round((habit.currentCount / habit.targetCount) * 100)
                : 0;
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
          </div>
          {habits.length > 3 && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => router.push("/habits")}
              >
                View More ({habits.length - 3} more)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
