"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useHeaderAction } from "../../layout";
import { Plus, CheckSquare } from "lucide-react";
import {
  getTasks,
  updateTask,
  deleteTask,
  createTask,
  CreateTaskInput,
  TaskStatus,
} from "@/lib/api/tasks";
import { createHabit } from "@/lib/api/habits";
import type { CreateHabitInput } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { Task, Group, Label } from "@/types";
import { Button } from "@/components/ui/button";
import { useDayRollover } from "@/lib/use-day-rollover";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  isTaskCompleted,
  TASK_STATUSES,
} from "../_lib/task-page-helpers";
import { useTaskPages } from "../_hooks/use-task-pages";
import { useTaskHighlighting } from "../_hooks/use-task-highlighting";
import { TaskTabsPanel } from "./task-tabs-panel";
import { TaskDialogs } from "./task-dialogs";

export function TasksPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setHeaderRightAction } = useHeaderAction();

  const highlightTaskId = searchParams.get("highlight");
  const highlightedHabitId = searchParams.get("highlightHabit");
  const initialHighlightTaskIdRef = useRef(highlightTaskId);
  const initialHighlightedHabitIdRef = useRef(highlightedHabitId);
  const dayKey = useDayRollover();
  const previousDayKeyRef = useRef(dayKey);
  const [activeTab, setActiveTab] = useState<TaskStatus>("active");
  const { taskPages, taskPagesRef, statusCounts, loadTaskPage, refreshInitializedTaskPages } = useTaskPages(activeTab);

  const [groups, setGroups] = useState<Group[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [taskOptions, setTaskOptions] = useState<Task[]>([]);
  const [loadingTaskOptions, setLoadingTaskOptions] = useState(false);
  const [loading, setLoading] = useState(true);

  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingTaskWithParent, setCreatingTaskWithParent] = useState<Task | null>(null);
  const [creatingHabitWithParent, setCreatingHabitWithParent] = useState<Task | null>(null);
  const [progressOverwriteWarning, setProgressOverwriteWarning] = useState<{
    parentTask: Task;
    childType: "task" | "habit";
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const taskRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const ensureTaskOptionsLoaded = useCallback(async () => {
    if (taskOptions.length > 0 || loadingTaskOptions) return;
    setLoadingTaskOptions(true);
    try {
      const tasksData = await getTasks({ includeChildren: true, parentId: null, includeHabits: false });
      setTaskOptions(tasksData);
    } catch (error) {
      console.error("Error loading tasks for forms:", error);
    } finally {
      setLoadingTaskOptions(false);
    }
  }, [taskOptions.length, loadingTaskOptions]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        if (!initialHighlightTaskIdRef.current && !initialHighlightedHabitIdRef.current) {
          setActiveTab("active");
        }
        const [groupsData, labelsData] = await Promise.all([getGroups(), getLabels()]);
        setGroups(groupsData);
        setLabels(labelsData);
        if (!initialHighlightTaskIdRef.current && !initialHighlightedHabitIdRef.current) {
          await loadTaskPage("active", { reset: true });
        }
      } catch (error) {
        console.error("Error loading tasks page data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, [loadTaskPage]);

  useEffect(() => {
    if (previousDayKeyRef.current === dayKey) return;
    previousDayKeyRef.current = dayKey;
    if (loading) return;
    void refreshInitializedTaskPages();
  }, [dayKey, loading, refreshInitializedTaskPages]);

  useEffect(() => {
    const hasAnyInitializedPage = TASK_STATUSES.some((status) => taskPages[status].initialized);
    if ((highlightTaskId || highlightedHabitId) && !hasAnyInitializedPage) {
      return;
    }

    const page = taskPages[activeTab];
    if (!page.initialized && !page.loadingMore) {
      loadTaskPage(activeTab, { reset: true });
    }
  }, [activeTab, taskPages, loadTaskPage, highlightTaskId, highlightedHabitId]);

  useEffect(() => {
    const shouldLoadTaskOptions = creatingTask || !!creatingTaskWithParent || !!creatingHabitWithParent || !!editingTask;
    if (shouldLoadTaskOptions) {
      ensureTaskOptionsLoaded();
    }
  }, [creatingTask, creatingTaskWithParent, creatingHabitWithParent, editingTask, ensureTaskOptionsLoaded]);

  const allLoadedTasks = useMemo(() => {
    const map = new Map<string, Task>();
    for (const status of TASK_STATUSES) {
      for (const task of taskPages[status].items) {
        map.set(task.id, task);
      }
    }
    return Array.from(map.values());
  }, [taskPages]);

  useTaskHighlighting({
    pathname,
    highlightTaskId,
    highlightedHabitId,
    activeTab,
    setActiveTab,
    taskPages,
    taskPagesRef,
    loadTaskPage,
    taskRefs,
    expandedTasks,
    setExpandedTasks,
  });

  const handleToggleExpand = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const hasManualProgressToOverwrite = (task: Task) => {
    const childCount = task.children?.length || 0;
    const habitCount = task.habits?.length || 0;
    const progress = task.progress || 0;
    return childCount === 0 && habitCount === 0 && progress > 0;
  };

  const openChildCreateDialog = (task: Task, childType: "task" | "habit") => {
    if (childType === "task") {
      setCreatingTaskWithParent(task);
      return;
    }
    setCreatingHabitWithParent(task);
  };

  const handleAddChild = (task: Task, childType: "task" | "habit") => {
    if (hasManualProgressToOverwrite(task)) {
      setProgressOverwriteWarning({ parentTask: task, childType });
      return;
    }
    openChildCreateDialog(task, childType);
  };

  const handleCreate = async (data: {
    title: string;
    importance: number;
    description?: string;
    progress?: number;
    startDate?: string | null;
    deadline?: string | null;
    groupId?: string | null;
    parentId?: string | null;
    labelIds?: string[];
  }) => {
    const createData: CreateTaskInput = {
      title: data.title,
      importance: data.importance,
      description: data.description,
      progress: data.progress,
      startDate: data.startDate || undefined,
      deadline: data.deadline || undefined,
      groupId: data.groupId || undefined,
      parentId: data.parentId || undefined,
      labelIds: data.labelIds,
    };

    setSaving(true);
    try {
      await createTask(createData);
      await refreshInitializedTaskPages();
      setTaskOptions([]);
      setCreatingTask(false);
      setCreatingTaskWithParent(null);
    } catch (error) {
      console.error("Error creating task:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateHabit = async (data: {
    title: string;
    description?: string;
    type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    targetCount?: number | null;
    countPerPeriod?: number;
    maxCountPerDay?: number;
    importance?: number;
    startDate?: string | null;
    endDate?: string | null;
    activeDays?: number[] | null;
    groupId?: string | null;
    parentTaskId?: string | null;
    labelIds?: string[];
  }) => {
    if (data.targetCount == null || data.importance == null) {
      throw new Error("Missing required habit fields");
    }

    const createData: CreateHabitInput = {
      title: data.title,
      description: data.description,
      type: data.type,
      targetCount: data.targetCount,
      countPerPeriod: data.countPerPeriod,
      maxCountPerDay: data.maxCountPerDay,
      importance: data.importance,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      activeDays: data.activeDays ?? undefined,
      groupId: data.groupId || undefined,
      parentTaskId: data.parentTaskId || undefined,
      labelIds: data.labelIds,
    };

    setSaving(true);
    try {
      await createHabit(createData);
      await refreshInitializedTaskPages();
      setTaskOptions([]);
      setCreatingHabitWithParent(null);
    } catch (error) {
      console.error("Error creating habit:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: {
    title: string;
    importance: number;
    description?: string;
    progress?: number;
    startDate?: string | null;
    deadline?: string | null;
    groupId?: string | null;
    parentId?: string | null;
    labelIds?: string[];
  }) => {
    if (!editingTask) return;

    setSaving(true);
    try {
      await updateTask({
        id: editingTask.id,
        title: data.title,
        importance: data.importance,
        description: data.description,
        progress: data.progress,
        // PUT treats `null` as an explicit clear and `undefined` as "leave
        // unchanged". Empty form values therefore need to be sent as null
        // when editing, otherwise a user cannot unlink or clear a field.
        startDate: data.startDate ?? null,
        deadline: data.deadline ?? null,
        groupId: data.groupId ?? null,
        parentId: data.parentId ?? null,
        labelIds: data.labelIds,
      });
      await refreshInitializedTaskPages();
      setTaskOptions([]);
      setEditingTask(null);
    } catch (error) {
      console.error("Error updating task:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTask) return;

    try {
      await deleteTask(deletingTask.id);
      await refreshInitializedTaskPages();
      setTaskOptions([]);
      setDeletingTask(null);
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const handleProgressUpdate = async (taskId: string, newProgress: number) => {
    try {
      await updateTask({ id: taskId, progress: newProgress });
      // Progress updates can move a task between the active/future/completed
      // tabs and also change the aggregate progress of its ancestors. Refresh
      // every page that has already been loaded so the list and tab counters
      // stay in sync with the server response.
      await refreshInitializedTaskPages();
    } catch (error) {
      console.error("Error updating task progress:", error);
      throw error;
    }
  };

  useEffect(() => {
    setHeaderRightAction(
      <Button onClick={() => setCreatingTask(true)}>
        <Plus className="w-4 h-4 mr-2" />
        New Task
      </Button>
    );
    return () => {
      setHeaderRightAction(null);
    };
  }, [setHeaderRightAction]);

  const totalTaskCount = statusCounts.active + statusCounts.future + statusCounts.completed;
  const hasAnyInitializedTaskPage = TASK_STATUSES.some((status) => taskPages[status].initialized);
  const anyTaskPageLoading = TASK_STATUSES.some((status) => taskPages[status].loadingMore);
  const isInitialTaskDataPending =
    loading ||
    (!hasAnyInitializedTaskPage && (anyTaskPageLoading || !!highlightTaskId || !!highlightedHabitId));

  const availableTasks = taskOptions.length > 0 ? taskOptions : allLoadedTasks;

  if (isInitialTaskDataPending) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {totalTaskCount === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description="Get started by creating your first task"
          action={{
            label: "Create Task",
            onClick: () => setCreatingTask(true),
          }}
        />
      ) : (
        <TaskTabsPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          statusCounts={statusCounts}
          taskPages={taskPages}
          groups={groups}
          expandedTasks={expandedTasks}
          onToggleExpand={handleToggleExpand}
          onEdit={setEditingTask}
          onDelete={setDeletingTask}
          onProgressUpdate={handleProgressUpdate}
          taskRefs={taskRefs.current}
          onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
          onAddTask={(task) => handleAddChild(task, "task")}
          onAddHabit={(task) => handleAddChild(task, "habit")}
          highlightedHabitId={highlightedHabitId}
          loadTaskPage={(status) => loadTaskPage(status)}
          isTaskCompleted={isTaskCompleted}
        />
      )}
      <TaskDialogs
        creatingTask={creatingTask}
        setCreatingTask={setCreatingTask}
        creatingTaskWithParent={creatingTaskWithParent}
        setCreatingTaskWithParent={setCreatingTaskWithParent}
        creatingHabitWithParent={creatingHabitWithParent}
        setCreatingHabitWithParent={setCreatingHabitWithParent}
        editingTask={editingTask}
        setEditingTask={setEditingTask}
        deletingTask={deletingTask}
        setDeletingTask={setDeletingTask}
        progressOverwriteWarning={progressOverwriteWarning}
        setProgressOverwriteWarning={setProgressOverwriteWarning}
        groups={groups}
        labels={labels}
        availableTasks={availableTasks}
        saving={saving}
        onCreateTask={handleCreate}
        onCreateHabit={handleCreateHabit}
        onEditTask={handleEdit}
        onDeleteTask={handleDelete}
        onOpenChildCreateDialog={openChildCreateDialog}
      />
    </div>
  );
}
