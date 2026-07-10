"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getTask, TaskStatus } from "@/lib/api/tasks";
import { getHabit } from "@/lib/api/habits";
import { Task } from "@/types";
import { getTaskStatus, TaskPageState, TASK_STATUSES } from "../_lib/task-page-helpers";

interface UseTaskHighlightingProps {
  pathname: string;
  highlightTaskId: string | null;
  highlightedHabitId: string | null;
  activeTab: TaskStatus;
  setActiveTab: (status: TaskStatus) => void;
  taskPages: Record<TaskStatus, TaskPageState>;
  taskPagesRef: MutableRefObject<Record<TaskStatus, TaskPageState>>;
  loadTaskPage: (status: TaskStatus, options?: { reset?: boolean; highlightId?: string }) => Promise<Task[] | null>;
  taskRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  expandedTasks: Set<string>;
  setExpandedTasks: Dispatch<SetStateAction<Set<string>>>;
}

function findTaskById(taskList: Task[], targetId: string): Task | null {
  for (const task of taskList) {
    if (task.id === targetId) return task;
    if (task.children && task.children.length > 0) {
      const found = findTaskById(task.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

function findTaskByHabitId(taskList: Task[], habitId: string): Task | null {
  for (const task of taskList) {
    if (task.habits?.some((habit) => habit.id === habitId)) return task;
    if (task.children && task.children.length > 0) {
      const found = findTaskByHabitId(task.children, habitId);
      if (found) return found;
    }
  }
  return null;
}

function getAllParentIds(
  taskList: Task[],
  targetId: string,
  currentPath: string[] = []
): string[] {
  for (const task of taskList) {
    if (task.id === targetId) return currentPath;
    if (task.children && task.children.length > 0) {
      const found = getAllParentIds(task.children, targetId, [...currentPath, task.id]);
      if (found.length > 0) return found;
    }
  }
  return [];
}

export function useTaskHighlighting({
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
}: UseTaskHighlightingProps) {
  const processedHighlightRef = useRef<string | null>(null);
  const processedHabitHighlightRef = useRef<string | null>(null);
  const suppressAutoActiveTabRef = useRef(false);

  useEffect(() => {
    if (!highlightTaskId || processedHighlightRef.current === highlightTaskId) {
      if (!highlightTaskId) {
        processedHighlightRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const ensureHighlightedTaskLoaded = async () => {
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
    };

    void ensureHighlightedTaskLoaded();

    return () => {
      cancelled = true;
    };
  }, [highlightTaskId, activeTab, loadTaskPage, setActiveTab, setExpandedTasks, taskPagesRef]);

  useEffect(() => {
    if (!highlightedHabitId || processedHabitHighlightRef.current === highlightedHabitId) {
      if (!highlightedHabitId) {
        processedHabitHighlightRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const ensureHighlightedHabitLoaded = async () => {
      try {
        const habit = await getHabit(highlightedHabitId);
        if (cancelled) return;

        const parentTaskId = habit.parentTask?.id || habit.parentTaskId;
        if (!parentTaskId) {
          processedHabitHighlightRef.current = highlightedHabitId;
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
    };

    void ensureHighlightedHabitLoaded();

    return () => {
      cancelled = true;
    };
  }, [highlightedHabitId, activeTab, loadTaskPage, setActiveTab, setExpandedTasks, taskPagesRef]);

  useEffect(() => {
    if (pathname !== "/tasks") return;
    if (highlightTaskId || highlightedHabitId) return;
    if (suppressAutoActiveTabRef.current) {
      suppressAutoActiveTabRef.current = false;
      return;
    }

    setActiveTab("active");
  }, [pathname, highlightTaskId, highlightedHabitId, setActiveTab]);

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
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    const scrollToElement = () => {
      if (cancelled) return false;
      const element = taskRefs.current[highlightTaskId];
      if (element && element.offsetParent !== null) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("bg-indigo-50");

        schedule(() => {
          if (cancelled) return;
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
        }, 2000);
        return true;
      }
      return false;
    };

    schedule(() => {
      if (cancelled) return;
      if (!scrollToElement()) {
        schedule(scrollToElement, 500);
      }
    }, scrollDelay);

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [highlightTaskId, expandedTasks, activeTab, taskPages, taskRefs]);

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

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    const scrollToHabit = () => {
      if (cancelled) return false;
      const element = document.querySelector<HTMLElement>(`[data-habit-card-id="${highlightedHabitId}"]`);
      if (element && element.offsetParent !== null) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-2", "ring-indigo-300");

        schedule(() => {
          if (cancelled) return;
          element.classList.remove("ring-2", "ring-indigo-300");
          const params = new URLSearchParams(window.location.search);
          if (params.has("highlightHabit")) {
            suppressAutoActiveTabRef.current = true;
            params.delete("highlightHabit");
            const nextUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
            window.history.replaceState({}, "", nextUrl);
          }
          processedHabitHighlightRef.current = null;
        }, 2000);
        return true;
      }
      return false;
    };

    schedule(() => {
      if (cancelled) return;
      if (!scrollToHabit()) {
        schedule(scrollToHabit, 500);
      }
    }, 300);

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [highlightedHabitId, expandedTasks, activeTab, taskPages]);
}
