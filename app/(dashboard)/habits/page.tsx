"use client";

import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { HabitsPageContent } from "./_components/habit-detail-panel";

export default function HabitsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton count={10} />}>
      <HabitsPageContent />
    </Suspense>
  );
}
