"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label as FormLabel } from "@/components/ui/label";
import { DAYS_OF_WEEK } from "./habit-form-helpers";

interface DailyScheduleSectionProps {
  isDaily: boolean;
  showDailySchedule: boolean;
  activeDays: number[];
  activeDaysError?: string;
  onToggleExpanded: () => void;
  onToggleDay: (day: number) => void;
}

export function DailyScheduleSection({
  isDaily,
  showDailySchedule,
  activeDays,
  activeDaysError,
  onToggleExpanded,
  onToggleDay,
}: DailyScheduleSectionProps) {
  if (!isDaily) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <FormLabel>Daily schedule</FormLabel>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleExpanded}
        >
          {showDailySchedule ? "Hide day selection" : "Customize active days"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        By default, all 7 days are active.
      </p>
      {showDailySchedule && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day.value} className="flex items-center space-x-2">
              <Checkbox
                id={`day-${day.value}`}
                checked={activeDays.includes(day.value)}
                onCheckedChange={() => onToggleDay(day.value)}
              />
              <FormLabel
                htmlFor={`day-${day.value}`}
                className="text-sm font-normal cursor-pointer"
              >
                {day.label}
              </FormLabel>
            </div>
          ))}
        </div>
      )}
      {activeDaysError && (
        <p className="text-sm text-red-500 mt-1">{activeDaysError}</p>
      )}
      {showDailySchedule && (
        <p className="text-xs text-muted-foreground mt-1">
          Unselected days are skipped in daily streak calculations.
        </p>
      )}
    </div>
  );
}
