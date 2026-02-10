"use client";

import { Habit, Group } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { Flame, Repeat, ArrowRight, ListTodo, MoreVertical, Folder, Clock, Calendar, Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPending } from "@/lib/date-helpers";
import { useDayRollover } from "@/lib/use-day-rollover";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

interface HabitCardProps {
  habit: Habit;
  group?: Group;
  streak?: number;
  linkedTaskTitle?: string;
  isSelected?: boolean;
  onClick?: () => void;
  onTaskClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  progress?: number; // Calculated progress percentage
  currentCount?: number; // Current count from logs
}

export function HabitCard({
  habit,
  group,
  streak = 0,
  linkedTaskTitle,
  isSelected = false,
  onClick,
  onTaskClick,
  onEdit,
  onDelete,
  progress: propProgress,
  currentCount: propCurrentCount,
}: HabitCardProps) {
  const router = useRouter();
  const todayKey = useDayRollover();
  
  // Use provided progress/count or calculate from habit
  const currentCount = propCurrentCount ?? habit.currentCount ?? 0;
  const progress = propProgress ?? (
    habit.currentCount && habit.targetCount
      ? Math.round((habit.currentCount / habit.targetCount) * 100)
      : 0
  );
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const isCompleted = clampedProgress >= 100;
  const isOverdue = (() => {
    if (!habit.endDate) return false;
    if (clampedProgress >= 100) return false;
    const endDate = new Date(habit.endDate);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date(`${todayKey}T00:00:00`);
    return endDate < today;
  })();
  const isScheduled = isPending(habit.startDate);
  
  // Get group from habit payload if not provided as prop
  const habitWithGroup = habit as Habit & { group?: Group };
  const displayGroup = group || habitWithGroup.group;

  return (
    <Card
      className={cn(
        "p-4 hover:border-slate-300 transition-all group",
        isSelected && "border-indigo-600 bg-indigo-50",
        isCompleted && "opacity-60",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Placeholder for checkbox alignment (habits don't have checkboxes) */}
        <div className="w-5 flex-shrink-0" />
        
        {/* Habit Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h4
                className={cn(
                  "text-sm font-medium mb-1",
                  isCompleted && "line-through text-muted-foreground"
                )}
              >
                {habit.title}
                {streak > 0 && (
                  <span className="ml-2 flex items-center gap-1 text-orange-500 inline-flex">
                    <Flame className="w-3 h-3" />
                    <span className="text-xs">{streak}</span>
                  </span>
                )}
              </h4>
              {habit.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {habit.description}
                </p>
              )}
            </div>
            {(onEdit || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={cn(
                      "p-1 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                      isSelected && "opacity-100"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
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
              <ImportanceIndicator importance={habit.importance} size="sm" />
              <span>{habit.importance}</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {habit.type}
            </Badge>
            {habit.countPerPeriod && habit.countPerPeriod > 1 && (
              <Badge variant="outline" className="text-xs">
                {habit.countPerPeriod}x per {habit.type.toLowerCase()}
              </Badge>
            )}
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
            {linkedTaskTitle && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskClick?.();
                }}
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
              >
                <ListTodo className="w-3 h-3" />
                <span>{linkedTaskTitle}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            {habit.startDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Start: {format(new Date(habit.startDate), "MMM d")}</span>
              </div>
            )}
            {habit.endDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>End: {format(new Date(habit.endDate), "MMM d, yyyy")}</span>
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
          {habit.labels && habit.labels.length > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {habit.labels.map((label) => (
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
                value={clampedProgress}
                interactive={false}
                showPercentageOnHover={true}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentCount} / {habit.targetCount}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
