"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHeaderAction } from "../layout";
import { Plus } from "lucide-react";
import { getTasks, getTask, updateTask, deleteTask, createTask, CreateTaskInput } from "@/lib/api/tasks";
import { getGroups } from "@/lib/api/groups";
import { getHabits } from "@/lib/api/habits";
import { getLabels } from "@/lib/api/labels";
import { Task, Group, Habit, Label } from "@/types";
import { TaskTree } from "@/components/tasks/task-tree";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { CheckSquare } from "lucide-react";
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


// Check if a task is completed (all leaf tasks are 100%)
function isTaskCompleted(task: Task & { total_weight?: string; weighted_progress?: string }): boolean {
  const leafTasks = getAllLeafTasks([task]);
  // A task is completed only if it has leaf tasks and ALL of them are 100%
  if (leafTasks.length === 0) return false;
  return leafTasks.every((t) => {
    const taskProgress = t.progress || 0;
    return taskProgress >= 100;
  });
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setHeaderSubtitle } = useHeaderAction();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [saving, setSaving] = useState(false);
  const taskRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const processedHighlightRef = useRef<string | null>(null);

  const hasLoadedRef = useRef(false);
  const isHighlightingRef = useRef(false);
  
  useEffect(() => {
    // Only load data once on mount, not when URL params change
    // Also skip if we're in the middle of highlighting (to prevent API calls when param is removed)
    if (hasLoadedRef.current) return;
    
    async function loadData() {
      try {
        hasLoadedRef.current = true;
        const [tasksData, groupsData, habitsData, labelsData] = await Promise.all([
          getTasks({ includeChildren: true, parentId: null }),
          getGroups(),
          getHabits({ includeLogs: true }),
          getLabels(),
        ]);
        setTasks(tasksData);
        setGroups(groupsData);
        setHabits(habitsData);
        setLabels(labelsData);
      } catch (error) {
        console.error("Error loading tasks:", error);
        hasLoadedRef.current = false; // Reset on error so we can retry
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Helper functions (memoized to avoid recreating on each render)
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

  // Handle highlighting from URL params
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (highlightId && tasks.length > 0 && processedHighlightRef.current !== highlightId) {
      const task = findTaskById(tasks, highlightId);
      if (task) {
        processedHighlightRef.current = highlightId;
        isHighlightingRef.current = true;
        
        const treeParentIds = getAllParentIds(tasks, highlightId);
        
        // Follow parentId chain to get all ancestors
        const ancestorIds: string[] = [];
        let currentTaskId: string | null = task.parentId ?? null;
        while (currentTaskId) {
          ancestorIds.push(currentTaskId);
          const currentTask = findTaskById(tasks, currentTaskId);
          currentTaskId = currentTask?.parentId ?? null;
        }
        
        // Combine and deduplicate
        const allParentIds = Array.from(new Set([...treeParentIds, ...ancestorIds].filter(Boolean)));
        
        // Include task itself if it has children
        const taskHasChildren = (task.children && task.children.length > 0) || (task.habits && task.habits.length > 0);
        const tasksToExpand = taskHasChildren ? [...allParentIds, highlightId] : allParentIds;
        
        // Expand all required tasks
        setExpandedTasks(prev => {
          const newExpanded = new Set(prev);
          tasksToExpand.forEach(id => newExpanded.add(id));
          return newExpanded;
        });
      }
    }
  }, [searchParams, tasks, findTaskById, getAllParentIds]);

  // Scroll to task after expansion completes
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (highlightId && processedHighlightRef.current === highlightId && expandedTasks.size > 0) {
      const task = findTaskById(tasks, highlightId);
      if (!task) return;
      
      const treeParentIds = getAllParentIds(tasks, highlightId);
      const ancestorIds: string[] = [];
      let currentTaskId: string | null = task.parentId ?? null;
      while (currentTaskId) {
        ancestorIds.push(currentTaskId);
        const currentTask = findTaskById(tasks, currentTaskId);
        currentTaskId = currentTask?.parentId ?? null;
      }
      
      const allParentIds = Array.from(new Set([...treeParentIds, ...ancestorIds].filter(Boolean)));
      const taskHasChildren = (task.children && task.children.length > 0) || (task.habits && task.habits.length > 0);
      const allTasksToExpand = taskHasChildren ? [...allParentIds, highlightId] : allParentIds;
      
      // Check if all required tasks are expanded
      const allExpanded = allTasksToExpand.length === 0 || allTasksToExpand.every(id => expandedTasks.has(id));
      
      if (allExpanded) {
        const scrollDelay = allTasksToExpand.length > 0 ? 300 : 200;
        const scrollToElement = () => {
          const element = taskRefs.current[highlightId];
          if (element && element.offsetParent !== null) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("bg-indigo-50");
            
            setTimeout(() => {
              if (element) {
                element.classList.remove("bg-indigo-50");
              }
              if (searchParams.get("highlight") === highlightId) {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("highlight");
                const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
                window.history.replaceState({}, '', newUrl);
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
            // Retry once if element not visible
            setTimeout(scrollToElement, 500);
          }
        }, scrollDelay);
      }
    }
  }, [expandedTasks, searchParams, tasks, findTaskById, getAllParentIds]);


  const handleToggleExpand = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const handleCreate = async (data: { title: string; importance: number; description?: string; progress?: number; deadline?: string | null; groupId?: string | null; parentId?: string | null; labelIds?: string[] }) => {
    const createData: CreateTaskInput = {
      title: data.title,
      importance: data.importance,
      description: data.description,
      progress: data.progress,
      deadline: data.deadline || undefined,
      groupId: data.groupId || undefined,
      parentId: data.parentId || undefined,
      labelIds: data.labelIds,
    };
    setSaving(true);
    try {
      await createTask(createData);
      // Reload tasks
      const tasksData = await getTasks({ includeChildren: true, parentId: null });
      setTasks(tasksData);
      setCreatingTask(false);
    } catch (error) {
      console.error("Error creating task:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Helper function to update a task in the tree
  const updateTaskInTree = useCallback((taskList: Task[], taskId: string, updatedTask: Task): Task[] => {
    return taskList.map((task) => {
      if (task.id === taskId) {
        // Replace the task with all its data including habits and children
        return updatedTask;
      }
      if (task.children && task.children.length > 0) {
        // Recursively update children
        return {
          ...task,
          children: updateTaskInTree(task.children, taskId, updatedTask),
        };
      }
      return task;
    });
  }, []);

  // Helper function to remove a task from the tree
  const removeTaskFromTree = useCallback((taskList: Task[], taskId: string): Task[] => {
    return taskList
      .filter((task) => task.id !== taskId)
      .map((task) => {
        if (task.children && task.children.length > 0) {
          return {
            ...task,
            children: removeTaskFromTree(task.children, taskId),
          };
        }
        return task;
      });
  }, []);

  // Helper function to add a task to the tree at the correct parent
  const addTaskToTree = useCallback((taskList: Task[], task: Task): Task[] => {
    if (!task.parentId) {
      // Root task - add to root level
      const existingIndex = taskList.findIndex((t) => t.id === task.id);
      if (existingIndex >= 0) {
        // Replace existing
        const newList = [...taskList];
        newList[existingIndex] = task;
        return newList;
      }
      return [...taskList, task];
    }
    
    // Find parent and add as child
    return taskList.map((t) => {
      if (t.id === task.parentId) {
        return {
          ...t,
          children: t.children ? [...t.children, task] : [task],
        };
      }
      if (t.children && t.children.length > 0) {
        return {
          ...t,
          children: addTaskToTree(t.children, task),
        };
      }
      return t;
    });
  }, []);

  const handleEdit = async (data: { title: string; importance: number; description?: string; progress?: number; deadline?: string | null; groupId?: string | null; parentId?: string | null; labelIds?: string[] }) => {
    if (!editingTask) return;
    setSaving(true);
    try {
      const updateData = {
        id: editingTask.id,
        title: data.title,
        importance: data.importance,
        description: data.description,
        progress: data.progress,
        deadline: data.deadline || undefined,
        groupId: data.groupId || undefined,
        parentId: data.parentId || undefined,
        labelIds: data.labelIds,
      };
      // The PUT endpoint now returns the task with all children and habits recursively
      const fullUpdatedTask: Task = await updateTask(updateData);
      
      // Extract all habits from the updated task tree to update the habits state
      const extractHabitsFromTask = (task: Task): Habit[] => {
        const habits: Habit[] = [...(task.habits || [])];
        if (task.children) {
          task.children.forEach((child) => {
            habits.push(...extractHabitsFromTask(child));
          });
        }
        return habits;
      };
      const updatedHabits = extractHabitsFromTask(fullUpdatedTask);
      
      // Update habits state with the updated habits from the task
      setHabits((prevHabits) => {
        const habitMap = new Map(prevHabits.map((h) => [h.id, h]));
        // Update or add habits from the task
        updatedHabits.forEach((habit) => {
          habitMap.set(habit.id, habit);
        });
        return Array.from(habitMap.values());
      });
      
      // Check if parent changed
      const parentChanged = data.parentId !== undefined && data.parentId !== editingTask.parentId;
      
      if (parentChanged) {
        // Remove from old location and add to new location
        setTasks((prevTasks) => {
          let newTasks = removeTaskFromTree(prevTasks, editingTask.id);
          newTasks = addTaskToTree(newTasks, fullUpdatedTask);
          return newTasks;
        });
      } else {
        // Just update in place
        setTasks((prevTasks) => updateTaskInTree(prevTasks, editingTask.id, fullUpdatedTask));
      }
      
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
      // Reload tasks
      const tasksData = await getTasks({ includeChildren: true, parentId: null });
      setTasks(tasksData);
      setDeletingTask(null);
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const handleProgressUpdate = async (taskId: string, newProgress: number) => {
    try {
      await updateTask({ id: taskId, progress: newProgress });
      // Reload tasks
      const tasksData = await getTasks({ includeChildren: true, parentId: null });
      setTasks(tasksData);
    } catch (error) {
      console.error("Error updating task progress:", error);
    }
  };

  // Separate active and completed tasks
  const activeTasks = useMemo(() => {
    return tasks.filter((task) => !isTaskCompleted(task));
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter((task) => isTaskCompleted(task));
  }, [tasks]);

  const allLeafTasks = useMemo(() => getAllLeafTasks(tasks), [tasks]);
  const totalTasks = allLeafTasks.length;

  // Set header subtitle with total count
  useEffect(() => {
    setHeaderSubtitle(totalTasks > 0 ? `${totalTasks} total` : null);
    return () => setHeaderSubtitle(null);
  }, [setHeaderSubtitle, totalTasks]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <Button onClick={() => setCreatingTask(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      {/* Active Tasks Section */}
      {activeTasks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Active Tasks</h3>
          <TaskTree
            tasks={activeTasks}
            groups={groups}
            habits={habits}
            expandedTasks={expandedTasks}
            onToggleExpand={handleToggleExpand}
            onEdit={(task) => setEditingTask(task)}
            onDelete={(task) => setDeletingTask(task)}
            onProgressUpdate={handleProgressUpdate}
            taskRefs={taskRefs.current}
            onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
          />
        </div>
      )}

      {/* Completed Tasks Section */}
      {completedTasks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Completed Tasks</h3>
          <TaskTree
            tasks={completedTasks}
            groups={groups}
            habits={habits}
            expandedTasks={expandedTasks}
            onToggleExpand={handleToggleExpand}
            onEdit={(task) => setEditingTask(task)}
            onDelete={(task) => setDeletingTask(task)}
            onProgressUpdate={handleProgressUpdate}
            taskRefs={taskRefs.current}
            onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
          />
        </div>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description="Get started by creating your first task"
          action={{
            label: "Create Task",
            onClick: () => setCreatingTask(true),
          }}
        />
      )}

      {/* Create Task Dialog */}
      <Dialog open={creatingTask} onOpenChange={setCreatingTask}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <TaskForm
            groups={groups}
            labels={labels}
            availableTasks={tasks}
            onSubmit={handleCreate}
            onCancel={() => setCreatingTask(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
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
              availableTasks={tasks}
              onSubmit={handleEdit}
              onCancel={() => setEditingTask(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the task
              {deletingTask?.children && deletingTask.children.length > 0 && (
                <> and all {deletingTask.children.length} child task{deletingTask.children.length > 1 ? 's' : ''}</>
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
    </div>
  );
}
