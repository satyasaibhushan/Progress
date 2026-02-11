"use client";

import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { TasksPageContent } from "./_components/task-status-tab-content";

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingSkeleton count={10} />}>
      <TasksPageContent />
    </Suspense>
  );
}
