"use client";

import { Task, Group, Habit } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { Calendar, Folder, MoreVertical, CheckCircle2, Circle, Clock, Plus, Edit, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { isPending } from "@/lib/date-helpers";
import { useDayRollover } from "@/lib/use-day-rollover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface TaskCardProps {
  task: Task;
  group?: Group;
  linkedHabits?: Habit[]; // Deprecated - habits are now shown as child items
  level?: number;
  hasChildren?: boolean;
  calculatedProgress?: number;
  isLeaf?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onProgressUpdate?: (progress: number) => void;
  onHabitClick?: (habitId: string) => void;
  onAddTask?: () => void;
  onAddHabit?: () => void;
  crossOut?: boolean;
}

export function TaskCard({
  task,
  group,
  level = 0,
  calculatedProgress,
  isLeaf = false,
  onEdit,
  onDelete,
  onProgressUpdate,
  onAddTask,
  onAddHabit,
  crossOut = false,
}: TaskCardProps) {
  const router = useRouter();
  const todayKey = useDayRollover();
  
  // Get group from task payload if not provided as prop
  const taskWithGroup = task as Task & { group?: Group };
  const displayGroup = group || taskWithGroup.group;
  // Calculate display progress - cap at 100% and ensure it's valid
  let rawProgress = calculatedProgress !== undefined ? calculatedProgress : (task.progress || 0);
  
  // Safety check: if progress seems way too high, it might be a calculation error
  // Cap it at 100%
  if (rawProgress > 100) {
    rawProgress = 100;
  }
  
  const displayProgress = Math.min(100, Math.max(0, Math.round(rawProgress)));
  const [progressValue, setProgressValue] = useState(displayProgress);
  const [isUpdating, setIsUpdating] = useState(false);

  // Update progress value when displayProgress changes
  useEffect(() => {
    setProgressValue(displayProgress);
  }, [displayProgress]);

  // Only mark as completed if it's a leaf task and progress is 100%
  // For parent tasks, we don't mark as completed based on calculated progress alone
  // Parent tasks are only completed when ALL their leaf children are 100%
  const isCompleted = isLeaf && displayProgress >= 100;
  const isOverdue = (() => {
    if (!task.deadline) return false;
    if (displayProgress >= 100) return false;
    const deadline = parseISO(task.deadline);
    if (Number.isNaN(deadline.getTime())) return false;
    deadline.setHours(0, 0, 0, 0);
    const today = new Date(`${todayKey}T00:00:00`);
    return deadline < today;
  })();
  const isScheduled = isPending(task.startDate);

  const handleProgressChange = useCallback(async (newProgress: number) => {
    setProgressValue(newProgress);
    try {
      await onProgressUpdate?.(newProgress);
    } catch (error) {
      // Revert on error
      setProgressValue(displayProgress);
      throw error;
    }
  }, [onProgressUpdate, displayProgress]);

  const handleCheckboxChange = async (checked: boolean) => {
    if (!isLeaf || !onProgressUpdate) return;
    const newProgress = checked ? 100 : 0;
    setProgressValue(newProgress);
    setIsUpdating(true);
    try {
      await onProgressUpdate(newProgress);
    } catch {
      // Revert on error
      setProgressValue(displayProgress);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card
      className={cn(
        "p-4 hover:border-slate-300 transition-all",
        isCompleted && "opacity-60",
        level > 0 && "ml-6"
      )}
      style={{ marginLeft: `${level * 24}px` }}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox for leaf tasks */}
        {isLeaf && onProgressUpdate ? (
          <button
            onClick={(event) => {
              // TaskTree may make the whole card clickable (e.g. labels and
              // group detail views). Toggling progress must not also navigate
              // to the task detail page.
              event.stopPropagation();
              void handleCheckboxChange(!isCompleted);
            }}
            className="flex-shrink-0 mt-1"
            disabled={isUpdating}
            title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
            aria-label={isCompleted ? `Mark ${task.title} as incomplete` : `Mark ${task.title} as complete`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />
            )}
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}
        
        {/* Task Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h4
                className={cn(
                  "text-sm font-medium mb-1",
                  (isCompleted || crossOut) && "line-through text-muted-foreground"
                )}
              >
                {task.title}
              </h4>
              {task.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {task.description}
                </p>
              )}
            </div>
            {(onEdit || onDelete || onAddTask || onAddHabit) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1 hover:bg-slate-100 rounded"
                    aria-label={`Task actions for ${task.title}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onAddTask && (
                    <DropdownMenuItem onClick={onAddTask}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Task
                    </DropdownMenuItem>
                  )}
                  {onAddHabit && (
                    <DropdownMenuItem onClick={onAddHabit}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Habit
                    </DropdownMenuItem>
                  )}
                  {onAddTask || onAddHabit ? <div className="my-1 h-px bg-border" /> : null}
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
            <div className="flex items-center gap-1">
              <ImportanceIndicator importance={task.importance} size="sm" />
              <span>{task.importance}</span>
            </div>
            {displayGroup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/groups/${displayGroup.id}`);
                }}
                className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
              >
                <Folder className="w-3 h-3" />
                <span>{displayGroup.name}</span>
              </button>
            )}
            {task.startDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Start: {format(parseISO(task.startDate), "MMM d")}</span>
              </div>
            )}
            {task.deadline && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Due: {format(parseISO(task.deadline), "MMM d, yyyy")}</span>
              </div>
            )}
            {isScheduled && (
              <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                <Clock className="w-3 h-3" />
                Scheduled
              </Badge>
            )}
            {isOverdue && (
              <Badge variant="outline" className="text-xs flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
                <Clock className="w-3 h-3" />
                Overdue
              </Badge>
            )}
          </div>

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {task.labels.map((label) => (
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
            <div className="flex-1">
              <UnifiedProgressBar
                value={progressValue}
                onValueChange={isLeaf && onProgressUpdate ? handleProgressChange : undefined}
                disabled={isUpdating}
                min={1}
                max={100}
                interactive={isLeaf && !!onProgressUpdate}
                showPercentageOnHover={true}
                ariaLabel={`Update progress for ${task.title}`}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
