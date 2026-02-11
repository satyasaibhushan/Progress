"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ListTodo, Calendar, Folder, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/app/api/search/route";

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (query.trim().length === 0) {
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        setResults(data.data || []);
        setShowResults(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowResults(false);
      inputRef.current?.blur();
    }
  };

  const handleResultClick = (result: SearchResult) => {
    let path: string;
    switch (result.type) {
      case "task":
        path = "/tasks";
        break;
      case "habit":
        path = "/habits";
        break;
      case "group":
        path = "/groups";
        break;
      case "label":
        path = "/labels";
        break;
      default:
        return;
    }

    router.push(`${path}?highlight=${result.id}`);
    setQuery("");
    setResults([]);
    setShowResults(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search tasks and habits..."
          aria-label="Search tasks and habits"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setShowResults(true);
            }
          }}
          className="pl-9 pr-9"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Results dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          {results.map((result, index) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => handleResultClick(result)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0",
                selectedIndex === index && "bg-slate-50"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {result.type === "task" && <ListTodo className="w-4 h-4 text-indigo-600" />}
                  {result.type === "habit" && <Calendar className="w-4 h-4 text-orange-600" />}
                  {result.type === "group" && <Folder className="w-4 h-4 text-blue-600" />}
                  {result.type === "label" && (
                    <Tag className="w-4 h-4" style={{ color: result.color || "#64748b" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium truncate">{result.title}</h4>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full flex-shrink-0",
                        result.type === "task" && "bg-indigo-100 text-indigo-700",
                        result.type === "habit" && "bg-orange-100 text-orange-700",
                        result.type === "group" && "bg-blue-100 text-blue-700",
                        result.type === "label" && "bg-purple-100 text-purple-700"
                      )}
                    >
                      {result.type}
                    </span>
                  </div>
                  {result.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
                      {result.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {result.groupName && (
                      <span className="flex items-center gap-1">
                        <Folder className="w-3 h-3" />
                        {result.groupName}
                      </span>
                    )}
                    {result.parentTaskTitle && (
                      <span className="flex items-center gap-1">
                        <ListTodo className="w-3 h-3" />
                        {result.parentTaskTitle}
                      </span>
                    )}
                    {result.itemCount !== undefined && (
                      <span>
                        {result.itemCount} item{result.itemCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showResults && query.trim().length > 0 && results.length === 0 && !isSearching && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg p-4 z-50">
          <p className="text-sm text-muted-foreground text-center">No results found</p>
        </div>
      )}
    </div>
  );
}
