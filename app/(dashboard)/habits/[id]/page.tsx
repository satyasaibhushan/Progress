"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Edit, Trash2, Check, Flame, ListTodo, ArrowRight } from "lucide-react";
import { getHabit, deleteHabit } from "@/lib/api/habits";
import { getHabitLogs, logHabit } from "@/lib/api/habits";
import { getTasks } from "@/lib/api/tasks";
import { Habit, Task, HabitLog } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ImportanceIndicator } from "@/components/shared/importance-indicator";
import { HabitCalendar } from "@/components/habits/habit-calendar";
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

export default function HabitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const habitId = params.id as string;
  const [habit, setHabit] = useState<Habit | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [habitData, logsData, tasksData] = await Promise.all([
          getHabit(habitId),
          getHabitLogs(habitId),
          getTasks({ includeChildren: true }),
        ]);
        setHabit(habitData);
        setLogs(logsData);
        setTasks(tasksData);
      } catch (error) {
        console.error("Error loading habit:", error);
      } finally {
        setLoading(false);
      }
    }
    if (habitId) {
      loadData();
    }
  }, [habitId]);

  const handleLogToday = async () => {
    if (!habit) return;
    setLogging(true);
    try {
      await logHabit(habit.id);
      // Reload data
      const [habitData, logsData] = await Promise.all([
        getHabit(habitId),
        getHabitLogs(habitId),
      ]);
      setHabit(habitData);
      setLogs(logsData);
    } catch (error) {
      console.error("Error logging habit:", error);
    } finally {
      setLogging(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHabit(habitId);
      router.push("/habits");
    } catch (error) {
      console.error("Error deleting habit:", error);
    }
  };

  const getLinkedTask = (): Task | undefined => {
    if (!habit?.parentTaskId) return undefined;
    const findTask = (taskList: Task[]): Task | undefined => {
      for (const task of taskList) {
        if (task.id === habit.parentTaskId) return task;
        if (task.children) {
          const found = findTask(task.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return findTask(tasks);
  };

  const calculateStreak = (): number => {
    return logs.length > 0 ? Math.min(logs.length, 30) : 0;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  if (!habit) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Habit not found</p>
      </div>
    );
  }

  const progress =
    habit.currentCount && habit.targetCount
      ? Math.round((habit.currentCount / habit.targetCount) * 100)
      : 0;
  const streak = calculateStreak();
  const linkedTask = getLinkedTask();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/habits/${habitId}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Habit Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-2xl">{habit.title}</CardTitle>
                {streak > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-lg">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span className="text-sm text-orange-700">{streak} day streak</span>
                  </div>
                )}
              </div>
              {habit.description && (
                <p className="text-muted-foreground mb-2">{habit.description}</p>
              )}
              {linkedTask && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/tasks/${linkedTask.id}`)}
                  className="mt-2"
                >
                  <ListTodo className="w-4 h-4 mr-2" />
                  Linked to: {linkedTask.title}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
            <Button
              onClick={handleLogToday}
              disabled={logging}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              {logging ? "Logging..." : "Log Today"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Overview */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-sm font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3 mb-3" />
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current</p>
                <p className="text-lg font-semibold">{habit.currentCount || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Target</p>
                <p className="text-lg font-semibold">{habit.targetCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Remaining</p>
                <p className="text-lg font-semibold">
                  {habit.targetCount - (habit.currentCount || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Calendar */}
          <HabitCalendar habit={habit} logs={logs} />

          {/* Labels & Importance */}
          <div className="flex items-center justify-between pt-4 border-t">
            {habit.labels && habit.labels.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Labels</p>
                <div className="flex gap-2">
                  {habit.labels.map((label) => (
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Importance:</span>
              <ImportanceIndicator importance={habit.importance} size="md" showValue />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the habit
              and all its logs.
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
