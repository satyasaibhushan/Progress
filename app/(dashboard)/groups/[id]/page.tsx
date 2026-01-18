"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import { getGroup, deleteGroup } from "@/lib/api/groups";
import { getTasks } from "@/lib/api/tasks";
import { getHabits } from "@/lib/api/habits";
import { Group, Task, Habit } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { TaskCard } from "@/components/tasks/task-card";
import { HabitCard } from "@/components/habits/habit-card";
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
  const groupId = params.id as string;
  const [group, setGroup] = useState<Group | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [groupData, tasksData, habitsData] = await Promise.all([
          getGroup(groupId),
          getTasks({ includeChildren: true, groupId }),
          getHabits({ groupId }),
        ]);
        setGroup(groupData);
        setTasks(tasksData);
        setHabits(habitsData);
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
  const avgProgress =
    allLeafTasks.length > 0
      ? Math.round(
          allLeafTasks.reduce((acc, t) => acc + t.progress, 0) / allLeafTasks.length
        )
      : 0;

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
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Tasks</p>
              <p className="text-2xl font-semibold">{allLeafTasks.length}</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Habits</p>
              <p className="text-2xl font-semibold">{habits.length}</p>
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Average Progress</span>
              <span className="font-medium">{avgProgress}%</span>
            </div>
            <Progress
              value={avgProgress}
              className="h-2"
              style={
                group.color
                  ? {
                      ["--progress-background" as string]: group.color,
                    }
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tasks ({allLeafTasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  group={group}
                  onClick={() => router.push(`/tasks?highlight=${task.id}`)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Habits */}
      {habits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Habits ({habits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {habits.map((habit) => {
                const progress =
                  habit.currentCount && habit.targetCount
                    ? Math.round((habit.currentCount / habit.targetCount) * 100)
                    : 0;
                return (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    group={group}
                    onClick={() => router.push(`/habits?highlight=${habit.id}`)}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
