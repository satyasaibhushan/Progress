"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ServerLazyList } from "@/components/shared/server-lazy-list";
import { TaskTree } from "@/components/tasks/task-tree";
import { Group, Task } from "@/types";
import { TaskStatus } from "@/lib/api/tasks";
import { TaskPageState } from "../_lib/task-page-helpers";

interface TaskTabsPanelProps {
  activeTab: TaskStatus;
  onTabChange: (status: TaskStatus) => void;
  statusCounts: Record<TaskStatus, number>;
  taskPages: Record<TaskStatus, TaskPageState>;
  groups: Group[];
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onProgressUpdate: (taskId: string, newProgress: number) => Promise<void>;
  taskRefs: Record<string, HTMLDivElement | null>;
  onHabitClick: (habitId: string) => void;
  onAddTask: (task: Task) => void;
  onAddHabit: (task: Task) => void;
  highlightedHabitId: string | null;
  loadTaskPage: (status: TaskStatus) => Promise<Task[] | null>;
  isTaskCompleted: (task: Task) => boolean;
}

function renderStatusContent({
  status,
  emptyLabel,
  taskPages,
  loadTaskPage,
  groups,
  expandedTasks,
  onToggleExpand,
  onEdit,
  onDelete,
  onProgressUpdate,
  taskRefs,
  onHabitClick,
  onAddTask,
  onAddHabit,
  highlightedHabitId,
  isTaskCompleted,
}: {
  status: TaskStatus;
  emptyLabel: string;
  taskPages: Record<TaskStatus, TaskPageState>;
  loadTaskPage: (status: TaskStatus) => Promise<Task[] | null>;
  groups: Group[];
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onProgressUpdate: (taskId: string, newProgress: number) => Promise<void>;
  taskRefs: Record<string, HTMLDivElement | null>;
  onHabitClick: (habitId: string) => void;
  onAddTask: (task: Task) => void;
  onAddHabit: (task: Task) => void;
  highlightedHabitId: string | null;
  isTaskCompleted: (task: Task) => boolean;
}) {
  const statusTasks = taskPages[status].items;

  if (!taskPages[status].initialized || (taskPages[status].loadingMore && statusTasks.length === 0)) {
    return <LoadingSkeleton count={4} />;
  }

  if (statusTasks.length === 0) {
    return <p className="text-center text-muted-foreground py-8">{emptyLabel}</p>;
  }

  return (
    <ServerLazyList
      items={statusTasks}
      hasMore={taskPages[status].hasMore}
      loadingMore={taskPages[status].loadingMore}
      onLoadMore={() => loadTaskPage(status)}
      className="space-y-4"
      render={(pagedTasks) => (
        <TaskTree
          tasks={pagedTasks}
          groups={groups}
          expandedTasks={expandedTasks}
          onToggleExpand={onToggleExpand}
          onEdit={onEdit}
          onDelete={onDelete}
          onProgressUpdate={onProgressUpdate}
          taskRefs={taskRefs}
          onHabitClick={onHabitClick}
          onAddTask={onAddTask}
          onAddHabit={onAddHabit}
          highlightedHabitId={highlightedHabitId}
          isTaskCompleted={isTaskCompleted}
        />
      )}
    />
  );
}

export function TaskTabsPanel({
  activeTab,
  onTabChange,
  statusCounts,
  taskPages,
  groups,
  expandedTasks,
  onToggleExpand,
  onEdit,
  onDelete,
  onProgressUpdate,
  taskRefs,
  onHabitClick,
  onAddTask,
  onAddHabit,
  highlightedHabitId,
  loadTaskPage,
  isTaskCompleted,
}: TaskTabsPanelProps) {
  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as TaskStatus)} className="w-full">
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
        {renderStatusContent({
          status: "active",
          emptyLabel: "No active tasks",
          taskPages,
          loadTaskPage,
          groups,
          expandedTasks,
          onToggleExpand,
          onEdit,
          onDelete,
          onProgressUpdate,
          taskRefs,
          onHabitClick,
          onAddTask,
          onAddHabit,
          highlightedHabitId,
          isTaskCompleted,
        })}
      </TabsContent>

      <TabsContent value="future" className="space-y-4 mt-6">
        {renderStatusContent({
          status: "future",
          emptyLabel: "No future tasks",
          taskPages,
          loadTaskPage,
          groups,
          expandedTasks,
          onToggleExpand,
          onEdit,
          onDelete,
          onProgressUpdate,
          taskRefs,
          onHabitClick,
          onAddTask,
          onAddHabit,
          highlightedHabitId,
          isTaskCompleted,
        })}
      </TabsContent>

      <TabsContent value="completed" className="space-y-4 mt-6">
        {renderStatusContent({
          status: "completed",
          emptyLabel: "No completed tasks",
          taskPages,
          loadTaskPage,
          groups,
          expandedTasks,
          onToggleExpand,
          onEdit,
          onDelete,
          onProgressUpdate,
          taskRefs,
          onHabitClick,
          onAddTask,
          onAddHabit,
          highlightedHabitId,
          isTaskCompleted,
        })}
      </TabsContent>
    </Tabs>
  );
}
