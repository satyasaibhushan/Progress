"use client";

import * as React from "react";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/shared/search-bar";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string; // For showing counts like "4 total"
  onMenuClick?: () => void;
  onSuggestionsClick?: () => void;
  className?: string;
  rightAction?: React.ReactNode;
}

export function Header({ title, subtitle, onMenuClick, onSuggestionsClick, className, rightAction }: HeaderProps) {
  return (
    <header className={cn("sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-8 py-4", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold capitalize">{title}</h1>
            {subtitle && (
              <span className="text-sm text-muted-foreground font-normal">({subtitle})</span>
            )}
          </div>
        </div>

        {/* Search Bar - Hidden on mobile, shown on tablet and desktop */}
        <div className="hidden md:flex flex-1 max-w-md">
          <SearchBar />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {rightAction}
          <Button
            variant="ghost"
            size="icon"
            onClick={onSuggestionsClick}
            className="lg:hidden bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
            aria-label="Open suggestions"
          >
            <Sparkles className="w-5 h-5" />
          </Button>
          <div className="w-10 hidden lg:block" />
        </div>
      </div>
    </header>
  );
}
