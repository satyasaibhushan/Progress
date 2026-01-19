"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  onSuggestionsClick?: () => void;
  headerRightAction?: React.ReactNode;
  headerSubtitle?: string; // For showing counts like "4 total"
}

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/tasks": "Tasks",
  "/habits": "Habits",
  "/groups": "Groups",
  "/labels": "Labels",
  "/analytics": "Analytics",
};

// Helper to get page title from pathname, handling dynamic routes
function getPageTitle(pathname: string | null): string {
  if (!pathname) return "Dashboard";
  
  // Check exact match first
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }
  
  // Check for dynamic routes (e.g., /groups/[id], /labels/[id]/edit)
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path + "/")) {
      return title;
    }
  }
  
  return "Dashboard";
}

export function DashboardLayout({ children, onSuggestionsClick, headerRightAction, headerSubtitle }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 z-50 h-screen transform transition-transform duration-200 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
      >
        <Sidebar
          onSuggestionsClick={onSuggestionsClick}
          onClose={() => setSidebarOpen(false)}
          isMobile={sidebarOpen}
        />
      </div>

      {/* Main Content */}
      <div className="lg:pl-64 min-h-screen">
        <Header
          title={pageTitle}
          subtitle={headerSubtitle}
          onMenuClick={() => setSidebarOpen(true)}
          onSuggestionsClick={onSuggestionsClick}
          rightAction={headerRightAction}
        />
        <main className="p-4 lg:p-8 min-h-[calc(100vh_-_5rem)]">{children}</main>
      </div>
    </div>
  );
}
