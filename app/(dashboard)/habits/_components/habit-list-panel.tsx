"use client";

import { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ServerLazyList } from "@/components/shared/server-lazy-list";
import { HabitStatus } from "@/lib/api/habits";
import { Habit } from "@/types";
import { HabitPageState } from "../_lib/habit-page-helpers";

interface HabitListPanelProps {
  activeTab: HabitStatus;
  onTabChange: (status: HabitStatus) => void;
  statusCounts: Record<HabitStatus, number>;
  habitPages: Record<HabitStatus, HabitPageState>;
  renderHabitItem: (habit: Habit) => ReactNode;
  loadHabitPage: (status: HabitStatus) => Promise<Habit[] | null>;
}

function renderStatusContent({
  status,
  emptyLabel,
  habitPages,
  loadHabitPage,
  renderHabitItem,
}: {
  status: HabitStatus;
  emptyLabel: string;
  habitPages: Record<HabitStatus, HabitPageState>;
  loadHabitPage: (status: HabitStatus) => Promise<Habit[] | null>;
  renderHabitItem: (habit: Habit) => ReactNode;
}) {
  const statusHabits = habitPages[status].items;

  if (!habitPages[status].initialized || (habitPages[status].loadingMore && statusHabits.length === 0)) {
    return <LoadingSkeleton count={4} />;
  }

  if (statusHabits.length === 0) {
    return <p className="text-center text-muted-foreground py-8">{emptyLabel}</p>;
  }

  return (
    <ServerLazyList
      items={statusHabits}
      hasMore={habitPages[status].hasMore}
      loadingMore={habitPages[status].loadingMore}
      onLoadMore={() => loadHabitPage(status)}
      className="space-y-3"
      render={(pagedHabits) => <>{pagedHabits.map(renderHabitItem)}</>}
    />
  );
}

export function HabitListPanel({
  activeTab,
  onTabChange,
  statusCounts,
  habitPages,
  renderHabitItem,
  loadHabitPage,
}: HabitListPanelProps) {
  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as HabitStatus)} className="flex flex-col h-full">
      <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
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

      <TabsContent value="active" className="flex-1 overflow-y-auto pr-2 space-y-3 mt-4">
        {renderStatusContent({
          status: "active",
          emptyLabel: "No active habits",
          habitPages,
          loadHabitPage,
          renderHabitItem,
        })}
      </TabsContent>

      <TabsContent value="future" className="flex-1 overflow-y-auto pr-2 space-y-3 mt-4">
        {renderStatusContent({
          status: "future",
          emptyLabel: "No future habits",
          habitPages,
          loadHabitPage,
          renderHabitItem,
        })}
      </TabsContent>

      <TabsContent value="completed" className="flex-1 overflow-y-auto pr-2 space-y-3 mt-4">
        {renderStatusContent({
          status: "completed",
          emptyLabel: "No completed habits",
          habitPages,
          loadHabitPage,
          renderHabitItem,
        })}
      </TabsContent>
    </Tabs>
  );
}
