"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getScrollParent } from "./scroll-parent";

interface LazyListProps<T> {
  items: T[];
  render: (visibleItems: T[]) => ReactNode;
  pageSize?: number;
  className?: string;
  sentinelClassName?: string;
  rootMargin?: string;
  threshold?: number;
  forceShowAll?: boolean;
  resetKey?: string | number;
}

export function LazyList<T>({
  items,
  render,
  pageSize = 12,
  className,
  sentinelClassName,
  rootMargin = "200px",
  threshold = 0,
  forceShowAll = false,
  resetKey,
}: LazyListProps<T>) {
  const componentKey = `${String(resetKey ?? "__lazy_list__")}:${pageSize}:${forceShowAll ? "all" : "paged"}`;

  return (
    <LazyListContent
      key={componentKey}
      items={items}
      render={render}
      pageSize={pageSize}
      className={className}
      sentinelClassName={sentinelClassName}
      rootMargin={rootMargin}
      threshold={threshold}
      forceShowAll={forceShowAll}
    />
  );
}

interface LazyListContentProps<T> {
  items: T[];
  render: (visibleItems: T[]) => ReactNode;
  pageSize: number;
  className?: string;
  sentinelClassName?: string;
  rootMargin: string;
  threshold: number;
  forceShowAll: boolean;
}

function LazyListContent<T>({
  items,
  render,
  pageSize,
  className,
  sentinelClassName,
  rootMargin,
  threshold,
  forceShowAll,
}: LazyListContentProps<T>) {
  const [visibleCount, setVisibleCount] = useState(() =>
    forceShowAll ? items.length : Math.min(pageSize, items.length)
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (forceShowAll) return;
    if (!sentinelRef.current) return;
    if (visibleCount >= items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
      },
      { root: getScrollParent(sentinelRef.current), rootMargin, threshold }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [items.length, pageSize, rootMargin, threshold, forceShowAll, visibleCount]);

  const effectiveVisibleCount = useMemo(() => {
    if (forceShowAll) return items.length;
    const minimumVisible = Math.min(pageSize, items.length);
    return Math.min(items.length, Math.max(visibleCount, minimumVisible));
  }, [forceShowAll, items.length, pageSize, visibleCount]);

  const visibleItems = useMemo(() => {
    if (forceShowAll) return items;
    return items.slice(0, effectiveVisibleCount);
  }, [items, effectiveVisibleCount, forceShowAll]);

  const hasMore = !forceShowAll && effectiveVisibleCount < items.length;

  return (
    <div className={className}>
      {render(visibleItems)}
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
