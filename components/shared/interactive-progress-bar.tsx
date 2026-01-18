"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "@radix-ui/react-progress";

interface InteractiveProgressBarProps {
  value: number;
  onValueChange: (value: number) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  min?: number;
  max?: number;
}

export function InteractiveProgressBar({
  value,
  onValueChange,
  disabled = false,
  className,
  min = 1,
  max = 99,
}: InteractiveProgressBarProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [clickedValue, setClickedValue] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced update function
  const debouncedUpdate = useCallback(
    (newValue: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Set clicked value for animation
      setClickedValue(newValue);
      setIsUpdating(true);
      
      debounceTimerRef.current = setTimeout(async () => {
        try {
          await onValueChange(newValue);
          // Clear clicked value after animation completes
          setTimeout(() => {
            setClickedValue(null);
            setIsUpdating(false);
          }, 300);
        } catch (error) {
          console.error("Error updating progress:", error);
          setClickedValue(null);
          setIsUpdating(false);
        }
      }, 100); // Reduced debounce for faster response
    },
    [onValueChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || isUpdating) return;

      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      // Calculate percentage, ensuring we can reach 100% when clicking at the end
      const percentage = Math.round((x / rect.width) * 100);
      // If clicking very close to the end (within last 2%), set to 100%
      const adjustedPercentage = x >= rect.width * 0.98 ? 100 : percentage;

      // Clamp between min and max
      // Allow 100% but prevent 0% (min defaults to 1)
      const clampedValue = Math.max(min, Math.min(max, adjustedPercentage));
      setHoverValue(clampedValue);
    },
    [disabled, isUpdating, min, max]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || isUpdating) return;

      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      // Calculate percentage, ensuring we can reach 100% when clicking at the end
      const percentage = Math.round((x / rect.width) * 100);
      // If clicking very close to the end (within last 2%), set to 100%
      const adjustedPercentage = x >= rect.width * 0.98 ? 100 : percentage;

      // Clamp between min and max
      // Allow 100% but prevent 0% (min defaults to 1)
      const clampedValue = Math.max(min, Math.min(max, adjustedPercentage));
      
      // Only update if different from current value
      if (clampedValue !== value) {
        debouncedUpdate(clampedValue);
      }
    },
    [disabled, isUpdating, value, min, max, debouncedUpdate]
  );

  const showHoverPreview = hoverValue !== null && hoverValue !== value && !isUpdating && clickedValue === null;
  const showClickAnimation = clickedValue !== null;
  const isHovering = hoverValue !== null;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={progressRef}
        className="relative cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Base Progress Bar (current value) */}
        <ProgressPrimitive.Root
          className={cn(
            "bg-slate-200 dark:bg-slate-800 relative h-1.5 w-full overflow-hidden rounded-full",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <ProgressPrimitive.Indicator
            className="bg-indigo-600 h-full w-full flex-1 transition-all duration-300"
            style={{ transform: `translateX(-${100 - value}%)` }}
          />
        </ProgressPrimitive.Root>

        {/* Hover Preview (semi-transparent overlay) */}
        {showHoverPreview && (
          <div className="absolute top-0 left-0 w-full h-1.5 pointer-events-none">
            <ProgressPrimitive.Root className="bg-transparent relative h-full w-full overflow-hidden rounded-full">
              <ProgressPrimitive.Indicator
                className="bg-indigo-600 h-full w-full flex-1 opacity-40 transition-all duration-150"
                style={{ transform: `translateX(-${100 - (hoverValue || 0)}%)` }}
              />
            </ProgressPrimitive.Root>
          </div>
        )}

        {/* Click Animation (transitions from hover opacity to full) */}
        {showClickAnimation && (
          <div className="absolute top-0 left-0 w-full h-1.5 pointer-events-none">
            <ProgressPrimitive.Root className="bg-transparent relative h-full w-full overflow-hidden rounded-full">
              <ProgressPrimitive.Indicator
                className="bg-indigo-600 h-full w-full flex-1 transition-opacity duration-300 opacity-100"
                style={{ transform: `translateX(-${100 - (clickedValue || 0)}%)` }}
              />
            </ProgressPrimitive.Root>
          </div>
        )}

        {/* Percentage Labels - shown on hover */}
        {isHovering && (
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

            {/* Hovered progress percentage */}
            {showHoverPreview && hoverValue !== null && (
              <div
                className="absolute top-0 transform -translate-y-full -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-600/90 text-white whitespace-nowrap pointer-events-none"
                style={{
                  left: `${hoverValue}%`,
                  marginBottom: "3px",
                }}
              >
                {hoverValue}%
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
