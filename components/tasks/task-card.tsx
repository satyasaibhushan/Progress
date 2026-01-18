"use client";

import { Task, Group, Habit } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { Calendar, Folder, MoreVertical, ListTodo, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
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
}

export function TaskCard({
  task,
  group,
  linkedHabits = [],
  level = 0,
  hasChildren = false,
  calculatedProgress,
  isLeaf = false,
  onEdit,
  onDelete,
  onProgressUpdate,
  onHabitClick,
}: TaskCardProps) {
  const router = useRouter();
  
  // Get group from task if not provided as prop
  const displayGroup = group || (task as any).group;
  // Calculate display progress - cap at 100% and ensure it's valid
  let rawProgress = calculatedProgress !== undefined ? calculatedProgress : (task.progress || 0);
  
  // Safety check: if progress seems way too high, it might be a calculation error
  // Cap it at 100% and log a warning
  if (rawProgress > 100) {
    console.warn(`Task ${task.id} has invalid progress: ${rawProgress}%, capping at 100%`);
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

  const handleProgressChange = async (value: number[]) => {
    const newProgress = value[0];
    setProgressValue(newProgress);
    setIsUpdating(true);
    try {
      await onProgressUpdate?.(newProgress);
    } catch (error) {
      // Revert on error
      setProgressValue(displayProgress);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCheckboxChange = async (checked: boolean) => {
    if (!isLeaf || !onProgressUpdate) return;
    const newProgress = checked ? 100 : 0;
    setProgressValue(newProgress);
    setIsUpdating(true);
    try {
      await onProgressUpdate(newProgress);
    } catch (error) {
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
            onClick={() => handleCheckboxChange(!isCompleted)}
            className="flex-shrink-0 mt-1"
            disabled={isUpdating}
            title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
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
                  isCompleted && "line-through text-muted-foreground"
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
            {(onEdit || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-slate-100 rounded">
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-red-600"
                    >
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
            {task.deadline && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{format(new Date(task.deadline), "MMM d, yyyy")}</span>
              </div>
            )}
          </div>

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {task.labels.map((label) => (
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


          {/* Progress Bar / Slider */}
          <div className="flex items-center gap-3">
            {isLeaf && onProgressUpdate ? (
              <div className="flex-1 space-y-1">
                <Slider
                  value={[progressValue]}
                  onValueChange={handleProgressChange}
                  min={0}
                  max={100}
                  step={1}
                  disabled={isUpdating}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span className="font-medium">{progressValue}%</span>
                  <span>100%</span>
                </div>
              </div>
            ) : (
              <>
                <Progress value={displayProgress} className="flex-1 h-2" />
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {displayProgress}%
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
