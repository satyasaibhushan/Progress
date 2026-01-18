"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import { getGroup, deleteGroup, getGroupItems, updateGroup, UpdateGroupInput } from "@/lib/api/groups";
import { getGroups } from "@/lib/api/groups";
import { Group, Task, Habit } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { TasksHabitsTree } from "@/components/shared/tasks-habits-tree";
import { GroupForm } from "@/components/groups/group-form";
import { useSearchParams } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function getAllLeafTasks(tasks: Task[]): Task[] {
  const leafTasks: Task[] = [];
  const traverse = (taskList: Task[]) => {
    taskList.forEach((task) => {
      if (task.children && task.children.length > 0) {
        traverse(task.children);
      } else {
        leafTasks.push(task);
      }
    });
  };
  traverse(tasks);
  return leafTasks;
}

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const groupId = params.id as string;
  const [group, setGroup] = useState<Group | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const highlightedTaskId = searchParams.get("highlightTask");
  const highlightedHabitId = searchParams.get("highlightHabit");

  useEffect(() => {
    async function loadData() {
      try {
        const [groupData, itemsData, groupsData] = await Promise.all([
          getGroup(groupId),
          getGroupItems(groupId),
          getGroups(),
        ]);
        setGroup(groupData);
        setTasks(itemsData.tasks);
        setHabits(itemsData.habits);
        setGroups(groupsData);
      } catch (error) {
        console.error("Error loading group:", error);
      } finally {
        setLoading(false);
      }
    }
    if (groupId) {
      loadData();
    }
  }, [groupId]);

  const handleDelete = async () => {
    try {
      await deleteGroup(groupId);
      router.push("/groups");
    } catch (error) {
      console.error("Error deleting group:", error);
    }
  };

  const handleEdit = async (data: any) => {
    if (!group) return;
    setSaving(true);
    try {
      const input: UpdateGroupInput = {
        id: groupId,
        name: data.name,
        description: data.description,
        color: data.color,
      };
      await updateGroup(input);
      const [groupData, groupsData] = await Promise.all([
        getGroup(groupId),
        getGroups(),
      ]);
      setGroup(groupData);
      setGroups(groupsData);
      setEditingGroup(false);
    } catch (error) {
      console.error("Error updating group:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Group not found</p>
      </div>
    );
  }

  const allLeafTasks = getAllLeafTasks(tasks);
  
  // Helper function to calculate habit progress
  const getHabitProgress = (habit: Habit): number => {
    if (habit.habitLogs && habit.habitLogs.length > 0) {
      const totalCount = habit.habitLogs.reduce((sum, log) => sum + log.count, 0);
      if (habit.targetCount > 0) {
        return Math.min(100, Math.round((totalCount / habit.targetCount) * 100));
      }
    } else if (habit.currentCount !== undefined && habit.targetCount) {
      return Math.min(100, Math.round((habit.currentCount / habit.targetCount) * 100));
    }
    return 0;
  };
  
  // Calculate weighted progress for overall average
  let totalWeight = 0;
  let weightedProgress = 0;
  
  const rootTasks = tasks.filter((t) => !t.parentId);
  for (const task of rootTasks) {
    const isLeaf = !task.children || task.children.length === 0;
    if (isLeaf) {
      const taskProgress = Math.min(100, Math.max(0, task.progress || 0));
      totalWeight += task.importance;
      weightedProgress += taskProgress * task.importance;
    } else if (task.total_weight && task.weighted_progress) {
      // weighted_progress is already the sum of (progress * importance) for all children
      // total_weight is the sum of importance for all children
      // So we can use them directly without recalculating
      const taskWeight = Number(task.total_weight);
      const taskWeightedProgress = Number(task.weighted_progress);
      if (taskWeight > 0) {
        totalWeight += taskWeight;
        weightedProgress += taskWeightedProgress;
      }
    }
  }
  
  // Get task IDs to exclude linked habits from root habits calculation
  const taskIds = new Set(tasks.map((t) => t.id));
  const rootHabits = habits.filter((h) => !h.parentTaskId && !taskIds.has(h.parentTaskId || ""));
  for (const habit of rootHabits) {
    const habitProgress = getHabitProgress(habit);
    totalWeight += habit.importance;
    weightedProgress += habitProgress * habit.importance;
  }
  
  // Ensure progress is between 0-100
  // weighted_progress is sum of (progress * importance) where progress is 0-100
  // total_weight is sum of importance
  // So weightedProgress / totalWeight gives us average progress (0-100)
  const avgProgress = totalWeight > 0 
    ? Math.min(100, Math.max(0, Math.round(weightedProgress / totalWeight))) 
    : 0;
  
  // Calculate task progress (weighted average of leaf tasks)
  let taskTotalWeight = 0;
  let taskWeightedProgress = 0;
  for (const task of allLeafTasks) {
    taskTotalWeight += task.importance;
    taskWeightedProgress += (task.progress || 0) * task.importance;
  }
  const taskProgress = taskTotalWeight > 0
    ? Math.round(taskWeightedProgress / taskTotalWeight)
    : 0;
  
  // Calculate habit progress (weighted average of all habits)
  let habitTotalWeight = 0;
  let habitWeightedProgress = 0;
  for (const habit of habits) {
    const habitProgress = getHabitProgress(habit);
    habitTotalWeight += habit.importance;
    habitWeightedProgress += habitProgress * habit.importance;
  }
  const habitProgress = habitTotalWeight > 0
    ? Math.round(habitWeightedProgress / habitTotalWeight)
    : 0;
  
  // Calculate completed counts
  const completedTasks = allLeafTasks.filter((t) => t.progress === 100).length;
  const completedHabits = habits.filter((h) => getHabitProgress(h) >= 100).length;
  const totalCompleted = completedTasks + completedHabits;
  const totalRemaining = allLeafTasks.length + habits.length - totalCompleted;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/groups/${groupId}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Group Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: group.color ? `${group.color}20` : "#f3f4f6",
              }}
            >
              <div
                className="w-8 h-8 rounded"
                style={{ backgroundColor: group.color || "#6b7280" }}
              />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{group.name}</CardTitle>
              {group.description && (
                <p className="text-muted-foreground">{group.description}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Tasks</p>
              <p className="text-2xl font-semibold">{allLeafTasks.length}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Habits</p>
              <p className="text-2xl font-semibold">{habits.length}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Completed</p>
              <p className="text-2xl font-semibold">{totalCompleted}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Remaining</p>
              <p className="text-2xl font-semibold">{totalRemaining}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Task Progress</span>
                <span className="text-xs font-medium">{taskProgress}%</span>
              </div>
              <UnifiedProgressBar
                value={taskProgress}
                interactive={false}
                showPercentageOnHover={false}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Habit Progress</span>
                <span className="text-xs font-medium">{habitProgress}%</span>
              </div>
              <UnifiedProgressBar
                value={habitProgress}
                interactive={false}
                showPercentageOnHover={false}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks and Habits */}
      {(tasks.length > 0 || habits.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Tasks & Habits</CardTitle>
          </CardHeader>
          <CardContent>
            <TasksHabitsTree
              tasks={tasks}
              habits={habits}
              groups={groups}
              onTaskClick={(taskId) => router.push(`/tasks?highlight=${taskId}`)}
              onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
              highlightedTaskId={highlightedTaskId}
              highlightedHabitId={highlightedHabitId}
              showCounts={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit Group Dialog */}
      <Dialog open={editingGroup} onOpenChange={setEditingGroup}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {group && (
            <GroupForm
              group={group}
              onSubmit={handleEdit}
              onCancel={() => setEditingGroup(false)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the group.
              Tasks and habits in this group will not be deleted, but will no longer
              be associated with this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
