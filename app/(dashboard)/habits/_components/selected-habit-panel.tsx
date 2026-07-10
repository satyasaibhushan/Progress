"use client";

import { ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { HabitCalendar } from "@/components/habits/habit-calendar";
import { Habit, HabitLog } from "@/types";

interface SelectedHabitPanelProps {
  selectedHabit: Habit;
  selectedHabitLogs: HabitLog[];
  selectedHabitProgress: number;
  selectedHabitStreak: number;
  streakLabel: string;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onDateClick: (date: Date, decrease?: boolean) => Promise<void>;
  onTaskClick: () => void;
}

export function SelectedHabitPanel({
  selectedHabit,
  selectedHabitLogs,
  selectedHabitProgress,
  selectedHabitStreak,
  streakLabel,
  currentMonth,
  onMonthChange,
  onDateClick,
  onTaskClick,
}: SelectedHabitPanelProps) {
  return (
    <div className="lg:col-span-1 flex flex-col h-full min-h-0">
      <Card className="flex flex-col h-full flex-1 min-h-0 !py-3 !gap-0">
        <CardHeader className="flex-shrink-0 !px-4 !pb-1 !pt-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl">{selectedHabit.title}</CardTitle>
              {selectedHabit.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{selectedHabit.description}</p>
              )}
              {selectedHabit.parentTaskId && selectedHabit.parentTask ? (
                <button
                  onClick={onTaskClick}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 mt-0.5 transition-colors"
                >
                  <ListTodo className="w-4 h-4" />
                  <span>{selectedHabit.parentTask.title}</span>
                </button>
              ) : null}
            </div>
            <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-x-4 gap-y-1 ml-4">
              {selectedHabit.type === "DAILY" ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Max/day:</span>
                  <span className="text-sm font-medium">{selectedHabit.maxCountPerDay || 1}x</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Per {selectedHabit.type.toLowerCase()}:</span>
                  <span className="text-sm font-medium">{selectedHabit.countPerPeriod || 1}x</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Importance:</span>
                <ImportanceIndicator importance={selectedHabit.importance} size="md" showValue />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 space-y-2.5 !px-4 !pt-2 !pb-2">
          <div className="bg-muted rounded-lg p-2.5 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-sm font-medium">{selectedHabitProgress}%</span>
            </div>
            <UnifiedProgressBar
              value={selectedHabitProgress}
              interactive={false}
              showPercentageOnHover={false}
            />
            <div className="grid grid-cols-3 gap-2.5 text-sm">
              <div>
                <p className="text-muted-foreground mb-0.5 text-xs">Current</p>
                <p className="text-base font-semibold">{selectedHabitLogs.reduce((sum, log) => sum + log.count, 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5 text-xs">Target</p>
                <p className="text-base font-semibold">{selectedHabit.targetCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5 text-xs">Streak</p>
                <p className="text-base font-semibold">
                  {selectedHabitStreak} {streakLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <HabitCalendar
              habit={selectedHabit}
              logs={selectedHabitLogs}
              onDateClick={onDateClick}
              currentMonth={currentMonth}
              onMonthChange={onMonthChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
