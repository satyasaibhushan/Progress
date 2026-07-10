"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { SuggestionsCarousel } from "@/components/suggestions/suggestions-carousel";
import { useState, createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TimezoneSync } from "@/components/providers/timezone-sync";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

// Context for header actions
const HeaderActionContext = createContext<{
  setHeaderRightAction: (action: React.ReactNode) => void;
  setHeaderSubtitle: (subtitle: string | null) => void;
}>({
  setHeaderRightAction: () => {},
  setHeaderSubtitle: () => {},
});

export const useHeaderAction = () => useContext(HeaderActionContext);

export default function Layout({ children }: { children: React.ReactNode }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [headerRightAction, setHeaderRightAction] = useState<React.ReactNode>(null);
  const [headerSubtitle, setHeaderSubtitle] = useState<string | null>(null);
  const [timezoneReady, setTimezoneReady] = useState(false);
  const router = useRouter();
  const handleTimezoneReady = useCallback(() => setTimezoneReady(true), []);

  const handleNavigate = (type: "task" | "habit", id: string) => {
    if (type === "task") {
      router.push(`/tasks?highlight=${id}`);
    } else {
      router.push(`/habits?highlight=${id}`);
    }
    setShowSuggestions(false);
  };

  return (
    <HeaderActionContext.Provider value={{ setHeaderRightAction, setHeaderSubtitle }}>
      <TimezoneSync onReady={handleTimezoneReady} />
      <DashboardLayout 
        onSuggestionsClick={() => setShowSuggestions(true)}
        headerRightAction={headerRightAction}
        headerSubtitle={headerSubtitle || undefined}
      >
        {timezoneReady ? children : <LoadingSkeleton count={10} />}
      </DashboardLayout>
      {showSuggestions && (
        <SuggestionsCarousel
          onClose={() => setShowSuggestions(false)}
          onNavigate={handleNavigate}
        />
      )}
    </HeaderActionContext.Provider>
  );
}
