"use client";

import { Task, Group, Habit } from "@/types";
import { TaskTree } from "@/components/tasks/task-tree";
import { HabitCard } from "@/components/habits/habit-card";
import { useMemo, useState } from "react";
import { getAllLeafTasks, getHabitProgress } from "@/lib/item-metrics";

interface TasksHabitsTreeProps {
  tasks: Task[];
  habits: Habit[];
  groups: Group[];
  onTaskClick?: (taskId: string) => void;
  onHabitClick?: (habitId: string) => void;
  highlightedTaskId?: string | null;
  highlightedHabitId?: string | null;
  showCounts?: boolean;
}

export function TasksHabitsTree({
  tasks,
  habits,
  groups,
  onTaskClick,
  onHabitClick,
  highlightedTaskId,
  highlightedHabitId,
  showCounts = true,
}: TasksHabitsTreeProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const { habitProgresses, habitCounts } = useMemo(() => {
    const progresses: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const habit of habits) {
      if (Array.isArray(habit.habitLogs)) {
        const totalCount = habit.habitLogs.reduce((sum, log) => sum + log.count, 0);
        counts[habit.id] = totalCount;
        progresses[habit.id] = getHabitProgress(habit);
      } else if (habit.currentCount !== undefined) {
        counts[habit.id] = habit.currentCount;
        progresses[habit.id] = getHabitProgress(habit);
      } else {
        progresses[habit.id] = getHabitProgress(habit);
        counts[habit.id] = 0;
      }
    }

    return {
      habitProgresses: progresses,
      habitCounts: counts,
    };
  }, [habits]);

  const handleToggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const allLeafTasks = useMemo(() => getAllLeafTasks(tasks), [tasks]);
  const totalTasks = allLeafTasks.length;
  const totalHabits = habits.length;

  const standaloneHabits = useMemo(() => {
    const linkedHabitIds = new Set<string>();
    const collectLinkedHabits = (taskList: Task[]) => taskList.forEach((task) => {
      if (task.habits) {
        task.habits.forEach((habit) => linkedHabitIds.add(habit.id));
      }
      if (task.children?.length) {
        collectLinkedHabits(task.children);
      }
    });
    collectLinkedHabits(tasks);
    return habits.filter((habit) => !linkedHabitIds.has(habit.id));
  }, [tasks, habits]);

  return (
    <div className="space-y-6">
      {showCounts && (totalTasks > 0 || totalHabits > 0) && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {totalTasks} {totalTasks === 1 ? "task" : "tasks"}
          </span>
          <span>
            {totalHabits} {totalHabits === 1 ? "habit" : "habits"}
          </span>
        </div>
      )}

      {/* Tasks Tree */}
      {tasks.length > 0 && (
        <div>
          <TaskTree
            tasks={tasks}
            groups={groups}
            habits={habits}
            expandedTasks={expandedTasks}
            onToggleExpand={handleToggleExpand}
            onHabitClick={onHabitClick}
            onTaskClick={onTaskClick}
            highlightedHabitId={highlightedHabitId}
            highlightedTaskId={highlightedTaskId}
          />
        </div>
      )}

      {/* Standalone Habits - show them even when there are tasks, as they might be directly attached to label/group */}
      {standaloneHabits.length > 0 && (
        <div className={tasks.length > 0 ? "mt-4 space-y-2" : ""}>
          {standaloneHabits.map((habit) => {
            const progress = habitProgresses[habit.id] ?? 0;
            const currentCount = habitCounts[habit.id] ?? 0;
            const group = groups.find((g) => g.id === habit.groupId);
            
            return (
              <HabitCard
                key={habit.id}
                habit={habit}
                group={group}
                progress={progress}
                currentCount={currentCount}
                onClick={() => onHabitClick?.(habit.id)}
              />
            );
          })}
        </div>
      )}

      {tasks.length === 0 && habits.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No tasks or habits found</p>
        </div>
      )}
    </div>
  );
}
