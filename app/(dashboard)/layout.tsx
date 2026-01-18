"use client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { SuggestionsCarousel } from "@/components/suggestions/suggestions-carousel";
import { useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";

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
  const router = useRouter();

  const handleNavigate = (type: "task" | "habit", id: string) => {
    router.push(`/${type === "task" ? "tasks" : "habits"}/${id}`);
    setShowSuggestions(false);
  };

  return (
    <HeaderActionContext.Provider value={{ setHeaderRightAction, setHeaderSubtitle }}>
      <DashboardLayout 
        onSuggestionsClick={() => setShowSuggestions(true)}
        headerRightAction={headerRightAction}
        headerSubtitle={headerSubtitle || undefined}
      >
        {children}
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
