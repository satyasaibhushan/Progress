"use client";

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
import { DateBoundsConflictInfo } from "./task-form-helpers";

interface DateBoundsWarningDialogProps {
  open: boolean;
  conflictInfo: DateBoundsConflictInfo | null;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onContinue: () => void | Promise<void>;
}

export function DateBoundsWarningDialog({
  open,
  conflictInfo,
  onOpenChange,
  onCancel,
  onContinue,
}: DateBoundsWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Date Update Warning</AlertDialogTitle>
          {conflictInfo && (
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  Updating this parent task date range will adjust child items that fall outside the new bounds:
                </div>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {conflictInfo.childTasksCount > 0 && (
                    <li>
                      <strong>{conflictInfo.childTasksCount}</strong> child task
                      {conflictInfo.childTasksCount !== 1 ? "s" : ""}
                    </li>
                  )}
                  {conflictInfo.habitsCount > 0 && (
                    <li>
                      <strong>{conflictInfo.habitsCount}</strong> linked habit
                      {conflictInfo.habitsCount !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
                <div className="mt-3 font-medium text-foreground">
                  Continue and apply these date changes?
                </div>
              </div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
