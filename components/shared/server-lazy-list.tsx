"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ServerLazyListProps<T> {
  items: T[];
  render: (items: T[]) => ReactNode;
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
  className?: string;
  sentinelClassName?: string;
  rootMargin?: string;
  threshold?: number;
}

export function ServerLazyList<T>({
  items,
  render,
  hasMore,
  loadingMore = false,
  onLoadMore,
  className,
  sentinelClassName,
  rootMargin = "200px",
  threshold = 0,
}: ServerLazyListProps<T>) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        onLoadMore();
      },
      { rootMargin, threshold }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, rootMargin, threshold]);

  return (
    <div className={className}>
      {render(items)}
      {hasMore && (
        <div
          ref={sentinelRef}
          className={cn("h-6 w-full", sentinelClassName)}
          aria-hidden
        />
      )}
    </div>
  );
}
