"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTask, updateTask, UpdateTaskInput } from "@/lib/api/tasks";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { getTasks } from "@/lib/api/tasks";
import { Task, Group, Label } from "@/types";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function EditTaskPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [taskData, groupsData, labelsData, tasksData] = await Promise.all([
          getTask(taskId, true), // Fetch task with children for group conflict checking
          getGroups(),
          getLabels(),
          getTasks({ includeChildren: true }),
        ]);
        setTask(taskData);
        setGroups(groupsData);
        setLabels(labelsData);
        setAvailableTasks(tasksData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
    if (taskId) {
      loadData();
    }
  }, [taskId]);

  const handleSubmit = async (data: any) => {
    setSubmitting(true);
    try {
      const input: UpdateTaskInput = {
        id: taskId,
        title: data.title,
        description: data.description,
        importance: data.importance,
        progress: data.progress,
        deadline: data.deadline,
        groupId: data.groupId,
        parentId: data.parentId,
        labelIds: data.labelIds,
      };
      await updateTask(input);
      router.push(`/tasks/${taskId}`);
    } catch (error) {
      console.error("Error updating task:", error);
      // Re-throw with a user-friendly message if it's an Error
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error("Failed to update task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-2xl mx-auto">
        <p>Task not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Task</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskForm
            task={task}
            groups={groups}
            labels={labels}
            availableTasks={availableTasks}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            loading={submitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}
