"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  const [visibleCount, setVisibleCount] = useState(() =>
    forceShowAll ? items.length : Math.min(pageSize, items.length)
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastResetKeyRef = useRef<typeof resetKey>(resetKey);

  useEffect(() => {
    const shouldReset = lastResetKeyRef.current !== resetKey;
    lastResetKeyRef.current = resetKey;
    if (forceShowAll) {
      setVisibleCount(items.length);
      return;
    }
    if (shouldReset) {
      setVisibleCount(Math.min(pageSize, items.length));
      return;
    }
    setVisibleCount((prev) => {
      if (items.length === 0) return 0;
      const next = Math.max(prev, Math.min(pageSize, items.length));
      return next;
    });
  }, [items.length, pageSize, forceShowAll, resetKey]);

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
      { rootMargin, threshold }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [items.length, pageSize, rootMargin, threshold, forceShowAll, visibleCount]);

  const visibleItems = useMemo(() => {
    if (forceShowAll) return items;
    return items.slice(0, visibleCount);
  }, [items, visibleCount, forceShowAll]);

  const hasMore = !forceShowAll && visibleCount < items.length;

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
