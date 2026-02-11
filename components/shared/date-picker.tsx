"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn, parseDateString } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date?: Date;
  onSelect?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  disablePast?: boolean;
  disableFuture?: boolean;
}

export function DatePicker({
  date,
  onSelect,
  placeholder = "Pick a date",
  disabled = false,
  className,
  disablePast = false,
  disableFuture = false,
}: DatePickerProps) {
  const [textInput, setTextInput] = React.useState<string>(
    date ? format(date, "PPP") : ""
  );
  const [isOpen, setIsOpen] = React.useState(false);

  // Update text input when date prop changes
  React.useEffect(() => {
    if (date) {
      setTextInput(format(date, "PPP"));
    } else {
      setTextInput("");
    }
  }, [date]);

  const getDisabledDates = () => {
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
    twoYearsFromNow.setHours(23, 59, 59, 999);
    
    const matchers: Array<{ before: Date } | { after: Date }> = [];
    
    if (disablePast) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      matchers.push({ before: today });
    }
    
    // Always disable dates more than 2 years in the future
    // If disableFuture is true, also disable dates after today (whichever is earlier)
    if (disableFuture) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      // Use the earlier of today or 2 years from now
      const limit = today < twoYearsFromNow ? today : twoYearsFromNow;
      matchers.push({ after: limit });
    } else {
      matchers.push({ after: twoYearsFromNow });
    }
    
    // Return array of matchers
    return matchers.length > 0 ? matchers : undefined;
  };

  const handleTextChange = (value: string) => {
    setTextInput(value);
    
    // Only clear date if input is completely empty
    // Don't parse while typing - wait for blur to avoid premature parsing
    if (value.trim() === "") {
      onSelect?.(undefined);
    }
  };

  const handleTextBlur = () => {
    // On blur, format the date if valid, otherwise reset
    const parsed = parseDateString(textInput);
    if (parsed) {
      const parsedDate = new Date(parsed);
      // Validate date constraints (parseDateString already checks 2-year limit)
      let isValid = true;
      if (disablePast) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedDate < today) {
          isValid = false;
        }
      }
      if (disableFuture) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (parsedDate > today) {
          isValid = false;
        }
      }
      if (isValid) {
        // Format the valid date
        setTextInput(format(parsedDate, "PPP"));
        onSelect?.(parsedDate);
      } else {
        // Reset to current date or empty if invalid
        if (date) {
          setTextInput(format(date, "PPP"));
        } else {
          setTextInput("");
          onSelect?.(undefined);
        }
      }
    } else if (textInput.trim() !== "") {
      // Invalid date text, reset to current date or empty
      if (date) {
        setTextInput(format(date, "PPP"));
      } else {
        setTextInput("");
        onSelect?.(undefined);
      }
    }
  };

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    onSelect?.(selectedDate);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          type="text"
          value={textInput}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleTextBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("flex-1", className)}
        />
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={"outline"}
              size="icon"
              disabled={disabled}
              className="shrink-0"
              aria-label="Open calendar"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0 h-[320px]" 
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <div className="h-full flex items-start justify-start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleCalendarSelect}
                initialFocus
                disabled={getDisabledDates()}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
