"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface ScrollHintProps {
  children: ReactNode;
  className?: string;
  wrapperClassName?: string;
  watch?: number;
}

export function ScrollHint({
  children,
  className,
  wrapperClassName,
  watch,
}: ScrollHintProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const hasOverflow = scrollHeight > clientHeight + 1;
      setShowTop(hasOverflow && scrollTop > 2);
      setShowBottom(hasOverflow && scrollTop + clientHeight < scrollHeight - 2);
    };

    update();

    const handleScroll = () => update();
    const handleResize = () => update();

    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [watch]);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <div ref={containerRef} className={cn("overflow-y-auto", className)}>
        {children}
      </div>
      {showTop && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
      )}
      {showBottom && (
        <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent flex items-end justify-center pb-1">
          <ChevronDown className="h-4 w-4 text-muted-foreground/70 animate-pulse" />
        </div>
      )}
    </div>
  );
}
