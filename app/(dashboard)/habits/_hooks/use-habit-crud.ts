"use client";

import { useCallback, useState } from "react";
import { createHabit, deleteHabit, getHabit, updateHabit } from "@/lib/api/habits";
import type { CreateHabitInput, UpdateHabitInput } from "@/lib/api/habits";
import { Habit, HabitLog } from "@/types";
import { HabitFormPayload } from "../_lib/habit-page-helpers";

interface UseHabitCrudProps {
  editingHabit: Habit | null;
  deletingHabit: Habit | null;
  selectedHabit: Habit | null;
  setSelectedHabit: (habit: Habit | null) => void;
  setSelectedHabitLogs: (logs: HabitLog[]) => void;
  setCreatingHabit: (open: boolean) => void;
  setEditingHabit: (habit: Habit | null) => void;
  setDeletingHabit: (habit: Habit | null) => void;
  refreshInitializedHabitPages: () => Promise<void>;
}

export function useHabitCrud({
  editingHabit,
  deletingHabit,
  selectedHabit,
  setSelectedHabit,
  setSelectedHabitLogs,
  setCreatingHabit,
  setEditingHabit,
  setDeletingHabit,
  refreshInitializedHabitPages,
}: UseHabitCrudProps) {
  const [saving, setSaving] = useState(false);

  const handleCreate = useCallback(async (data: HabitFormPayload) => {
    setSaving(true);
    try {
      if (data.targetCount == null || data.importance == null) {
        throw new Error("Missing required habit fields");
      }
      const createData: CreateHabitInput = {
        title: data.title,
        type: data.type,
        targetCount: data.targetCount,
        countPerPeriod: data.countPerPeriod,
        maxCountPerDay: data.maxCountPerDay,
        importance: data.importance,
        description: data.description,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
        activeDays: data.activeDays ?? undefined,
        groupId: data.groupId || undefined,
        parentTaskId: data.parentTaskId || undefined,
        labelIds: data.labelIds,
      };
      await createHabit(createData);
      await refreshInitializedHabitPages();
      setCreatingHabit(false);
    } catch (error) {
      console.error("Error creating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [refreshInitializedHabitPages, setCreatingHabit]);

  const handleEdit = useCallback(async (data: HabitFormPayload) => {
    if (!editingHabit) return;
    setSaving(true);
    try {
      if (data.targetCount == null || data.importance == null) {
        throw new Error("Missing required habit fields");
      }
      const updateData: UpdateHabitInput = {
        id: editingHabit.id,
        title: data.title,
        type: data.type,
        targetCount: data.targetCount,
        countPerPeriod: data.countPerPeriod,
        maxCountPerDay: data.maxCountPerDay,
        importance: data.importance,
        description: data.description,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
        activeDays: data.activeDays ?? undefined,
        groupId: data.groupId || undefined,
        parentTaskId: data.parentTaskId || undefined,
        labelIds: data.labelIds,
      };
      await updateHabit(updateData);
      const updatedHabit = await getHabit(editingHabit.id);
      setSelectedHabit(updatedHabit);
      await refreshInitializedHabitPages();
      setEditingHabit(null);
    } catch (error) {
      console.error("Error updating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [editingHabit, refreshInitializedHabitPages, setEditingHabit, setSelectedHabit]);

  const handleDelete = useCallback(async () => {
    if (!deletingHabit) return;
    try {
      await deleteHabit(deletingHabit.id);
      if (deletingHabit.id === selectedHabit?.id) {
        setSelectedHabit(null);
        setSelectedHabitLogs([]);
      }
      await refreshInitializedHabitPages();
      setDeletingHabit(null);
    } catch (error) {
      console.error("Error deleting habit:", error);
    }
  }, [deletingHabit, selectedHabit, setSelectedHabit, setSelectedHabitLogs, refreshInitializedHabitPages, setDeletingHabit]);

  return {
    saving,
    handleCreate,
    handleEdit,
    handleDelete,
  };
}
