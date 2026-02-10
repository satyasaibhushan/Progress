"use client";

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useHeaderAction } from "../layout";
import { Plus, CheckSquare } from "lucide-react";
import {
  getTasks,
  getTaskPage,
  getTask,
  updateTask,
  deleteTask,
  createTask,
  CreateTaskInput,
  TaskStatus,
} from "@/lib/api/tasks";
import { createHabit, getHabit } from "@/lib/api/habits";
import type { CreateHabitInput } from "@/lib/api/habits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { Task, Group, Label } from "@/types";
import { TaskTree } from "@/components/tasks/task-tree";
import { TaskForm } from "@/components/tasks/task-form";
import { HabitForm } from "@/components/habits/habit-form";
import { Button } from "@/components/ui/button";
import { isPending } from "@/lib/date-helpers";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ServerLazyList } from "@/components/shared/server-lazy-list";
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

function isTaskCompleted(task: Task): boolean {
  const leafTasks = getAllLeafTasks([task]);
  if (leafTasks.length === 0) return false;
  return leafTasks.every((t) => {
    const taskProgress = t.progress || 0;
    return taskProgress >= 100;
  });
}

interface TaskPageState {
  items: Task[];
  nextCursor: string | null;
  hasMore: boolean;
  initialized: boolean;
  loadingMore: boolean;
}

function createEmptyTaskPageState(): TaskPageState {
  return {
    items: [],
    nextCursor: null,
    hasMore: true,
    initialized: false,
    loadingMore: false,
  };
}

const TASKS_PAGE_SIZE = 8;
const TASK_STATUSES: TaskStatus[] = ["active", "future", "completed"];

function mergeUniqueTasksById(existing: Task[], incoming: Task[]): Task[] {
  const merged: Task[] = [];
  const seen = new Set<string>();

  for (const task of [...existing, ...incoming]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }

  return merged;
}

function getTaskStatus(task: Task): TaskStatus {
  const progress = Math.min(100, Math.max(0, task.progress || 0));
  if (progress >= 100) return "completed";
  if (isPending(task.startDate)) return "future";
  return "active";
}

function TasksPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setHeaderRightAction } = useHeaderAction();

  const highlightTaskId = searchParams.get("highlight");
  const highlightedHabitId = searchParams.get("highlightHabit");
  const initialHighlightTaskIdRef = useRef(highlightTaskId);
  const initialHighlightedHabitIdRef = useRef(highlightedHabitId);

  const [taskPages, setTaskPages] = useState<Record<TaskStatus, TaskPageState>>({
    active: createEmptyTaskPageState(),
    future: createEmptyTaskPageState(),
    completed: createEmptyTaskPageState(),
  });
  const taskPagesRef = useRef(taskPages);
  const [statusCounts, setStatusCounts] = useState<Record<TaskStatus, number>>({
    active: 0,
    future: 0,
    completed: 0,
  });

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
  const [activeTab, setActiveTab] = useState<TaskStatus>("active");

  const taskRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const processedHighlightRef = useRef<string | null>(null);
  const processedHabitHighlightRef = useRef<string | null>(null);
  const isHighlightingRef = useRef(false);
  const isHabitHighlightingRef = useRef(false);
  const suppressAutoActiveTabRef = useRef(false);

  useEffect(() => {
    taskPagesRef.current = taskPages;
  }, [taskPages]);

  const loadTaskPage = useCallback(
    async (status: TaskStatus, options?: { reset?: boolean; highlightId?: string }): Promise<Task[] | null> => {
      const reset = options?.reset ?? false;
      const currentPage = taskPagesRef.current[status];
      if (currentPage.loadingMore) return null;
      if (!reset && !currentPage.hasMore) return null;

      setTaskPages((prev) => {
        const next = {
          ...prev,
          [status]: {
            ...prev[status],
            loadingMore: true,
          },
        };
        taskPagesRef.current = next;
        return next;
      });

      try {
        const result = await getTaskPage({
          status,
          includeChildren: true,
          parentId: null,
          limit: TASKS_PAGE_SIZE,
          cursor: reset ? null : currentPage.nextCursor,
          highlightId: options?.highlightId,
        });

        setTaskPages((prev) => {
          const mergedItems = reset
            ? mergeUniqueTasksById([], result.items)
            : mergeUniqueTasksById(prev[status].items, result.items);
          const next = {
            ...prev,
            [status]: {
              items: mergedItems,
              nextCursor: result.nextCursor,
              hasMore: result.hasMore,
              initialized: true,
              loadingMore: false,
            },
          };
          taskPagesRef.current = next;
          return next;
        });
        setStatusCounts(result.statusCounts);
        return result.items;
      } catch (error) {
        console.error(`Error loading ${status} tasks:`, error);
        setTaskPages((prev) => {
          const next = {
            ...prev,
            [status]: {
              ...prev[status],
              loadingMore: false,
            },
          };
          taskPagesRef.current = next;
          return next;
        });
        return null;
      }
    },
    []
  );

  const refreshInitializedTaskPages = useCallback(async () => {
    const initializedStatuses = TASK_STATUSES.filter((status) => taskPagesRef.current[status].initialized);
    if (initializedStatuses.length === 0) {
      await loadTaskPage(activeTab, { reset: true });
      return;
    }

    const foreground = initializedStatuses.includes(activeTab)
      ? activeTab
      : initializedStatuses[0];

    await loadTaskPage(foreground, { reset: true });

    const backgroundStatuses = initializedStatuses.filter((status) => status !== foreground);
    if (backgroundStatuses.length > 0) {
      void Promise.all(
        backgroundStatuses.map((status) => loadTaskPage(status, { reset: true }))
      );
    }
  }, [activeTab, loadTaskPage]);

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

  const findTaskById = useCallback((taskList: Task[], targetId: string): Task | null => {
    for (const t of taskList) {
      if (t.id === targetId) return t;
      if (t.children && t.children.length > 0) {
        const found = findTaskById(t.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const findTaskByHabitId = useCallback((taskList: Task[], habitId: string): Task | null => {
    for (const task of taskList) {
      if (task.habits?.some((habit) => habit.id === habitId)) {
        return task;
      }
      if (task.children && task.children.length > 0) {
        const found = findTaskByHabitId(task.children, habitId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const getAllParentIds = useCallback((taskList: Task[], targetId: string, currentPath: string[] = []): string[] => {
    for (const t of taskList) {
      if (t.id === targetId) return currentPath;
      if (t.children && t.children.length > 0) {
        const found = getAllParentIds(t.children, targetId, [...currentPath, t.id]);
        if (found.length > 0) return found;
      }
    }
    return [];
  }, []);

  useEffect(() => {
    if (!highlightTaskId || processedHighlightRef.current === highlightTaskId) {
      if (!highlightTaskId) {
        processedHighlightRef.current = null;
        isHighlightingRef.current = false;
      }
      return;
    }

    let cancelled = false;

    const ensureHighlightedTaskLoaded = async () => {
      isHighlightingRef.current = true;

      let statusesToTry: TaskStatus[] = TASK_STATUSES;
      let resolvedTaskForFallback: Task | null = null;
      try {
        resolvedTaskForFallback = await getTask(highlightTaskId);
        if (cancelled) return;
        const predictedStatus = getTaskStatus(resolvedTaskForFallback);
        statusesToTry = [predictedStatus, ...TASK_STATUSES.filter((status) => status !== predictedStatus)];
      } catch {
        // Continue with default status order if direct lookup fails.
      }

      const focusHighlightedTask = (status: TaskStatus, tree: Task[], task: Task) => {
        processedHighlightRef.current = highlightTaskId;
        if (activeTab !== status) {
          setActiveTab(status);
        }

        const treeParentIds = getAllParentIds(tree, highlightTaskId);
        const ancestorIds: string[] = [];
        let currentTaskId: string | null = task.parentId ?? null;
        while (currentTaskId) {
          ancestorIds.push(currentTaskId);
          const currentTask = findTaskById(tree, currentTaskId);
          currentTaskId = currentTask?.parentId ?? null;
        }

        const allParentIds = Array.from(new Set([...treeParentIds, ...ancestorIds].filter(Boolean)));
        const taskHasChildren = (task.children && task.children.length > 0) || (task.habits && task.habits.length > 0);
        const tasksToExpand = taskHasChildren ? [...allParentIds, highlightTaskId] : allParentIds;

        setExpandedTasks((prev) => {
          const next = new Set(prev);
          tasksToExpand.forEach((id) => next.add(id));
          return next;
        });
      };

      for (const status of statusesToTry) {
        if (cancelled) return;

        if (!taskPagesRef.current[status].initialized) {
          await loadTaskPage(status, { reset: true, highlightId: highlightTaskId });
          if (cancelled) return;
        }

        let tree = taskPagesRef.current[status].items;
        let task = findTaskById(tree, highlightTaskId);

        const seenPaginationStates = new Set<string>();
        let paginationAttempts = 0;
        while (!task && taskPagesRef.current[status].hasMore) {
          const before = taskPagesRef.current[status];
          const pageStateKey = `${before.nextCursor ?? "null"}:${before.items.length}`;
          if (seenPaginationStates.has(pageStateKey) || paginationAttempts >= 50) {
            break;
          }
          seenPaginationStates.add(pageStateKey);
          paginationAttempts += 1;

          await loadTaskPage(status);
          if (cancelled) return;
          const after = taskPagesRef.current[status];
          tree = after.items;
          task = findTaskById(tree, highlightTaskId);

          // Stop if pagination made no progress to avoid infinite loading loops.
          if (!task && after.items.length === before.items.length && after.nextCursor === before.nextCursor) {
            break;
          }
        }

        if (!task) {
          continue;
        }

        focusHighlightedTask(status, tree, task);
        return;
      }

      try {
        const fallbackTask = resolvedTaskForFallback ?? await getTask(highlightTaskId);
        if (cancelled) return;

        const fallbackStatus = getTaskStatus(fallbackTask);
        if (!taskPagesRef.current[fallbackStatus].initialized) {
          await loadTaskPage(fallbackStatus, { reset: true, highlightId: highlightTaskId });
          if (cancelled) return;
        }

        let tree = taskPagesRef.current[fallbackStatus].items;
        let task = findTaskById(tree, highlightTaskId);
        const seenPaginationStates = new Set<string>();
        let paginationAttempts = 0;

        while (!task && taskPagesRef.current[fallbackStatus].hasMore) {
          const before = taskPagesRef.current[fallbackStatus];
          const pageStateKey = `${before.nextCursor ?? "null"}:${before.items.length}`;
          if (seenPaginationStates.has(pageStateKey) || paginationAttempts >= 50) {
            break;
          }
          seenPaginationStates.add(pageStateKey);
          paginationAttempts += 1;

          await loadTaskPage(fallbackStatus);
          if (cancelled) return;
          const after = taskPagesRef.current[fallbackStatus];
          tree = after.items;
          task = findTaskById(tree, highlightTaskId);

          if (!task && after.items.length === before.items.length && after.nextCursor === before.nextCursor) {
            break;
          }
        }

        if (task) {
          focusHighlightedTask(fallbackStatus, tree, task);
          return;
        }

        if (activeTab !== fallbackStatus) {
          setActiveTab(fallbackStatus);
        }
      } catch (error) {
        console.error("Error resolving highlighted task:", error);
      }

      isHighlightingRef.current = false;
    };

    ensureHighlightedTaskLoaded();

    return () => {
      cancelled = true;
    };
  }, [highlightTaskId, activeTab, loadTaskPage, findTaskById, getAllParentIds]);

  useEffect(() => {
    if (!highlightedHabitId || processedHabitHighlightRef.current === highlightedHabitId) {
      if (!highlightedHabitId) {
        processedHabitHighlightRef.current = null;
        isHabitHighlightingRef.current = false;
      }
      return;
    }

    let cancelled = false;

    const ensureHighlightedHabitLoaded = async () => {
      isHabitHighlightingRef.current = true;

      try {
        const habit = await getHabit(highlightedHabitId);
        if (cancelled) return;

        const parentTaskId = habit.parentTask?.id || habit.parentTaskId;
        if (!parentTaskId) {
          processedHabitHighlightRef.current = highlightedHabitId;
          isHabitHighlightingRef.current = false;
          return;
        }

        let statusesToTry: TaskStatus[] = TASK_STATUSES;
        try {
          const parentTask = await getTask(parentTaskId);
          if (!cancelled) {
            const predictedStatus = getTaskStatus(parentTask);
            statusesToTry = [predictedStatus, ...TASK_STATUSES.filter((status) => status !== predictedStatus)];
          }
        } catch {
          // Continue with default status order if parent task lookup fails.
        }

        const focusHighlightedHabit = (status: TaskStatus, tree: Task[], parentTask: Task) => {
          processedHabitHighlightRef.current = highlightedHabitId;
          if (activeTab !== status) {
            setActiveTab(status);
          }

          const treeParentIds = getAllParentIds(tree, parentTask.id);
          const ancestorIds: string[] = [];
          let currentTaskId: string | null = parentTask.parentId ?? null;
          while (currentTaskId) {
            ancestorIds.push(currentTaskId);
            const currentTask = findTaskById(tree, currentTaskId);
            currentTaskId = currentTask?.parentId ?? null;
          }

          const allParentIds = Array.from(new Set([...treeParentIds, ...ancestorIds].filter(Boolean)));
          const tasksToExpand = [...allParentIds, parentTask.id];

          setExpandedTasks((prev) => {
            const next = new Set(prev);
            tasksToExpand.forEach((id) => next.add(id));
            return next;
          });
        };

        for (const status of statusesToTry) {
          if (cancelled) return;

          if (!taskPagesRef.current[status].initialized) {
            await loadTaskPage(status, { reset: true, highlightId: parentTaskId });
            if (cancelled) return;
          }

          let tree = taskPagesRef.current[status].items;
          let parentTask = findTaskById(tree, parentTaskId);

          const seenPaginationStates = new Set<string>();
          let paginationAttempts = 0;
          while (!parentTask && taskPagesRef.current[status].hasMore) {
            const before = taskPagesRef.current[status];
            const pageStateKey = `${before.nextCursor ?? "null"}:${before.items.length}`;
            if (seenPaginationStates.has(pageStateKey) || paginationAttempts >= 50) {
              break;
            }
            seenPaginationStates.add(pageStateKey);
            paginationAttempts += 1;

            await loadTaskPage(status);
            if (cancelled) return;
            const after = taskPagesRef.current[status];
            tree = after.items;
            parentTask = findTaskById(tree, parentTaskId);

            if (!parentTask && after.items.length === before.items.length && after.nextCursor === before.nextCursor) {
              break;
            }
          }

          if (!parentTask) {
            continue;
          }

          focusHighlightedHabit(status, tree, parentTask);
          return;
        }

        for (const status of TASK_STATUSES) {
          if (cancelled) return;

          if (!taskPagesRef.current[status].initialized) continue;
          const tree = taskPagesRef.current[status].items;
          const parentTask = findTaskByHabitId(tree, highlightedHabitId);
          if (!parentTask) continue;

          focusHighlightedHabit(status, tree, parentTask);
          return;
        }
      } catch (error) {
        console.error("Error resolving highlighted habit in tasks:", error);
      }

      isHabitHighlightingRef.current = false;
    };

    ensureHighlightedHabitLoaded();

    return () => {
      cancelled = true;
    };
  }, [highlightedHabitId, activeTab, loadTaskPage, findTaskById, findTaskByHabitId, getAllParentIds]);

  useEffect(() => {
    if (pathname !== "/tasks") return;
    if (highlightTaskId || highlightedHabitId) return;
    if (suppressAutoActiveTabRef.current) {
      suppressAutoActiveTabRef.current = false;
      return;
    }

    setActiveTab("active");
  }, [pathname, highlightTaskId, highlightedHabitId]);

  useEffect(() => {
    if (!highlightTaskId || processedHighlightRef.current !== highlightTaskId) {
      return;
    }

    const tree = taskPages[activeTab].items;
    const task = findTaskById(tree, highlightTaskId);
    if (!task) return;

    const treeParentIds = getAllParentIds(tree, highlightTaskId);
    const ancestorIds: string[] = [];
    let currentTaskId: string | null = task.parentId ?? null;
    while (currentTaskId) {
      ancestorIds.push(currentTaskId);
      const currentTask = findTaskById(tree, currentTaskId);
      currentTaskId = currentTask?.parentId ?? null;
    }

    const allParentIds = Array.from(new Set([...treeParentIds, ...ancestorIds].filter(Boolean)));
    const taskHasChildren = (task.children && task.children.length > 0) || (task.habits && task.habits.length > 0);
    const allTasksToExpand = taskHasChildren ? [...allParentIds, highlightTaskId] : allParentIds;
    const allExpanded = allTasksToExpand.length === 0 || allTasksToExpand.every((id) => expandedTasks.has(id));

    if (!allExpanded) return;

    const scrollDelay = allTasksToExpand.length > 0 ? 300 : 200;

    const scrollToElement = () => {
      const element = taskRefs.current[highlightTaskId];
      if (element && element.offsetParent !== null) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("bg-indigo-50");

        setTimeout(() => {
          if (element) {
            element.classList.remove("bg-indigo-50");
          }

          const params = new URLSearchParams(window.location.search);
          if (params.has("highlight")) {
            suppressAutoActiveTabRef.current = true;
            params.delete("highlight");
            const nextUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
            window.history.replaceState({}, "", nextUrl);
          }

          processedHighlightRef.current = null;
          isHighlightingRef.current = false;
        }, 2000);
        return true;
      }
      return false;
    };

    setTimeout(() => {
      if (!scrollToElement()) {
        setTimeout(scrollToElement, 500);
      }
    }, scrollDelay);
  }, [highlightTaskId, expandedTasks, activeTab, taskPages, findTaskById, getAllParentIds]);

  useEffect(() => {
    if (!highlightedHabitId || processedHabitHighlightRef.current !== highlightedHabitId) {
      return;
    }

    const tree = taskPages[activeTab].items;
    const parentTask = findTaskByHabitId(tree, highlightedHabitId);
    if (!parentTask) return;

    const treeParentIds = getAllParentIds(tree, parentTask.id);
    const ancestorIds: string[] = [];
    let currentTaskId: string | null = parentTask.parentId ?? null;
    while (currentTaskId) {
      ancestorIds.push(currentTaskId);
      const currentTask = findTaskById(tree, currentTaskId);
      currentTaskId = currentTask?.parentId ?? null;
    }

    const allParentIds = Array.from(new Set([...treeParentIds, ...ancestorIds].filter(Boolean)));
    const allTasksToExpand = [...allParentIds, parentTask.id];
    const allExpanded = allTasksToExpand.length === 0 || allTasksToExpand.every((id) => expandedTasks.has(id));
    if (!allExpanded) return;

    const scrollToHabit = () => {
      const element = document.querySelector<HTMLElement>(`[data-habit-card-id="${highlightedHabitId}"]`);
      if (element && element.offsetParent !== null) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-2", "ring-indigo-300");

        setTimeout(() => {
          element.classList.remove("ring-2", "ring-indigo-300");
          const params = new URLSearchParams(window.location.search);
          if (params.has("highlightHabit")) {
            suppressAutoActiveTabRef.current = true;
            params.delete("highlightHabit");
            const nextUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
            window.history.replaceState({}, "", nextUrl);
          }
          processedHabitHighlightRef.current = null;
          isHabitHighlightingRef.current = false;
        }, 2000);
        return true;
      }
      return false;
    };

    setTimeout(() => {
      if (!scrollToHabit()) {
        setTimeout(scrollToHabit, 500);
      }
    }, 300);
  }, [highlightedHabitId, expandedTasks, activeTab, taskPages, findTaskById, findTaskByHabitId, getAllParentIds]);

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
    type: "DAILY" | "WEEKLY" | "MONTHLY";
    targetCount?: number | null;
    countPerPeriod?: number;
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
        startDate: data.startDate || undefined,
        deadline: data.deadline || undefined,
        groupId: data.groupId || undefined,
        parentId: data.parentId || undefined,
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

  const activeTasks = taskPages.active.items;
  const futureTasks = taskPages.future.items;
  const completedTasks = taskPages.completed.items;
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
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TaskStatus)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">
              Active
              <span className="ml-2 text-xs text-muted-foreground">({statusCounts.active})</span>
            </TabsTrigger>
            <TabsTrigger value="future">
              Future
              <span className="ml-2 text-xs text-muted-foreground">({statusCounts.future})</span>
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed
              <span className="ml-2 text-xs text-muted-foreground">({statusCounts.completed})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-6">
            {!taskPages.active.initialized || (taskPages.active.loadingMore && activeTasks.length === 0) ? (
              <LoadingSkeleton count={4} />
            ) : activeTasks.length > 0 ? (
              <ServerLazyList
                items={activeTasks}
                hasMore={taskPages.active.hasMore}
                loadingMore={taskPages.active.loadingMore}
                onLoadMore={() => loadTaskPage("active")}
                className="space-y-4"
                render={(pagedTasks) => (
                  <TaskTree
                    tasks={pagedTasks}
                    groups={groups}
                    expandedTasks={expandedTasks}
                    onToggleExpand={handleToggleExpand}
                    onEdit={(task) => setEditingTask(task)}
                    onDelete={(task) => setDeletingTask(task)}
                    onProgressUpdate={handleProgressUpdate}
                    taskRefs={taskRefs.current}
                    onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
                    onAddTask={(task) => handleAddChild(task, "task")}
                    onAddHabit={(task) => handleAddChild(task, "habit")}
                    highlightedHabitId={highlightedHabitId}
                    isTaskCompleted={isTaskCompleted}
                  />
                )}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No active tasks</p>
            )}
          </TabsContent>

          <TabsContent value="future" className="space-y-4 mt-6">
            {!taskPages.future.initialized || (taskPages.future.loadingMore && futureTasks.length === 0) ? (
              <LoadingSkeleton count={4} />
            ) : futureTasks.length > 0 ? (
              <ServerLazyList
                items={futureTasks}
                hasMore={taskPages.future.hasMore}
                loadingMore={taskPages.future.loadingMore}
                onLoadMore={() => loadTaskPage("future")}
                className="space-y-4"
                render={(pagedTasks) => (
                  <TaskTree
                    tasks={pagedTasks}
                    groups={groups}
                    expandedTasks={expandedTasks}
                    onToggleExpand={handleToggleExpand}
                    onEdit={(task) => setEditingTask(task)}
                    onDelete={(task) => setDeletingTask(task)}
                    onProgressUpdate={handleProgressUpdate}
                    taskRefs={taskRefs.current}
                    onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
                    onAddTask={(task) => handleAddChild(task, "task")}
                    onAddHabit={(task) => handleAddChild(task, "habit")}
                    highlightedHabitId={highlightedHabitId}
                    isTaskCompleted={isTaskCompleted}
                  />
                )}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No future tasks</p>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4 mt-6">
            {!taskPages.completed.initialized || (taskPages.completed.loadingMore && completedTasks.length === 0) ? (
              <LoadingSkeleton count={4} />
            ) : completedTasks.length > 0 ? (
              <ServerLazyList
                items={completedTasks}
                hasMore={taskPages.completed.hasMore}
                loadingMore={taskPages.completed.loadingMore}
                onLoadMore={() => loadTaskPage("completed")}
                className="space-y-4"
                render={(pagedTasks) => (
                  <TaskTree
                    tasks={pagedTasks}
                    groups={groups}
                    expandedTasks={expandedTasks}
                    onToggleExpand={handleToggleExpand}
                    onEdit={(task) => setEditingTask(task)}
                    onDelete={(task) => setDeletingTask(task)}
                    onProgressUpdate={handleProgressUpdate}
                    taskRefs={taskRefs.current}
                    onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
                    onAddTask={(task) => handleAddChild(task, "task")}
                    onAddHabit={(task) => handleAddChild(task, "habit")}
                    highlightedHabitId={highlightedHabitId}
                    isTaskCompleted={isTaskCompleted}
                  />
                )}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No completed tasks</p>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog
        open={creatingTask || !!creatingTaskWithParent}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingTask(false);
            setCreatingTaskWithParent(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <TaskForm
            groups={groups}
            labels={labels}
            availableTasks={availableTasks}
            initialParentId={creatingTaskWithParent?.id}
            onSubmit={handleCreate}
            onCancel={() => {
              setCreatingTask(false);
              setCreatingTaskWithParent(null);
            }}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!creatingHabitWithParent}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingHabitWithParent(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Habit</DialogTitle>
          </DialogHeader>
          <HabitForm
            groups={groups}
            labels={labels}
            availableTasks={availableTasks}
            initialParentTaskId={creatingHabitWithParent?.id}
            onSubmit={handleCreateHabit}
            onCancel={() => setCreatingHabitWithParent(null)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              task={editingTask}
              groups={groups}
              labels={labels}
              availableTasks={availableTasks}
              onSubmit={handleEdit}
              onCancel={() => setEditingTask(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the task
              {deletingTask?.children && deletingTask.children.length > 0 && (
                <> and all {deletingTask.children.length} child task{deletingTask.children.length > 1 ? "s" : ""}</>
              )}
              .
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

      <AlertDialog
        open={!!progressOverwriteWarning}
        onOpenChange={(open) => !open && setProgressOverwriteWarning(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manual progress will be overwritten</AlertDialogTitle>
            <AlertDialogDescription>
              {progressOverwriteWarning ? (
                <>
                  This task currently has manual progress at{" "}
                  <strong>{Math.round(progressOverwriteWarning.parentTask.progress || 0)}%</strong>.
                  Adding a sub-{progressOverwriteWarning.childType} will replace manual progress with
                  aggregated progress from child items. Continue?
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!progressOverwriteWarning) return;
                openChildCreateDialog(progressOverwriteWarning.parentTask, progressOverwriteWarning.childType);
                setProgressOverwriteWarning(null);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingSkeleton count={10} />}>
      <TasksPageContent />
    </Suspense>
  );
}
