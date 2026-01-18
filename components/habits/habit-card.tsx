"use client";

import { Habit, Group } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { Flame, Repeat, ArrowRight, ListTodo, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  // Use provided progress/count or calculate from habit
  const currentCount = propCurrentCount ?? habit.currentCount ?? 0;
  const progress = propProgress ?? (
    habit.currentCount && habit.targetCount
      ? Math.round((habit.currentCount / habit.targetCount) * 100)
      : 0
  );

  return (
    <Card
      className={cn(
        "p-4 cursor-pointer transition-all relative",
        isSelected
          ? "border-indigo-600 bg-indigo-50"
          : "hover:border-slate-300"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 pr-8">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium">{habit.title}</h4>
            {streak > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-3 h-3" />
                <span className="text-xs">{streak}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Badge variant="secondary" className="text-xs">
              {habit.type}
            </Badge>
            {group && <span>{group.name}</span>}
          </div>
          {linkedTaskTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTaskClick?.();
              }}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mt-1"
            >
              <ListTodo className="w-3 h-3" />
              <span>{linkedTaskTitle}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Progress: {progress}%</span>
          {(onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-slate-100 rounded">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}>
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
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 mb-2">
        <div
          className="bg-green-600 rounded-full h-1.5 transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {currentCount} / {habit.targetCount}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs">Importance:</span>
          <ImportanceIndicator importance={habit.importance} size="sm" />
          <span className="font-medium">{habit.importance}</span>
        </div>
      </div>
    </Card>
  );
}
