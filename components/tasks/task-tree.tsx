"use client";

import { Task, Group, Habit, HabitLog } from "@/types";
import { TaskCard } from "./task-card";
import { ChevronRight, ChevronDown, Flame, Calendar, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { cn } from "@/lib/utils";
import { parseISO, isSameDay } from "date-fns";
import { useRouter } from "next/navigation";

interface TaskTreeProps {
  tasks: Task[];
  groups: Group[];
  habits: Habit[];
  level?: number;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onProgressUpdate?: (taskId: string, progress: number) => void;
  expandedTasks?: Set<string>;
  onToggleExpand?: (taskId: string) => void;
  taskRefs?: { [key: string]: HTMLDivElement | null } | { [key: string]: (el: HTMLDivElement | null) => void };
  onHabitClick?: (habitId: string) => void;
}

function hasChildren(task: Task): boolean {
  return task.children ? task.children.length > 0 : false;
}

function hasHabits(task: Task): boolean {
  return task.habits ? task.habits.length > 0 : false;
}

// Calculate streak for a habit
function calculateStreak(logs: HabitLog[]): number {
  if (logs.length === 0) return 0;
  
  // Sort logs by date descending
  const sortedLogs = [...logs].sort((a, b) => {
    const dateA = parseISO(a.date);
    const dateB = parseISO(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  // Check if today is logged
  const todayLogged = sortedLogs.some(log => {
    const logDate = parseISO(log.date);
    logDate.setHours(0, 0, 0, 0);
    return isSameDay(logDate, currentDate);
  });

  if (!todayLogged) {
    // If today is not logged, start from yesterday
    currentDate.setDate(currentDate.getDate() - 1);
  }

  // Count consecutive days
  for (const log of sortedLogs) {
    const logDate = parseISO(log.date);
    logDate.setHours(0, 0, 0, 0);
    
    if (isSameDay(logDate, currentDate)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (logDate < currentDate) {
      // Gap found, break streak
      break;
    }
  }

  return streak;
}

// Calculate progress for a task (handles parent tasks)
function calculateTaskProgress(task: Task & { total_weight?: string; weighted_progress?: string }): number {
  // Check if task has children or habits
  const hasChildren = task.children && task.children.length > 0;
  const hasHabits = task.habits && task.habits.length > 0;
  
  if (!hasChildren && !hasHabits) {
    // Leaf task - use stored progress (already 0-100)
    const progress = task.progress || 0;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }
  
  // Parent task - calculate from aggregates
  // weighted_progress = Σ(progress × importance) where progress is 0-100
  // total_weight = Σ(importance)
  // So progress = weighted_progress / total_weight gives us 0-100
  if (task.total_weight && task.weighted_progress) {
    const totalWeight = Number(task.total_weight);
    const weightedProgress = Number(task.weighted_progress);
    if (totalWeight > 0 && totalWeight !== 0) {
      const progress = weightedProgress / totalWeight;
      // Cap at 100% and ensure it's between 0-100
      return Math.min(100, Math.max(0, Math.round(progress)));
    }
  }
  
  return 0;
}

export function TaskTree({
  tasks,
  groups,
  habits,
  level = 0,
  onEdit,
  onDelete,
  onProgressUpdate,
  expandedTasks = new Set(),
  onToggleExpand,
  taskRefs,
  onHabitClick,
}: TaskTreeProps) {
  const router = useRouter();
  
  const handleToggleExpand = (taskId: string) => {
    if (onToggleExpand) {
      onToggleExpand(taskId);
    }
  };

  const renderTask = (task: Task, currentLevel: number = 0) => {
    const taskHasChildren = hasChildren(task);
    const taskHasHabits = hasHabits(task);
    const isExpanded = expandedTasks.has(task.id);
    const group = groups.find((g) => g.id === task.groupId);
    // Get habits linked to this task
    // Prisma relation should already filter by parentTaskId, but we'll use all habits from the relation
    const linkedHabits = task.habits || [];
    const calculatedProgress = calculateTaskProgress(task as Task & { total_weight?: string; weighted_progress?: string });
    const isLeaf = !taskHasChildren && !taskHasHabits;
    
    // Expand if task has habits and is expanded
    const showHabits = taskHasHabits && isExpanded;

    return (
      <div key={task.id} className="space-y-2">
        <div className="flex items-center gap-2">
          {(taskHasChildren || taskHasHabits) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleToggleExpand(task.id)}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
          {!taskHasChildren && !taskHasHabits && <div className="w-6" />}
          <div 
            className="flex-1"
            ref={taskRefs ? (el) => {
              if (typeof taskRefs[task.id] === 'function') {
                (taskRefs[task.id] as (el: HTMLDivElement | null) => void)(el);
              } else {
                (taskRefs as { [key: string]: HTMLDivElement | null })[task.id] = el;
              }
            } : undefined}
          >
            <TaskCard
              task={task}
              group={group}
              linkedHabits={linkedHabits}
              level={currentLevel}
              hasChildren={taskHasChildren}
              calculatedProgress={calculatedProgress}
              isLeaf={isLeaf}
              onEdit={() => onEdit?.(task)}
              onDelete={() => onDelete?.(task)}
              onProgressUpdate={isLeaf ? (progress) => onProgressUpdate?.(task.id, progress) : undefined}
              onHabitClick={onHabitClick}
            />
          </div>
        </div>

        {/* Children */}
        {taskHasChildren && isExpanded && task.children && (
          <div className="ml-6 space-y-2">
            {task.children.map((child) => renderTask(child, currentLevel + 1))}
          </div>
        )}

        {/* Habits as child items */}
        {showHabits && linkedHabits && linkedHabits.length > 0 && (
          <div className="ml-6 space-y-2">
            {linkedHabits.map((habit) => {
              // Find the full habit data with logs from the habits prop
              const fullHabit = habits.find((h) => h.id === habit.id) || habit;
              
              // Get group from habit or groups array
              const habitGroup = (fullHabit as any).group || groups.find((g) => g.id === fullHabit.groupId);
              
              // Calculate habit progress from logs if available, otherwise use currentCount
              let habitProgress = 0;
              let currentCount = 0;
              
              if (fullHabit.habitLogs && fullHabit.habitLogs.length > 0) {
                currentCount = fullHabit.habitLogs.reduce((sum, log) => sum + log.count, 0);
                if (fullHabit.targetCount > 0) {
                  habitProgress = Math.min(100, Math.round((currentCount / fullHabit.targetCount) * 100));
                }
              } else if (fullHabit.currentCount !== undefined && fullHabit.targetCount) {
                currentCount = fullHabit.currentCount;
                habitProgress = Math.min(100, Math.round((currentCount / fullHabit.targetCount) * 100));
              }
              
              // Calculate streak from logs
              const streak = fullHabit.habitLogs ? calculateStreak(fullHabit.habitLogs) : 0;
              
              return (
                <div key={habit.id} className="flex items-center gap-2">
                  <div className="w-6 flex-shrink-0" />
                  <div className="flex-1">
                    <Card
                      className={cn(
                        "p-3 hover:border-indigo-300 transition-all cursor-pointer",
                        "bg-indigo-50/50 border-indigo-200"
                      )}
                      style={{ marginLeft: `${(currentLevel + 1) * 24}px` }}
                      onClick={() => onHabitClick?.(habit.id)}
                    >
                    <div className="flex items-start gap-3">
                      <div className="w-6 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-indigo-900">{habit.title}</h4>
                            <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-700 bg-indigo-100">
                              Habit
                            </Badge>
                            {habit.countPerPeriod && habit.countPerPeriod > 1 && (
                              <Badge variant="secondary" className="text-xs">
                                {habit.countPerPeriod}x
                              </Badge>
                            )}
                          </div>
                          {habit.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {habit.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Meta Info */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <ImportanceIndicator importance={habit.importance} size="sm" />
                          <span>{habit.importance}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {habit.type}
                        </Badge>
                        {habitGroup && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/groups/${habitGroup.id}`);
                            }}
                            className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                          >
                            <Folder className="w-3 h-3" />
                            <span>{habitGroup.name}</span>
                          </button>
                        )}
                        {streak > 0 && (
                          <div className="flex items-center gap-1 text-orange-500">
                            <Flame className="w-3 h-3" />
                            <span>{streak}</span>
                          </div>
                        )}
                        {currentCount !== undefined && habit.targetCount && (
                          <span className="text-xs">
                            {currentCount} / {habit.targetCount}
                          </span>
                        )}
                      </div>

                      {/* Labels */}
                      {fullHabit.labels && fullHabit.labels.length > 0 && (
                        <div className="flex gap-1 mb-2 flex-wrap">
                          {fullHabit.labels.map((label) => (
                            <Badge
                              key={label.id}
                              variant="secondary"
                              className="text-xs"
                              style={{
                                backgroundColor: `${label.color}20`,
                                color: label.color,
                              }}
                            >
                              {label.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Progress Bar */}
                      <div className="flex items-center gap-3">
                        <Progress 
                          value={habitProgress} 
                          className="flex-1 h-2"
                          style={{
                            ["--progress-background" as string]: "#6366f1", // indigo-500
                          }}
                        />
                        <span className="text-sm text-muted-foreground w-12 text-right">
                          {habitProgress}%
                        </span>
                      </div>
                    </div>
                  </div>
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {tasks.map((task) => renderTask(task, level))}
    </div>
  );
}
