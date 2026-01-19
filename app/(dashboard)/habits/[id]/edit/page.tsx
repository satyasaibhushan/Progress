"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getHabit, updateHabit, UpdateHabitInput } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { getTasks } from "@/lib/api/tasks";
import { Habit, Group, Label, Task } from "@/types";
import { HabitForm } from "@/components/habits/habit-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function EditHabitPage() {
  const router = useRouter();
  const params = useParams();
  const habitId = params.id as string;
  const [habit, setHabit] = useState<Habit | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [habitData, groupsData, labelsData, tasksData] = await Promise.all([
          getHabit(habitId),
          getGroups(),
          getLabels(),
          getTasks({ includeChildren: true }),
        ]);
        setHabit(habitData);
        setGroups(groupsData);
        setLabels(labelsData);
        setAvailableTasks(tasksData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
    if (habitId) {
      loadData();
    }
  }, [habitId]);

  const handleSubmit = async (data: any) => {
    setSubmitting(true);
    try {
      const input: UpdateHabitInput = {
        id: habitId,
        title: data.title,
        description: data.description,
        type: data.type,
        targetCount: data.targetCount,
        importance: data.importance,
        endDate: data.endDate,
        activeDays: data.activeDays,
        groupId: data.groupId,
        parentTaskId: data.parentTaskId,
        labelIds: data.labelIds,
      };
      await updateHabit(input);
      router.push(`/habits/${habitId}`);
    } catch (error) {
      console.error("Error updating habit:", error);
      // Re-throw with a user-friendly message if it's an Error
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error("Failed to update habit. Please try again.");
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

  if (!habit) {
    return (
      <div className="max-w-2xl mx-auto">
        <p>Habit not found</p>
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
          <CardTitle>Edit Habit</CardTitle>
        </CardHeader>
        <CardContent>
          <HabitForm
            habit={habit}
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
