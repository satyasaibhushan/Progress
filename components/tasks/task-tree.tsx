"use client";

import { Task, Group, Habit } from "@/types";
import { TaskCard } from "./task-card";
import { ChevronRight, ChevronDown, Flame, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TaskTreeProps {
  tasks: Task[];
  groups: Group[];
  habits?: Habit[];
  level?: number;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onProgressUpdate?: (taskId: string, progress: number) => void;
  expandedTasks?: Set<string>;
  onToggleExpand?: (taskId: string) => void;
  taskRefs?: { [key: string]: HTMLDivElement | null } | { [key: string]: (el: HTMLDivElement | null) => void };
  onHabitClick?: (habitId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onAddTask?: (parentTask: Task) => void;
  onAddHabit?: (parentTask: Task) => void;
  highlightedHabitId?: string | null;
  highlightedTaskId?: string | null;
  isTaskCompleted?: (task: Task) => boolean;
}

function hasChildren(task: Task): boolean {
  return task.children ? task.children.length > 0 : false;
}

function hasHabits(task: Task): boolean {
  return task.habits ? task.habits.length > 0 : false;
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
  habits = [],
  level = 0,
  onEdit,
  onDelete,
  onProgressUpdate,
  expandedTasks = new Set(),
  onToggleExpand,
  taskRefs,
  onHabitClick,
  onTaskClick,
  onAddTask,
  onAddHabit,
  highlightedHabitId,
  highlightedTaskId,
  isTaskCompleted,
}: TaskTreeProps) {
  const router = useRouter();

  const getUniqueTasksAtLevel = (taskList: Task[]): Task[] => {
    const seen = new Set<string>();
    return taskList.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  };
  
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
    const linkedHabits = Array.from(
      new Map((task.habits || []).map((habit) => [habit.id, habit])).values()
    );
    const calculatedProgress = calculateTaskProgress(task as Task & { total_weight?: string; weighted_progress?: string });
    const isLeaf = !taskHasChildren && !taskHasHabits;
    const isTaskHighlighted = highlightedTaskId === task.id;
    
    // Expand if task has habits and is expanded
    const showHabits = taskHasHabits && isExpanded;
    
    // Cross out task if it's completed (progress is 100%)
    const shouldCrossOut = isTaskCompleted ? isTaskCompleted(task) : false;

    return (
      <div key={task.id} className="space-y-2">
        <div className="flex items-center gap-2">
          {(taskHasChildren || taskHasHabits) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleToggleExpand(task.id)}
              aria-label={isExpanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
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
            className={cn(
              "flex-1 transition-colors rounded-md",
              onTaskClick && "cursor-pointer",
              isTaskHighlighted && "bg-indigo-50"
            )}
            onClick={() => onTaskClick?.(task.id)}
            role={onTaskClick ? "button" : undefined}
            tabIndex={onTaskClick ? 0 : undefined}
            aria-label={onTaskClick ? `Open task ${task.title}` : undefined}
            onKeyDown={
              onTaskClick
                ? (event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onTaskClick(task.id);
                  }
                : undefined
            }
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
              onAddTask={onAddTask ? () => onAddTask(task) : undefined}
              onAddHabit={onAddHabit ? () => onAddHabit(task) : undefined}
              crossOut={shouldCrossOut}
            />
          </div>
        </div>

        {/* Children */}
        {taskHasChildren && isExpanded && task.children && (
          <div className="ml-6 space-y-2">
            {getUniqueTasksAtLevel(task.children).map((child) => renderTask(child, currentLevel + 1))}
          </div>
        )}

        {/* Habits as child items */}
        {showHabits && linkedHabits && linkedHabits.length > 0 && (
          <div className="ml-6 space-y-2">
            {linkedHabits.map((habit) => {
              // Find the full habit data with logs from the habits prop
              const fullHabit = habits.find((h) => h.id === habit.id) || habit;
              
              // Get group from habit or groups array
              const habitGroup = (fullHabit as Habit & { group?: Group }).group || groups.find((g) => g.id === fullHabit.groupId);
              
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
              } else if (typeof fullHabit.progress === "number") {
                habitProgress = Math.min(100, Math.max(0, Math.round(fullHabit.progress)));
                if (fullHabit.targetCount > 0) {
                  currentCount = fullHabit.currentCount ?? Math.round((habitProgress / 100) * fullHabit.targetCount);
                }
              }
              
              const streak = fullHabit.streak ?? 0;
              const isHabitHighlighted = highlightedHabitId === habit.id;
              
              return (
                <HabitCardWithHover
                  key={habit.id}
                  habit={habit}
                  fullHabit={fullHabit}
                  habitGroup={habitGroup}
                  habitProgress={habitProgress}
                  currentCount={currentCount}
                  streak={streak}
                  currentLevel={currentLevel}
                  isHighlighted={isHabitHighlighted}
                  onHabitClick={() => onHabitClick?.(habit.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Separate component for habit card to manage hover state
  function HabitCardWithHover({
    habit,
    fullHabit,
    habitGroup,
    habitProgress,
    currentCount,
    streak,
    currentLevel,
    isHighlighted,
    onHabitClick,
  }: {
    habit: Habit;
    fullHabit: Habit;
    habitGroup: Group | undefined;
    habitProgress: number;
    currentCount: number;
    streak: number;
    currentLevel: number;
    isHighlighted: boolean;
    onHabitClick: () => void;
  }) {
    const [isHovered, setIsHovered] = useState(false);
    const isHabitCompleted = habitProgress >= 100;
                
    return (
      <div className="flex items-center gap-2">
        <div className="w-6 flex-shrink-0" />
        <div className="flex-1">
          <Card
            data-habit-card-id={habit.id}
            className={cn(
              "p-3 hover:border-slate-300 transition-all cursor-pointer",
              "bg-slate-50/50 border-slate-200",
              isHighlighted && "border-indigo-400 bg-indigo-50/30",
              isHabitCompleted && "opacity-60"
            )}
            style={{ marginLeft: `${(currentLevel + 1) * 24}px` }}
            onClick={onHabitClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={0}
            aria-label={`Open habit ${habit.title}`}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onHabitClick();
            }}
          >
                    <div className="flex items-start gap-3">
                      <div className="w-6 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4
                              className={cn(
                                "text-sm font-medium text-slate-900",
                                isHabitCompleted && "line-through text-muted-foreground"
                              )}
                            >
                              {habit.title}
                            </h4>
                            <Badge variant="outline" className="text-xs border-slate-300 text-slate-700 bg-slate-100">
                              Habit
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {habit.type === "DAILY"
                                ? `Max/day ${habit.maxCountPerDay || 1}x`
                                : `${habit.countPerPeriod || 1}x/${habit.type.toLowerCase()}`}
                            </Badge>
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
                            className="flex items-center gap-1 hover:text-slate-600 transition-colors"
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
                              className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                              style={{
                                backgroundColor: `${label.color}20`,
                                color: label.color,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/labels?highlight=${label.id}`);
                              }}
                            >
                              {label.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Progress Bar */}
                      <div className="flex items-center gap-3">
                        <UnifiedProgressBar
                          value={habitProgress}
                          interactive={false}
                          isHighlighted={isHighlighted || isHovered}
                          showPercentageOnHover={true}
                        />
                      </div>
                    </div>
                  </div>
                    </Card>
                  </div>
                </div>
              );
            }

  return (
    <div className="space-y-2">
      {getUniqueTasksAtLevel(tasks).map((task) => renderTask(task, level))}
    </div>
  );
}
