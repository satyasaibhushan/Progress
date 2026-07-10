"use client";

import { useState } from "react";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { Habit, Group, Label, Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label as FormLabel } from "@/components/ui/label";
import { habitFormSchema } from "@/lib/validations/habit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { DatePicker } from "@/components/shared/date-picker";
import { LabelSelector } from "@/components/shared/label-selector";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { DailyScheduleSection } from "./form-sections/daily-schedule-section";
import { ALL_DAYS, flattenTasks } from "./form-sections/habit-form-helpers";

type HabitFormData = z.infer<typeof habitFormSchema>;

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
    control,
    getValues,
  } = useForm<HabitFormData>({
    resolver: zodResolver(habitFormSchema),
      defaultValues: habit
      ? {
          title: habit.title,
          description: habit.description || "",
          type: habit.type,
          targetCount: habit.targetCount,
          countPerPeriod: habit.type === "DAILY" ? 1 : (habit.countPerPeriod || 1),
          maxCountPerDay: habit.maxCountPerDay || 1,
          importance: habit.importance,
          startDate: habit.startDate || undefined,
          endDate: habit.endDate || undefined,
          activeDays: habit.type === "DAILY"
            ? ((habit.activeDays && habit.activeDays.length > 0) ? habit.activeDays : ALL_DAYS)
            : [],
          groupId: habit.groupId || undefined,
          parentTaskId: habit.parentTaskId || undefined,
          labelIds: habit.labels?.map((l) => l.id) || [],
        }
      : {
          type: "DAILY",
          targetCount: 30,
          countPerPeriod: 1,
          maxCountPerDay: 1,
          importance: 50,
          activeDays: ALL_DAYS,
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

  const type = useWatch({ control, name: "type" });
  const isDaily = type === "DAILY";
  const selectedParentTaskId = useWatch({ control, name: "parentTaskId" });
  const selectedGroupId = useWatch({ control, name: "groupId" }) || undefined;
  const importance = useWatch({ control, name: "importance" }) ?? 50;
  const watchedLabelIds = useWatch({ control, name: "labelIds" });
  const selectedLabelIds = React.useMemo(() => watchedLabelIds ?? [], [watchedLabelIds]);
  const activeDays = useWatch({ control, name: "activeDays" }) || [];
  const startDate = useWatch({ control, name: "startDate" });
  const endDate = useWatch({ control, name: "endDate" });
  const [apiError, setApiError] = useState<string | null>(null);
  const [showDailySchedule, setShowDailySchedule] = useState(false);

  const parentOptions = React.useMemo(() => flattenTasks(availableTasks), [availableTasks]);

  const selectedParentTask = React.useMemo(
    () => parentOptions.find((t) => t.id === selectedParentTaskId),
    [parentOptions, selectedParentTaskId]
  );

  const inheritedParentLabelIds = React.useMemo(
    () => selectedParentTask?.labels?.map((l) => l.id) || [],
    [selectedParentTask]
  );

  const inheritedParentLabelIdsKey = React.useMemo(
    () => [...inheritedParentLabelIds].sort().join(","),
    [inheritedParentLabelIds]
  );

  const originalParentTaskId = habit?.parentTaskId || initialParentTaskId || undefined;
  const parentSelectionChanged = selectedParentTaskId !== originalParentTaskId;
  const shouldLockInheritedFields = !!selectedParentTask && !parentSelectionChanged;

  React.useEffect(() => {
    if (!selectedParentTask || !shouldLockInheritedFields) return;

    const inheritedGroupId = selectedParentTask.groupId || undefined;
    if (selectedGroupId !== inheritedGroupId) {
      setValue("groupId", inheritedGroupId);
    }

    if (inheritedParentLabelIds.length > 0) {
      const mergedLabelIds = Array.from(new Set([...selectedLabelIds, ...inheritedParentLabelIds]));
      if (mergedLabelIds.length !== selectedLabelIds.length) {
        setValue("labelIds", mergedLabelIds);
      }
    }
  }, [
    selectedParentTask,
    shouldLockInheritedFields,
    selectedGroupId,
    inheritedParentLabelIds,
    inheritedParentLabelIdsKey,
    selectedLabelIds,
    setValue,
  ]);

  React.useEffect(() => {
    if (type === "DAILY") {
      const current = getValues("activeDays") || [];
      if (current.length === 0) {
        setValue("activeDays", ALL_DAYS);
      }
      if ((getValues("countPerPeriod") || 1) !== 1) {
        setValue("countPerPeriod", 1);
      }
      return;
    }

    if ((getValues("activeDays") || []).length > 0) {
      setValue("activeDays", []);
    }
  }, [type, getValues, setValue]);

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
            onValueChange={(value: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY") =>
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
              <SelectItem value="YEARLY">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <FormLabel htmlFor="groupId">Group</FormLabel>
          <Select
            value={selectedGroupId || "__none__"}
            onValueChange={(value) =>
              setValue("groupId", value === "__none__" ? undefined : value)
            }
            disabled={shouldLockInheritedFields}
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
          {shouldLockInheritedFields && (
            <p className="text-xs text-muted-foreground mt-1">
              Group is inherited from the selected parent task.
            </p>
          )}
        </div>
      </div>

      <DailyScheduleSection
        isDaily={isDaily}
        showDailySchedule={showDailySchedule}
        activeDays={activeDays}
        activeDaysError={errors.activeDays?.message}
        onToggleExpanded={() => setShowDailySchedule((prev) => !prev)}
        onToggleDay={toggleActiveDay}
      />

      {/* Target Count / max per day / count per period */}
      <div className="grid grid-cols-2 gap-4">
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
            Total cumulative count for this habit.
          </p>
        </div>

        <div>
          <FormLabel htmlFor="maxCountPerDay">Max Count Per Day</FormLabel>
          <Input
            id="maxCountPerDay"
            type="number"
            min="1"
            {...register("maxCountPerDay", { valueAsNumber: true })}
            placeholder="e.g., 1"
            className={errors.maxCountPerDay ? "border-red-500" : ""}
          />
          {errors.maxCountPerDay && (
            <p className="text-sm text-red-500 mt-1">
              {errors.maxCountPerDay.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Maximum logs allowed on a single day.
          </p>
        </div>
      </div>

      {!isDaily && (
        <div>
          <FormLabel htmlFor="countPerPeriod">Count Per Period *</FormLabel>
          <Input
            id="countPerPeriod"
            type="number"
            min="1"
            {...register("countPerPeriod", { valueAsNumber: true })}
            placeholder="e.g., 1"
            className={errors.countPerPeriod ? "border-red-500" : ""}
          />
          {errors.countPerPeriod && (
            <p className="text-sm text-red-500 mt-1">
              {errors.countPerPeriod.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Required for {type.toLowerCase()} habits.
          </p>
        </div>
      )}

      {/* Start Date and End Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>Start Date</FormLabel>
          <DatePicker
            date={startDate ? parseISO(startDate) : undefined}
            onSelect={(date) =>
              setValue("startDate", date ? format(date, "yyyy-MM-dd") : undefined)
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
            date={endDate ? parseISO(endDate) : undefined}
            onSelect={(date) =>
              setValue("endDate", date ? format(date, "yyyy-MM-dd") : undefined)
            }
            placeholder="Pick an end date"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Optional scheduling boundary
          </p>
        </div>
      </div>

      {/* Parent Task */}
      <div>
        <FormLabel htmlFor="parentTaskId">Link to Task (Optional)</FormLabel>
        <Select
          value={selectedParentTaskId || "__none__"}
          onValueChange={(value) =>
            setValue("parentTaskId", value === "__none__" ? undefined : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {parentOptions.map((parentTask) => (
              <SelectItem key={parentTask.id} value={parentTask.id}>
                {parentTask.title}
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
          disabledLabelIds={shouldLockInheritedFields ? inheritedParentLabelIds : []}
        />
        {shouldLockInheritedFields && inheritedParentLabelIds.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Labels inherited from parent are locked.
          </p>
        )}
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
