"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "@radix-ui/react-progress";

interface HabitProgressBarProps {
  value: number;
  className?: string;
  showPercentageOnHover?: boolean;
  isHighlighted?: boolean;
}

export function HabitProgressBar({
  value,
  className,
  showPercentageOnHover = true,
  isHighlighted = false,
}: HabitProgressBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (showPercentageOnHover) {
      setIsHovered(true);
    }
  }, [showPercentageOnHover]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const showPercentage = (isHovered || isHighlighted) && showPercentageOnHover;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={progressRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Base Progress Bar (current value only - read-only) */}
        <ProgressPrimitive.Root
          className="bg-slate-200 dark:bg-slate-800 relative h-1.5 w-full overflow-hidden rounded-full"
        >
          <ProgressPrimitive.Indicator
            className="bg-indigo-600 h-full w-full flex-1 transition-all duration-300"
            style={{ transform: `translateX(-${100 - value}%)` }}
          />
        </ProgressPrimitive.Root>

        {/* Percentage Label - shown on hover or when highlighted */}
        {showPercentage && (
          <>
            {/* Current progress percentage */}
            {value > 0 && value < 100 && (
              <div
                className="absolute top-0 transform -translate-y-full -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/90 text-white whitespace-nowrap pointer-events-none"
                style={{
                  left: `${value}%`,
                  marginBottom: "3px",
                }}
              >
                {value}%
              </div>
            )}
            {value === 100 && (
              <div className="absolute top-0 right-0 transform -translate-y-full mb-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/90 text-white whitespace-nowrap pointer-events-none">
                {value}%
              </div>
            )}
            {value === 0 && (
              <div className="absolute top-0 left-0 transform -translate-y-full mb-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/90 text-white whitespace-nowrap pointer-events-none">
                {value}%
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
