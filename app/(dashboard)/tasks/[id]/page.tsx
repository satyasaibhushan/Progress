"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import { getTask } from "@/lib/api/tasks";
import { deleteTask } from "@/lib/api/tasks";
import { Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { format } from "date-fns";
import { TaskTree } from "@/components/tasks/task-tree";
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

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadTask() {
      try {
        const taskData = await getTask(taskId);
        setTask(taskData);
      } catch (error) {
        console.error("Error loading task:", error);
      } finally {
        setLoading(false);
      }
    }
    if (taskId) {
      loadTask();
    }
  }, [taskId]);

  const handleDelete = async () => {
    try {
      await deleteTask(taskId);
      router.push("/tasks");
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Task not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Task Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{task.title}</CardTitle>
              {task.description && (
                <p className="text-muted-foreground">{task.description}</p>
              )}
            </div>
            <ImportanceIndicator importance={task.importance} size="lg" showValue />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{task.progress}%</span>
            </div>
            <Progress value={task.progress} className="h-2" />
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-4">
            {task.deadline && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Deadline</p>
                <p className="text-sm font-medium">
                  {format(new Date(task.deadline), "PPP")}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Importance</p>
              <p className="text-sm font-medium">{task.importance}/100</p>
            </div>
          </div>

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Labels</p>
              <div className="flex gap-2 flex-wrap">
                {task.labels.map((label) => (
                  <Badge
                    key={label.id}
                    variant="secondary"
                    style={{
                      backgroundColor: `${label.color}20`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Child Tasks */}
          {task.children && task.children.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Subtasks</p>
              <TaskTree tasks={task.children} groups={[]} />
            </div>
          )}

          {/* Linked Habits */}
          {task.habits && task.habits.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Linked Habits</p>
              <div className="space-y-2">
                {task.habits.map((habit) => {
                  const progress = habit.currentCount && habit.targetCount
                    ? Math.round((habit.currentCount / habit.targetCount) * 100)
                    : 0;
                  return (
                    <Card
                      key={habit.id}
                      className="p-3 cursor-pointer hover:border-indigo-300"
                      onClick={() => router.push(`/habits/${habit.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{habit.title}</p>
                          <p className="text-xs text-muted-foreground">{habit.type}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{progress}%</p>
                          <p className="text-xs text-muted-foreground">
                            {habit.currentCount || 0} / {habit.targetCount}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the task
              and all its subtasks.
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
