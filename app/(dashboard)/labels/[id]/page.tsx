"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Edit, Trash2, Tag } from "lucide-react";
import { getLabel, deleteLabel, getLabelItems } from "@/lib/api/labels";
import { Label, Task, Habit } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
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

export default function LabelDetailPage() {
  const router = useRouter();
  const params = useParams();
  const labelId = params.id as string;
  const [label, setLabel] = useState<Label | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [labelData, itemsData] = await Promise.all([
          getLabel(labelId),
          getLabelItems(labelId),
        ]);
        setLabel(labelData);
        setTasks(itemsData.tasks || []);
        setHabits(itemsData.habits || []);
      } catch (error) {
        console.error("Error loading label:", error);
      } finally {
        setLoading(false);
      }
    }
    if (labelId) {
      loadData();
    }
  }, [labelId]);

  const handleDelete = async () => {
    try {
      await deleteLabel(labelId);
      router.push("/labels");
    } catch (error) {
      console.error("Error deleting label:", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  if (!label) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Label not found</p>
      </div>
    );
  }

  const allLeafTasks = getAllLeafTasks(tasks);
  const totalItems = tasks.length + habits.length;
  const completedItems = allLeafTasks.filter((t) => t.progress === 100).length;
  const avgTaskProgress =
    allLeafTasks.length > 0
      ? Math.round(
          allLeafTasks.reduce((acc, t) => acc + t.progress, 0) / allLeafTasks.length
        )
      : 0;
  const avgHabitProgress =
    habits.length > 0
      ? Math.round(
          habits.reduce(
            (acc, h) =>
              acc + ((h.currentCount || 0) / (h.targetCount || 1)) * 100,
            0
          ) / habits.length
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
          <Button variant="outline" onClick={() => router.push(`/labels/${labelId}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Label Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${label.color}20`,
              }}
            >
              <Tag className="w-6 h-6" style={{ color: label.color }} />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{label.name}</CardTitle>
              <p className="text-muted-foreground">{totalItems} items tagged</p>
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
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Completed</p>
              <p className="text-2xl font-semibold">{completedItems}</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Remaining</p>
              <p className="text-2xl font-semibold">{totalItems - completedItems}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Task Progress</span>
                <span className="text-sm font-medium">{avgTaskProgress}%</span>
              </div>
              <Progress value={avgTaskProgress} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Habit Progress</span>
                <span className="text-sm font-medium">{avgHabitProgress}%</span>
              </div>
              <Progress value={avgHabitProgress} className="h-2" />
            </div>
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
              {allLeafTasks.map((task) => (
                <Card
                  key={task.id}
                  className="p-3 cursor-pointer hover:border-indigo-300"
                  onClick={() => router.push(`/tasks?highlight=${task.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h5 className="text-sm font-medium flex-1">{task.title}</h5>
                    <span className="text-sm text-muted-foreground ml-2">
                      {task.progress}%
                    </span>
                  </div>
                  <Progress value={task.progress} className="h-1.5 mb-2" />
                  {task.labels && task.labels.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {task.labels.map((l) => (
                        <Badge
                          key={l.id}
                          variant="secondary"
                          className="text-xs"
                          style={{
                            backgroundColor: `${l.color}20`,
                            color: l.color,
                          }}
                        >
                          {l.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
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
            <div className="space-y-2">
              {habits.map((habit) => {
                const progress =
                  habit.currentCount && habit.targetCount
                    ? Math.round((habit.currentCount / habit.targetCount) * 100)
                    : 0;
                return (
                  <Card
                    key={habit.id}
                    className="p-3 cursor-pointer hover:border-indigo-300"
                    onClick={() => router.push(`/habits?highlight=${habit.id}`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h5 className="text-sm font-medium mb-1">{habit.title}</h5>
                        <Badge variant="secondary" className="text-xs">
                          {habit.type}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground ml-2">
                        {progress}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5 mb-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {habit.currentCount || 0} / {habit.targetCount}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tasks.length === 0 && habits.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No items tagged with this label yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Start adding this label to tasks or habits
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the label.
              Items with this label will not be deleted, but will no longer have this
              label.
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
