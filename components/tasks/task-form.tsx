"use client";

import { useState } from "react";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { createTaskSchema } from "@/lib/validations/task";
import { Task, Group, Label } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label as FormLabel } from "@/components/ui/label";
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
import { GroupOverrideWarningDialog } from "./form-sections/group-override-warning-dialog";
import { DateBoundsWarningDialog } from "./form-sections/date-bounds-warning-dialog";
import {
  checkDateBoundsConflicts,
  checkGroupConflicts,
  DateBoundsConflictInfo,
  flattenTasks,
  GroupConflictInfo,
  isDescendant,
} from "./form-sections/task-form-helpers";

const formSchema = createTaskSchema.extend({
  labelIds: z.array(z.string()).optional(),
});

type TaskFormInput = z.input<typeof formSchema>;
type TaskFormData = z.output<typeof formSchema>;

interface TaskFormProps {
  task?: Task;
  groups: Group[];
  labels: Label[];
  availableTasks?: Task[];
  initialParentId?: string;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export function TaskForm({
  task,
  groups,
  labels,
  availableTasks = [],
  initialParentId,
  onSubmit,
  onCancel,
  loading = false,
}: TaskFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<TaskFormInput, unknown, TaskFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: task
      ? {
          title: task.title,
          description: task.description || "",
          importance: task.importance,
          progress: task.progress,
          startDate: task.startDate || undefined,
          deadline: task.deadline || undefined,
          groupId: task.groupId || undefined,
          parentId: task.parentId || undefined,
          labelIds: task.labels?.map((l) => l.id) || [],
        }
      : {
          importance: 50,
          progress: 0,
          parentId: initialParentId || undefined,
          labelIds: [],
        },
  });

  // Set initial parent ID if provided and not editing
  React.useEffect(() => {
    if (!task && initialParentId) {
      setValue("parentId", initialParentId);
    }
  }, [initialParentId, task, setValue]);

  const importance = useWatch({ control, name: "importance" }) ?? 50;
  const selectedParentId = useWatch({ control, name: "parentId" });
  const selectedGroupId = useWatch({ control, name: "groupId" }) || undefined;
  const watchedLabelIds = useWatch({ control, name: "labelIds" });
  const progress = useWatch({ control, name: "progress" }) || 0;
  const startDate = useWatch({ control, name: "startDate" });
  const deadline = useWatch({ control, name: "deadline" });
  const selectedLabelIds = React.useMemo(() => watchedLabelIds ?? [], [watchedLabelIds]);
  const [showGroupWarning, setShowGroupWarning] = useState(false);
  const [showDateBoundsWarning, setShowDateBoundsWarning] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<TaskFormData | null>(null);
  const [conflictInfo, setConflictInfo] = useState<GroupConflictInfo | null>(null);
  const [dateBoundsConflictInfo, setDateBoundsConflictInfo] = useState<DateBoundsConflictInfo | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Check if task is a leaf task (no children, no habits)
  // For editing, check if task has children or habits
  // Check both the arrays and _count object (from API response)
  const taskWithCount = task as Task & { _count?: { children?: number; habits?: number } };
  const hasChildren = task && (
    (task.children && task.children.length > 0) || 
    (taskWithCount._count?.children && taskWithCount._count.children > 0)
  );
  const hasHabits = task && (
    (task.habits && task.habits.length > 0) || 
    (taskWithCount._count?.habits && taskWithCount._count.habits > 0)
  );
  const isLeafTask = !hasChildren && !hasHabits;
  const isNonLeafTask = task && !isLeafTask;

  const allTasks = React.useMemo(() => flattenTasks(availableTasks), [availableTasks]);

  const selectedParentTask = React.useMemo(
    () => allTasks.find((t) => t.id === selectedParentId),
    [allTasks, selectedParentId]
  );

  const inheritedParentLabelIds = React.useMemo(
    () => selectedParentTask?.labels?.map((l) => l.id) || [],
    [selectedParentTask]
  );

  const inheritedParentLabelIdsKey = React.useMemo(
    () => [...inheritedParentLabelIds].sort().join(","),
    [inheritedParentLabelIds]
  );

  const originalParentId = task?.parentId || initialParentId || undefined;
  const parentSelectionChanged = selectedParentId !== originalParentId;
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

  const currentTaskNode = React.useMemo(
    () => (task ? allTasks.find((t) => t.id === task.id) : undefined),
    [allTasks, task]
  );

  // Filter out current task and its descendants from parent options
  const parentOptions = allTasks.filter((t) => {
    if (!task) return true; // When creating, all tasks are available
    if (t.id === task.id) return false;
    if (!currentTaskNode) return true;
    // Exclude descendants of current task to avoid circular references.
    return !isDescendant(currentTaskNode, t.id);
  });

  const checkAndHandleGroupConflicts = (data: TaskFormData): boolean => {
    if (!task) return false;

    const currentGroupId = task.groupId || undefined;
    const newGroupId = data.groupId || undefined;
    if (currentGroupId !== newGroupId) {
      const conflicts = checkGroupConflicts(newGroupId, task, groups);
      if (conflicts.hasConflict) {
        setConflictInfo(conflicts);
        setPendingSubmitData(data);
        setShowGroupWarning(true);
        return true;
      }
    }

    return false;
  };

  const handleFormSubmit = async (data: TaskFormData) => {
    // Clear any previous API errors
    setApiError(null);

    // Check for date-bound conflicts when editing and date bounds are changed.
    if (task) {
      const currentStartDate = task.startDate || undefined;
      const currentDeadline = task.deadline || undefined;
      const newStartDate = data.startDate || undefined;
      const newDeadline = data.deadline || undefined;

      const startDateChanged = newStartDate !== currentStartDate;
      const deadlineChanged = newDeadline !== currentDeadline;
      const shouldCheckDateBounds =
        (startDateChanged && !!newStartDate) ||
        (deadlineChanged && !!newDeadline);

      if (shouldCheckDateBounds) {
        const dateConflicts = checkDateBoundsConflicts(newStartDate, newDeadline, task);
        if (dateConflicts.hasConflict) {
          setDateBoundsConflictInfo(dateConflicts);
          setPendingSubmitData(data);
          setShowDateBoundsWarning(true);
          return;
        }
      }
    }

    // Check group conflicts only when editing and group is changed.
    if (checkAndHandleGroupConflicts(data)) {
      return;
    }

    // No warnings, proceed with submission.
    await proceedWithSubmit(data);
  };

  const proceedWithSubmit = async (data: TaskFormData) => {
    try {
      setApiError(null);
      // Remove progress from data if it's a non-leaf task (progress is auto-calculated)
      if (isNonLeafTask && 'progress' in data) {
        const dataWithoutProgress = { ...data };
        delete dataWithoutProgress.progress;
        await onSubmit(dataWithoutProgress);
      } else {
        await onSubmit(data);
      }
      setShowGroupWarning(false);
      setShowDateBoundsWarning(false);
      setPendingSubmitData(null);
      setConflictInfo(null);
      setDateBoundsConflictInfo(null);
    } catch (error) {
      // Extract error message
      const errorMessage = error instanceof Error ? error.message : "An error occurred. Please try again.";
      setApiError(errorMessage);
      // Re-throw to prevent form from closing if needed
      throw error;
    }
  };

  const handleWarningConfirm = async () => {
    if (pendingSubmitData) {
      await proceedWithSubmit(pendingSubmitData);
    }
  };

  const handleDateBoundsWarningConfirm = async () => {
    if (!pendingSubmitData) return;

    setShowDateBoundsWarning(false);
    setDateBoundsConflictInfo(null);

    if (checkAndHandleGroupConflicts(pendingSubmitData)) {
      return;
    }

    await proceedWithSubmit(pendingSubmitData);
  };

  const handleDateBoundsWarningCancel = () => {
    setShowDateBoundsWarning(false);
    setPendingSubmitData(null);
    setDateBoundsConflictInfo(null);
  };

  const handleWarningCancel = () => {
    setShowGroupWarning(false);
    setPendingSubmitData(null);
    setConflictInfo(null);
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
          placeholder="Enter task title"
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
          placeholder="Enter task description"
          rows={3}
        />
      </div>

      {/* Group and Parent */}
      <div className="grid grid-cols-2 gap-4">
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

        <div>
          <FormLabel htmlFor="parentId">Parent Task</FormLabel>
          <Select
            value={selectedParentId || "__none__"}
            onValueChange={(value) =>
              setValue("parentId", value === "__none__" ? undefined : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="None (Root task)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (Root task)</SelectItem>
              {parentOptions.map((t) => {
                // Calculate indentation level for display based on hierarchy
                const getLevel = (task: Task, taskList: Task[], level = 0): number => {
                  // Find parent in the flattened list
                  const parent = taskList.find((p) => 
                    p.children && p.children.some((c) => c.id === task.id)
                  );
                  if (!parent) return level;
                  return getLevel(parent, taskList, level + 1);
                };
                const indent = getLevel(t, allTasks);
                const indentStr = indent > 0 ? "  ".repeat(indent) : "";
                return (
                  <SelectItem key={t.id} value={t.id}>
                    {indentStr}{t.title}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
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

      {/* Progress */}
      <div>
        <FormLabel htmlFor="progress">
          Progress: {progress}%
          {isNonLeafTask && (
            <span className="text-xs text-muted-foreground ml-2">
              (Auto-calculated from children and linked habits)
            </span>
          )}
        </FormLabel>
        <Slider
          value={[progress]}
          onValueChange={([value]) => setValue("progress", value)}
          min={0}
          max={100}
          step={1}
          className="w-full"
          disabled={isNonLeafTask}
        />
        {isNonLeafTask && (
          <p className="text-xs text-muted-foreground mt-1">
            Progress for tasks with children or linked habits is automatically calculated and cannot be manually set.
          </p>
        )}
      </div>

      {/* Start Date and Deadline */}
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
        </div>

        <div>
          <FormLabel>Deadline</FormLabel>
          <DatePicker
            date={deadline ? parseISO(deadline) : undefined}
            onSelect={(date) =>
              setValue("deadline", date ? format(date, "yyyy-MM-dd") : undefined)
            }
            placeholder="Pick a deadline"
            disablePast={true}
          />
        </div>
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
          {loading ? "Saving..." : task ? "Update Task" : "Create Task"}
        </Button>
      </div>

      <GroupOverrideWarningDialog
        open={showGroupWarning}
        conflictInfo={conflictInfo}
        onOpenChange={setShowGroupWarning}
        onCancel={handleWarningCancel}
        onContinue={handleWarningConfirm}
      />

      <DateBoundsWarningDialog
        open={showDateBoundsWarning}
        conflictInfo={dateBoundsConflictInfo}
        onOpenChange={setShowDateBoundsWarning}
        onCancel={handleDateBoundsWarningCancel}
        onContinue={handleDateBoundsWarningConfirm}
      />
    </form>
  );
}
