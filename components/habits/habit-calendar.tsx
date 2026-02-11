"use client";

import { useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from "date-fns";
import { Habit, HabitLog } from "@/types";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDayRollover } from "@/lib/use-day-rollover";

interface HabitCalendarProps {
  habit: Habit;
  logs: HabitLog[];
  onDateClick?: (date: Date, decrease?: boolean) => void;
  currentMonth?: Date;
  onMonthChange?: (month: Date) => void;
}

export function HabitCalendar({
  habit,
  logs,
  onDateClick,
  currentMonth = new Date(),
  onMonthChange,
}: HabitCalendarProps) {
  const month = currentMonth;
  const todayKey = useDayRollover();
  const maxCountPerDay = habit.maxCountPerDay || 1;
  
  useEffect(() => {
    if (onMonthChange) {
      onMonthChange(month);
    }
  }, [month, onMonthChange]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get first day of month to calculate offset
  const firstDayOfWeek = getDay(monthStart);
  const emptyDays = Array(firstDayOfWeek).fill(null);

  // Create a map of dates to log counts
  // Group logs by date (YYYY-MM-DD) and sum their counts
  const logCountsByDate = new Map<string, number>();
  logs.forEach((log) => {
    // Parse the date and format it consistently
    const logDate = parseISO(log.date);
    // Use UTC date to avoid timezone issues
    const year = logDate.getUTCFullYear();
    const month = String(logDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(logDate.getUTCDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    logCountsByDate.set(dateKey, (logCountsByDate.get(dateKey) || 0) + log.count);
  });

  const today = todayKey;

  const isActiveDay = (dayOfWeek: number) => {
    if (habit.type !== "DAILY") return true;
    return habit.activeDays?.includes(dayOfWeek) ?? true;
  };

  const handlePreviousMonth = () => {
    if (onMonthChange) {
      onMonthChange(subMonths(month, 1));
    }
  };

  const handleNextMonth = () => {
    if (onMonthChange) {
      onMonthChange(addMonths(month, 1));
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handlePreviousMonth}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h4 className="text-sm font-medium min-w-[120px] text-center">
            {format(month, "MMMM yyyy")}
          </h4>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleNextMonth}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-indigo-600 rounded" />
            <span>Today</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 flex-1" style={{ gridTemplateRows: 'auto repeat(6, minmax(0, 1fr))' }}>
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center text-xs text-muted-foreground py-0.5 flex items-center justify-center font-medium">
            {day}
          </div>
        ))}

        {/* Empty days for alignment */}
        {emptyDays.map((_, index) => (
          <div key={`empty-${index}`} />
        ))}

        {/* Calendar days */}
        {daysInMonth.map((day) => {
          // Format day consistently
          const dayKey = format(day, "yyyy-MM-dd");
          const isToday = dayKey === today;
          const count = logCountsByDate.get(dayKey) || 0;
          const isLogged = count > 0;
          const dayOfWeek = getDay(day);
          const isActive = isActiveDay(dayOfWeek);
          const isComplete = count >= maxCountPerDay;
          const isOverboard = count > maxCountPerDay;
          // Check if date is in the future
          const isFuture = day > new Date(new Date().setHours(23, 59, 59, 999));

          return (
            <button
              key={dayKey}
              onClick={(event) => {
                if (isFuture) return;
                const shouldDecrease = event.shiftKey;
                onDateClick?.(day, shouldDecrease);
              }}
              disabled={isFuture}
              className={cn(
                "rounded text-xs transition-all relative flex flex-col items-center justify-center w-full aspect-square p-0.5",
                isToday && "border-2 border-indigo-600",
                isComplete
                  ? "bg-green-100 border border-green-300"
                  : isLogged
                  ? "bg-green-50 border border-green-200"
                  : "bg-muted hover:bg-muted/80",
                isOverboard && "bg-orange-100 border border-orange-300",
                !isActive && habit.type === "DAILY" && "opacity-40",
                isFuture && "opacity-30 cursor-not-allowed blur-[0.5px]"
              )}
            >
              <span className={cn(
                "text-xs leading-tight font-medium",
                isToday && "text-indigo-600 font-semibold",
                isOverboard && "text-orange-700 font-semibold"
              )}>
                {format(day, "d")}
              </span>
              {isLogged && (
                <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
                  {maxCountPerDay > 1 ? (
                    <span className={cn(
                      "text-[9px] font-medium px-0.5 rounded leading-tight",
                      isComplete ? "text-green-700" : "text-green-600",
                      isOverboard && "text-orange-700"
                    )}>
                      {count}/{maxCountPerDay}
                    </span>
                  ) : (
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
