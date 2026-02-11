"use client";

import { useCallback, useRef, useState } from "react";
import { getTaskPage, TaskStatus } from "@/lib/api/tasks";
import { Task } from "@/types";
import {
  createEmptyTaskPageState,
  mergeUniqueTasksById,
  TaskPageState,
  TASK_STATUSES,
  TASKS_PAGE_SIZE,
} from "../_lib/task-page-helpers";

export function useTaskPages(activeTab: TaskStatus) {
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
      void Promise.all(backgroundStatuses.map((status) => loadTaskPage(status, { reset: true })));
    }
  }, [activeTab, loadTaskPage]);

  return {
    taskPages,
    taskPagesRef,
    statusCounts,
    loadTaskPage,
    refreshInitializedTaskPages,
  };
}
