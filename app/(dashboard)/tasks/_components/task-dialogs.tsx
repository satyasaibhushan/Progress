"use client";

import { Group, Label, Task } from "@/types";
import { HabitForm } from "@/components/habits/habit-form";
import { TaskForm } from "@/components/tasks/task-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface TaskFormValues {
  title: string;
  importance: number;
  description?: string;
  progress?: number;
  startDate?: string | null;
  deadline?: string | null;
  groupId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
}

interface HabitFormValues {
  title: string;
  description?: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  targetCount?: number | null;
  countPerPeriod?: number;
  maxCountPerDay?: number;
  importance?: number;
  startDate?: string | null;
  endDate?: string | null;
  activeDays?: number[] | null;
  groupId?: string | null;
  parentTaskId?: string | null;
  labelIds?: string[];
}

interface TaskDialogsProps {
  creatingTask: boolean;
  setCreatingTask: (open: boolean) => void;
  creatingTaskWithParent: Task | null;
  setCreatingTaskWithParent: (task: Task | null) => void;
  creatingHabitWithParent: Task | null;
  setCreatingHabitWithParent: (task: Task | null) => void;
  editingTask: Task | null;
  setEditingTask: (task: Task | null) => void;
  deletingTask: Task | null;
  setDeletingTask: (task: Task | null) => void;
  progressOverwriteWarning: {
    parentTask: Task;
    childType: "task" | "habit";
  } | null;
  setProgressOverwriteWarning: (
    warning: {
      parentTask: Task;
      childType: "task" | "habit";
    } | null
  ) => void;
  groups: Group[];
  labels: Label[];
  availableTasks: Task[];
  saving: boolean;
  onCreateTask: (data: TaskFormValues) => Promise<void>;
  onCreateHabit: (data: HabitFormValues) => Promise<void>;
  onEditTask: (data: TaskFormValues) => Promise<void>;
  onDeleteTask: () => Promise<void>;
  onOpenChildCreateDialog: (task: Task, childType: "task" | "habit") => void;
}

export function TaskDialogs({
  creatingTask,
  setCreatingTask,
  creatingTaskWithParent,
  setCreatingTaskWithParent,
  creatingHabitWithParent,
  setCreatingHabitWithParent,
  editingTask,
  setEditingTask,
  deletingTask,
  setDeletingTask,
  progressOverwriteWarning,
  setProgressOverwriteWarning,
  groups,
  labels,
  availableTasks,
  saving,
  onCreateTask,
  onCreateHabit,
  onEditTask,
  onDeleteTask,
  onOpenChildCreateDialog,
}: TaskDialogsProps) {
  return (
    <>
      <Dialog
        open={creatingTask || !!creatingTaskWithParent}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingTask(false);
            setCreatingTaskWithParent(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <TaskForm
            groups={groups}
            labels={labels}
            availableTasks={availableTasks}
            initialParentId={creatingTaskWithParent?.id}
            onSubmit={onCreateTask}
            onCancel={() => {
              setCreatingTask(false);
              setCreatingTaskWithParent(null);
            }}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!creatingHabitWithParent}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingHabitWithParent(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Habit</DialogTitle>
          </DialogHeader>
          <HabitForm
            groups={groups}
            labels={labels}
            availableTasks={availableTasks}
            initialParentTaskId={creatingHabitWithParent?.id}
            onSubmit={onCreateHabit}
            onCancel={() => setCreatingHabitWithParent(null)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              task={editingTask}
              groups={groups}
              labels={labels}
              availableTasks={availableTasks}
              onSubmit={onEditTask}
              onCancel={() => setEditingTask(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the task
              {deletingTask?.children && deletingTask.children.length > 0 && (
                <> and all {deletingTask.children.length} child task{deletingTask.children.length > 1 ? "s" : ""}</>
              )}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDeleteTask} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!progressOverwriteWarning}
        onOpenChange={(open) => !open && setProgressOverwriteWarning(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manual progress will be overwritten</AlertDialogTitle>
            <AlertDialogDescription>
              {progressOverwriteWarning ? (
                <>
                  This task currently has manual progress at{" "}
                  <strong>{Math.round(progressOverwriteWarning.parentTask.progress || 0)}%</strong>.
                  Adding a sub-{progressOverwriteWarning.childType} will replace manual progress with
                  aggregated progress from child items. Continue?
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!progressOverwriteWarning) return;
                onOpenChildCreateDialog(progressOverwriteWarning.parentTask, progressOverwriteWarning.childType);
                setProgressOverwriteWarning(null);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
