"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useHeaderAction } from "../layout";
import { Plus } from "lucide-react";
import { getGroups } from "@/lib/api/groups";
import { getTasks } from "@/lib/api/tasks";
import { getHabits } from "@/lib/api/habits";
import { getLabels } from "@/lib/api/labels";
import { createGroup, updateGroup, deleteGroup } from "@/lib/api/groups";
import { Group, Task, Habit, Label } from "@/types";
import { GroupCard } from "@/components/groups/group-card";
import { GroupForm } from "@/components/groups/group-form";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Folder } from "lucide-react";
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
import { getHabitLogs } from "@/lib/api/habits";

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

// Calculate progress for a task (handles parent tasks)
function calculateTaskProgress(task: Task & { total_weight?: string; weighted_progress?: string }): number {
  if (!task.children || task.children.length === 0) {
    return task.progress || 0;
  }
  
  if (task.total_weight && task.weighted_progress) {
    const totalWeight = Number(task.total_weight);
    const weightedProgress = Number(task.weighted_progress);
    if (totalWeight > 0) {
      return Math.round((weightedProgress / totalWeight) * 100);
    }
  }
  
  return 0;
}

// Calculate habit progress
async function calculateHabitProgress(habit: Habit): Promise<number> {
  try {
    const logs = await getHabitLogs(habit.id);
    const totalCount = logs.reduce((sum, log) => sum + log.count, 0);
    if (habit.targetCount === 0) return 0;
    return Math.min(100, Math.round((totalCount / habit.targetCount) * 100));
  } catch (error) {
    console.error("Error calculating habit progress:", error);
    return 0;
  }
}

// Calculate group progress
async function calculateGroupProgress(
  groupId: string,
  tasks: Task[],
  habits: Habit[]
): Promise<{ progress: number; taskCount: number; habitCount: number }> {
  const groupTasks = tasks.filter((t) => t.groupId === groupId && !t.parentId);
  const groupHabits = habits.filter((h) => h.groupId === groupId && !h.parentTaskId);

  let totalWeight = 0;
  let weightedProgress = 0;

  // Add task contributions
  for (const task of groupTasks) {
    const taskProgress = calculateTaskProgress(task as Task & { total_weight?: string; weighted_progress?: string });
    const isLeaf = !task.children || task.children.length === 0;
    
    if (isLeaf) {
      totalWeight += task.importance;
      weightedProgress += taskProgress * task.importance;
    } else if (task.total_weight && task.weighted_progress) {
      totalWeight += Number(task.total_weight);
      weightedProgress += Number(task.weighted_progress);
    }
  }

  // Add habit contributions
  for (const habit of groupHabits) {
    const habitProgress = await calculateHabitProgress(habit);
    totalWeight += habit.importance;
    weightedProgress += habitProgress * habit.importance;
  }

  const progress = totalWeight > 0 ? Math.round((weightedProgress / totalWeight) * 100) : 0;
  const allLeafTasks = getAllLeafTasks(groupTasks);
  
  return {
    progress,
    taskCount: allLeafTasks.length,
    habitCount: groupHabits.length,
  };
}

export default function GroupsPage() {
  const { setHeaderSubtitle } = useHeaderAction();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupProgress, setGroupProgress] = useState<Record<string, { progress: number; taskCount: number; habitCount: number }>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const [groupsData, tasksData, habitsData, labelsData] = await Promise.all([
          getGroups(),
          getTasks({ includeChildren: true }),
          getHabits(),
          getLabels(),
        ]);
        setGroups(groupsData);
        setTasks(tasksData);
        setHabits(habitsData);
        setLabels(labelsData);
      } catch (error) {
        console.error("Error loading groups:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Set header subtitle with total count
  useEffect(() => {
    setHeaderSubtitle(groups.length > 0 ? `${groups.length} total` : null);
    return () => setHeaderSubtitle(null);
  }, [setHeaderSubtitle, groups.length]);

  // Calculate progress for all groups
  useEffect(() => {
    async function calculateProgresses() {
      const progresses: Record<string, { progress: number; taskCount: number; habitCount: number }> = {};
      for (const group of groups) {
        const result = await calculateGroupProgress(group.id, tasks, habits);
        progresses[group.id] = result;
      }
      setGroupProgress(progresses);
    }
    if (groups.length > 0 && tasks.length >= 0 && habits.length >= 0) {
      calculateProgresses();
    }
  }, [groups, tasks, habits]);

  const handleCreate = async (data: any) => {
    setSaving(true);
    try {
      await createGroup(data);
      const groupsData = await getGroups();
      setGroups(groupsData);
      setCreatingGroup(false);
    } catch (error) {
      console.error("Error creating group:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: any) => {
    if (!editingGroup) return;
    setSaving(true);
    try {
      await updateGroup({ id: editingGroup.id, ...data });
      const groupsData = await getGroups();
      setGroups(groupsData);
      setEditingGroup(null);
    } catch (error) {
      console.error("Error updating group:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;
    try {
      await deleteGroup(deletingGroup.id);
      setGroups(groups.filter((g) => g.id !== deletingGroup.id));
      setDeletingGroup(null);
    } catch (error) {
      console.error("Error deleting group:", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <Button onClick={() => setCreatingGroup(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Group
        </Button>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No groups yet"
          description="Create groups to organize your tasks and habits"
          action={{
            label: "Create Group",
            onClick: () => setCreatingGroup(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => {
            const progress = groupProgress[group.id] || { progress: 0, taskCount: 0, habitCount: 0 };

            return (
              <GroupCard
                key={group.id}
                group={group}
                taskCount={progress.taskCount}
                habitCount={progress.habitCount}
                avgProgress={progress.progress}
                onClick={() => router.push(`/groups/${group.id}`)}
                onEdit={() => setEditingGroup(group)}
                onDelete={() => setDeletingGroup(group)}
              />
            );
          })}
        </div>
      )}

      {/* Create Group Dialog */}
      <Dialog open={creatingGroup} onOpenChange={setCreatingGroup}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <GroupForm
            onSubmit={handleCreate}
            onCancel={() => setCreatingGroup(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {editingGroup && (
            <GroupForm
              group={editingGroup}
              onSubmit={handleEdit}
              onCancel={() => setEditingGroup(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
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
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
