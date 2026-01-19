"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createTaskSchema } from "@/lib/validations/task";
import { Task, Group, Label, Habit } from "@/types";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formSchema = createTaskSchema.extend({
  labelIds: z.array(z.string()).optional(),
});

type TaskFormData = z.infer<typeof formSchema> & {
  labelIds?: string[];
};

interface TaskFormProps {
  task?: Task;
  groups: Group[];
  labels: Label[];
  availableTasks?: Task[];
  onSubmit: (data: TaskFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export function TaskForm({
  task,
  groups,
  labels,
  availableTasks = [],
  onSubmit,
  onCancel,
  loading = false,
}: TaskFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<TaskFormData>({
    resolver: zodResolver(formSchema) as any,
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
          labelIds: [],
        },
  });

  const importance = watch("importance");
  const selectedLabelIds = watch("labelIds") || [];
  const [showGroupWarning, setShowGroupWarning] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<TaskFormData | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{
    childTasksCount: number;
    habitsCount: number;
    affectedGroups: string[];
  } | null>(null);
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

  // Recursively collect all child tasks and their groups
  const collectChildTasks = (task: Task): Task[] => {
    const children: Task[] = [];
    if (task.children && task.children.length > 0) {
      task.children.forEach((child) => {
        children.push(child);
        children.push(...collectChildTasks(child));
      });
    }
    return children;
  };

  // Check if setting a group will override child tasks or habits
  const checkGroupConflicts = (newGroupId: string | undefined, currentTask: Task): {
    hasConflict: boolean;
    childTasksCount: number;
    habitsCount: number;
    affectedGroups: string[];
  } => {
    if (!currentTask) {
      return { hasConflict: false, childTasksCount: 0, habitsCount: 0, affectedGroups: [] };
    }

    // Only check if we have children/habits data available
    // If task has _count but no children array, we can't check individual groups
    // In that case, we'll show a generic warning if the task has any children/habits
    const taskWithCount = currentTask as Task & { _count?: { children?: number; habits?: number } };
    const hasChildrenData = currentTask.children && currentTask.children.length > 0;
    const hasHabitsData = currentTask.habits && currentTask.habits.length > 0;
    const hasChildrenCount = taskWithCount._count?.children && taskWithCount._count.children > 0;
    const hasHabitsCount = taskWithCount._count?.habits && taskWithCount._count.habits > 0;

    // If we don't have the actual data, but we know there are children/habits, show a generic warning
    if ((hasChildrenCount || hasHabitsCount) && !hasChildrenData && !hasHabitsData) {
      return {
        hasConflict: true,
        childTasksCount: taskWithCount._count?.children || 0,
        habitsCount: taskWithCount._count?.habits || 0,
        affectedGroups: [],
      };
    }

    const allChildren = hasChildrenData ? collectChildTasks(currentTask) : [];
    const linkedHabits = (hasHabitsData ? currentTask.habits : []) as Habit[];

    const affectedGroups = new Set<string>();
    let conflictingChildren = 0;
    let conflictingHabits = 0;

    // Check child tasks
    allChildren.forEach((child) => {
      const childGroupId = child.groupId;
      // If child has a different group (and it's not null/undefined), it will be overridden
      if (childGroupId && childGroupId !== newGroupId) {
        conflictingChildren++;
        const groupName = groups.find((g) => g.id === childGroupId)?.name || childGroupId;
        affectedGroups.add(groupName);
      }
    });

    // Check linked habits
    linkedHabits.forEach((habit) => {
      const habitGroupId = habit.groupId;
      // If habit has a different group (and it's not null/undefined), it will be overridden
      if (habitGroupId && habitGroupId !== newGroupId) {
        conflictingHabits++;
        const groupName = groups.find((g) => g.id === habitGroupId)?.name || habitGroupId;
        affectedGroups.add(groupName);
      }
    });

    return {
      hasConflict: conflictingChildren > 0 || conflictingHabits > 0,
      childTasksCount: conflictingChildren,
      habitsCount: conflictingHabits,
      affectedGroups: Array.from(affectedGroups),
    };
  };

  // Flatten all tasks (including nested children) for parent selection
  const flattenTasks = (taskList: Task[]): Task[] => {
    const flattened: Task[] = [];
    const traverse = (tasks: Task[]) => {
      tasks.forEach((t) => {
        flattened.push(t);
        if (t.children && t.children.length > 0) {
          traverse(t.children);
        }
      });
    };
    traverse(taskList);
    return flattened;
  };

  const allTasks = flattenTasks(availableTasks);

  // Filter out current task and its descendants from parent options
  const parentOptions = allTasks.filter((t) => {
    if (!task) return true; // When creating, all tasks are available
    if (t.id === task.id) return false;
    // Check if task is a descendant of t
    const isDescendant = (parent: Task, childId: string): boolean => {
      if (parent.id === childId) return true;
      if (parent.children) {
        return parent.children.some((c) => isDescendant(c, childId));
      }
      return false;
    };
    return !isDescendant(t, task.id);
  });

  const handleFormSubmit = async (data: TaskFormData) => {
    // Clear any previous API errors
    setApiError(null);
    
    // Check for group conflicts only when editing and group is being changed
    if (task) {
      const currentGroupId = task.groupId || undefined;
      const newGroupId = data.groupId || undefined;
      if (currentGroupId !== newGroupId) {
        const conflicts = checkGroupConflicts(newGroupId, task);
        if (conflicts.hasConflict) {
          setConflictInfo(conflicts);
          setPendingSubmitData(data);
          setShowGroupWarning(true);
          return;
        }
      }
    }

    // No conflicts, proceed with submission
    await proceedWithSubmit(data);
  };

  const proceedWithSubmit = async (data: TaskFormData) => {
    try {
      setApiError(null);
      // Remove progress from data if it's a non-leaf task (progress is auto-calculated)
      if (isNonLeafTask && 'progress' in data) {
        const { progress, ...dataWithoutProgress } = data;
        await onSubmit(dataWithoutProgress as TaskFormData);
      } else {
        await onSubmit(data);
      }
      setShowGroupWarning(false);
      setPendingSubmitData(null);
      setConflictInfo(null);
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

  const handleWarningCancel = () => {
    setShowGroupWarning(false);
    setPendingSubmitData(null);
    setConflictInfo(null);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit as any)} className="space-y-6">
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

        <div>
          <FormLabel htmlFor="parentId">Parent Task</FormLabel>
          <Select
            value={watch("parentId") || "__none__"}
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
          Progress: {watch("progress") || 0}%
          {isNonLeafTask && (
            <span className="text-xs text-muted-foreground ml-2">
              (Auto-calculated from children and linked habits)
            </span>
          )}
        </FormLabel>
        <Slider
          value={[watch("progress") || 0]}
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
            date={watch("startDate") ? new Date(watch("startDate")!) : undefined}
            onSelect={(date) =>
              setValue("startDate", date ? date.toISOString() : undefined)
            }
            placeholder="Pick a start date"
          />
        </div>

        <div>
          <FormLabel>Deadline</FormLabel>
          <DatePicker
            date={watch("deadline") ? new Date(watch("deadline")!) : undefined}
            onSelect={(date) =>
              setValue("deadline", date ? date.toISOString() : undefined)
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
          {loading ? "Saving..." : task ? "Update Task" : "Create Task"}
        </Button>
      </div>

      {/* Group Override Warning Dialog */}
      <AlertDialog open={showGroupWarning} onOpenChange={setShowGroupWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Group Override Warning</AlertDialogTitle>
            {conflictInfo && (
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <div>
                    Setting this group will override the groups of all sub-tasks and linked habits:
                  </div>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    {conflictInfo.childTasksCount > 0 && (
                      <li>
                        <strong>{conflictInfo.childTasksCount}</strong> sub-task{conflictInfo.childTasksCount !== 1 ? 's' : ''} (at all levels)
                      </li>
                    )}
                    {conflictInfo.habitsCount > 0 && (
                      <li>
                        <strong>{conflictInfo.habitsCount}</strong> linked habit{conflictInfo.habitsCount !== 1 ? 's' : ''}
                      </li>
                    )}
                  </ul>
                  {conflictInfo.affectedGroups.length > 0 && (
                    <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
                      <div className="text-sm font-medium text-orange-900 mb-1">Affected groups:</div>
                      <div className="text-sm text-orange-800">
                        {conflictInfo.affectedGroups.join(", ")}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 font-medium text-foreground">
                    Do you want to continue?
                  </div>
                </div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleWarningCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleWarningConfirm} className="bg-orange-600 hover:bg-orange-700">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
