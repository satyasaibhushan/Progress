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
import { GroupConflictInfo } from "./task-form-helpers";

interface GroupOverrideWarningDialogProps {
  open: boolean;
  conflictInfo: GroupConflictInfo | null;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onContinue: () => void | Promise<void>;
}

export function GroupOverrideWarningDialog({
  open,
  conflictInfo,
  onOpenChange,
  onCancel,
  onContinue,
}: GroupOverrideWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
                      <strong>{conflictInfo.childTasksCount}</strong> sub-task{conflictInfo.childTasksCount !== 1 ? "s" : ""} (at all levels)
                    </li>
                  )}
                  {conflictInfo.habitsCount > 0 && (
                    <li>
                      <strong>{conflictInfo.habitsCount}</strong> linked habit{conflictInfo.habitsCount !== 1 ? "s" : ""}
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
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue} className="bg-orange-600 hover:bg-orange-700">
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
