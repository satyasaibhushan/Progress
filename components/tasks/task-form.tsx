"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { format } from "date-fns";

const formSchema = createTaskSchema.extend({
  labelIds: z.array(z.string()).optional(),
});

type TaskFormData = z.infer<typeof formSchema>;

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
    resolver: zodResolver(formSchema),
    defaultValues: task
      ? {
          title: task.title,
          description: task.description || "",
          importance: task.importance,
          progress: task.progress,
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
    // Remove progress from data if it's a non-leaf task (progress is auto-calculated)
    if (isNonLeafTask && 'progress' in data) {
      const { progress, ...dataWithoutProgress } = data;
      await onSubmit(dataWithoutProgress as TaskFormData);
    } else {
      await onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
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

      {/* Deadline */}
      <div>
        <FormLabel>Deadline</FormLabel>
        <DatePicker
          date={watch("deadline") ? new Date(watch("deadline")!) : undefined}
          onSelect={(date) =>
            setValue("deadline", date ? date.toISOString() : undefined)
          }
          placeholder="Pick a deadline"
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
          {loading ? "Saving..." : task ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </form>
  );
}
