"use client";

import { useEffect, useState } from "react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Habit, Group, Label, Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label as FormLabel } from "@/components/ui/label";
import { createHabitSchema, habitFormSchema } from "@/lib/validations/habit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/shared/date-picker";
import { LabelSelector } from "@/components/shared/label-selector";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";

const formSchema = habitFormSchema;

type HabitFormData = z.infer<typeof formSchema>;

interface HabitFormProps {
  habit?: Habit;
  groups: Group[];
  labels: Label[];
  availableTasks?: Task[];
  initialParentTaskId?: string;
  onSubmit: (data: HabitFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function HabitForm({
  habit,
  groups,
  labels,
  availableTasks = [],
  initialParentTaskId,
  onSubmit,
  onCancel,
  loading = false,
}: HabitFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<HabitFormData>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: habit
      ? {
          title: habit.title,
          description: habit.description || "",
          type: habit.type,
          targetCount: habit.targetCount,
          importance: habit.importance,
          startDate: habit.startDate || undefined,
          endDate: habit.endDate || undefined,
          activeDays: habit.activeDays || [],
          groupId: habit.groupId || undefined,
          parentTaskId: habit.parentTaskId || undefined,
          labelIds: habit.labels?.map((l) => l.id) || [],
        }
      : {
          type: "DAILY",
          targetCount: 30,
          importance: 50,
          activeDays: [],
          parentTaskId: initialParentTaskId || undefined,
          labelIds: [],
        },
  });

  // Set initial parent task ID if provided and not editing
  React.useEffect(() => {
    if (!habit && initialParentTaskId) {
      setValue("parentTaskId", initialParentTaskId);
    }
  }, [initialParentTaskId, habit, setValue]);

  const type = watch("type");
  const importance = watch("importance") ?? 50;
  const selectedLabelIds = watch("labelIds") || [];
  const activeDays = watch("activeDays") || [];
  const [apiError, setApiError] = useState<string | null>(null);

  const handleFormSubmit = async (data: HabitFormData) => {
    try {
      setApiError(null);
      await onSubmit(data);
    } catch (error) {
      // Extract error message
      const errorMessage = error instanceof Error ? error.message : "An error occurred. Please try again.";
      setApiError(errorMessage);
      // Re-throw to prevent form from closing if needed
      throw error;
    }
  };

  const toggleActiveDay = (day: number) => {
    const newDays = activeDays.includes(day)
      ? activeDays.filter((d) => d !== day)
      : [...activeDays, day];
    setValue("activeDays", newDays);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* API Error Display */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
          <p className="text-sm font-medium">{apiError}</p>
        </div>
      )}
      
      {/* Title */}
      <div>
        <FormLabel htmlFor="title">Title *</FormLabel>
        <Input
          id="title"
          {...register("title")}
          placeholder="Enter habit title"
          className={errors.title ? "border-red-500" : ""}
        />
        {errors.title && (
          <p className="text-sm text-red-500 mt-1">{errors.title.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <FormLabel htmlFor="description">Description</FormLabel>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Enter habit description"
          rows={2}
        />
      </div>

      {/* Type and Group */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel htmlFor="type">Type *</FormLabel>
          <Select
            value={type}
            onValueChange={(value: "DAILY" | "WEEKLY" | "MONTHLY") =>
              setValue("type", value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY">Daily</SelectItem>
              <SelectItem value="WEEKLY">Weekly</SelectItem>
              <SelectItem value="MONTHLY">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <FormLabel htmlFor="groupId">Group</FormLabel>
          <Select
            value={watch("groupId") || "__none__"}
            onValueChange={(value) =>
              setValue("groupId", value === "__none__" ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select group..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Days for WEEKLY */}
      {type === "WEEKLY" && (
        <div>
          <FormLabel>Active Days *</FormLabel>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${day.value}`}
                  checked={activeDays.includes(day.value)}
                  onCheckedChange={() => toggleActiveDay(day.value)}
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
          {errors.activeDays && (
            <p className="text-sm text-red-500 mt-1">
              {errors.activeDays.message}
            </p>
          )}
        </div>
      )}

      {/* Target Count */}
      <div>
        <FormLabel htmlFor="targetCount">Target Count *</FormLabel>
        <Input
          id="targetCount"
          type="number"
          min="1"
          {...register("targetCount", { valueAsNumber: true })}
          placeholder="e.g., 30"
          className={errors.targetCount ? "border-red-500" : ""}
        />
        {errors.targetCount && (
          <p className="text-sm text-red-500 mt-1">
            {errors.targetCount.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Total cumulative count. Can be auto-calculated from end date.
        </p>
      </div>

      {/* Start Date and End Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>Start Date</FormLabel>
          <DatePicker
            date={watch("startDate") ? new Date(watch("startDate")!) : undefined}
            onSelect={(date) =>
              setValue("startDate", date ? date.toISOString() : undefined)
            }
            placeholder="Pick a start date"
          />
          <p className="text-xs text-muted-foreground mt-1">
            When to start this habit
          </p>
        </div>

        <div>
          <FormLabel>End Date</FormLabel>
          <DatePicker
            date={watch("endDate") ? new Date(watch("endDate")!) : undefined}
            onSelect={(date) =>
              setValue("endDate", date ? date.toISOString() : undefined)
            }
            placeholder="Pick an end date"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used for auto-calculating target count
          </p>
        </div>
      </div>

      {/* Parent Task */}
      <div>
        <FormLabel htmlFor="parentTaskId">Link to Task (Optional)</FormLabel>
        <Select
          value={watch("parentTaskId") || "__none__"}
          onValueChange={(value) =>
            setValue("parentTaskId", value === "__none__" ? undefined : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {availableTasks.map((task) => (
              <SelectItem key={task.id} value={task.id}>
                {task.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Importance */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <FormLabel>Importance: {importance}/100</FormLabel>
          <ImportanceIndicator importance={importance} size="md" />
        </div>
        <Slider
          value={[importance]}
          onValueChange={([value]) => setValue("importance", value)}
          min={1}
          max={100}
          step={1}
          className="w-full"
        />
      </div>

      {/* Labels */}
      <div>
        <FormLabel>Labels</FormLabel>
        <LabelSelector
          labels={labels.filter((l) => selectedLabelIds.includes(l.id))}
          selectedLabelIds={selectedLabelIds}
          onSelectionChange={(ids) => setValue("labelIds", ids)}
          availableLabels={labels}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : habit ? "Update Habit" : "Create Habit"}
        </Button>
      </div>
    </form>
  );
}
