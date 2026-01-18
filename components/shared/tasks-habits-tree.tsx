"use client";

import { Task, Group, Habit } from "@/types";
import { TaskTree } from "@/components/tasks/task-tree";
import { HabitCard } from "@/components/habits/habit-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHabitLogs } from "@/lib/api/habits";
import { useState, useEffect } from "react";

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

// Calculate habit progress from logs
function calculateHabitProgress(habit: Habit): number {
  if (habit.habitLogs && habit.habitLogs.length > 0) {
    const totalCount = habit.habitLogs.reduce((sum, log) => sum + log.count, 0);
    if (habit.targetCount === 0) return 0;
    return Math.min(100, Math.round((totalCount / habit.targetCount) * 100));
  }
  if (habit.currentCount !== undefined && habit.targetCount) {
    return Math.min(100, Math.round((habit.currentCount / habit.targetCount) * 100));
  }
  return 0;
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
  const [habitProgresses, setHabitProgresses] = useState<Record<string, number>>({});
  const [habitCounts, setHabitCounts] = useState<Record<string, number>>({});

  // Calculate habit progresses
  useEffect(() => {
    const progresses: Record<string, number> = {};
    const counts: Record<string, number> = {};
    
    for (const habit of habits) {
      if (habit.habitLogs && habit.habitLogs.length > 0) {
        const totalCount = habit.habitLogs.reduce((sum, log) => sum + log.count, 0);
        counts[habit.id] = totalCount;
        if (habit.targetCount === 0) {
          progresses[habit.id] = 0;
        } else {
          progresses[habit.id] = Math.min(100, Math.round((totalCount / habit.targetCount) * 100));
        }
      } else if (habit.currentCount !== undefined) {
        counts[habit.id] = habit.currentCount;
        if (habit.targetCount === 0) {
          progresses[habit.id] = 0;
        } else {
          progresses[habit.id] = Math.min(100, Math.round((habit.currentCount / habit.targetCount) * 100));
        }
      } else {
        progresses[habit.id] = 0;
        counts[habit.id] = 0;
      }
    }
    
    setHabitProgresses(progresses);
    setHabitCounts(counts);
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

  // Get all leaf tasks for counting
  const getAllLeafTasks = (taskList: Task[]): Task[] => {
    const leafTasks: Task[] = [];
    const traverse = (tasks: Task[]) => {
      tasks.forEach((task) => {
        if (task.children && task.children.length > 0) {
          traverse(task.children);
        } else {
          leafTasks.push(task);
        }
      });
    };
    traverse(taskList);
    return leafTasks;
  };

  const allLeafTasks = getAllLeafTasks(tasks);
  const totalTasks = allLeafTasks.length;
  const totalHabits = habits.length;

  // Separate habits that are linked to tasks vs standalone
  const linkedHabitIds = new Set<string>();
  tasks.forEach((task) => {
    if (task.habits) {
      task.habits.forEach((habit) => linkedHabitIds.add(habit.id));
    }
  });
  const standaloneHabits = habits.filter((h) => !linkedHabitIds.has(h.id));

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
