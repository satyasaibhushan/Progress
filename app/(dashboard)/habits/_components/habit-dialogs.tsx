"use client";

import { Group, Habit, Label, Task } from "@/types";
import { HabitForm } from "@/components/habits/habit-form";
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
import { HabitFormPayload } from "../_lib/habit-page-helpers";

interface HabitDialogsProps {
  creatingHabit: boolean;
  setCreatingHabit: (open: boolean) => void;
  editingHabit: Habit | null;
  setEditingHabit: (habit: Habit | null) => void;
  deletingHabit: Habit | null;
  setDeletingHabit: (habit: Habit | null) => void;
  groups: Group[];
  labels: Label[];
  tasks: Task[];
  saving: boolean;
  onCreate: (data: HabitFormPayload) => Promise<void>;
  onEdit: (data: HabitFormPayload) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function HabitDialogs({
  creatingHabit,
  setCreatingHabit,
  editingHabit,
  setEditingHabit,
  deletingHabit,
  setDeletingHabit,
  groups,
  labels,
  tasks,
  saving,
  onCreate,
  onEdit,
  onDelete,
}: HabitDialogsProps) {
  return (
    <>
      <Dialog open={creatingHabit} onOpenChange={setCreatingHabit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Habit</DialogTitle>
          </DialogHeader>
          <HabitForm
            groups={groups}
            labels={labels}
            availableTasks={tasks}
            onSubmit={onCreate}
            onCancel={() => setCreatingHabit(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingHabit} onOpenChange={(open) => !open && setEditingHabit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Habit</DialogTitle>
          </DialogHeader>
          {editingHabit && (
            <HabitForm
              habit={editingHabit}
              groups={groups}
              labels={labels}
              availableTasks={tasks}
              onSubmit={onEdit}
              onCancel={() => setEditingHabit(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingHabit} onOpenChange={(open) => !open && setDeletingHabit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the habit and all its logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
