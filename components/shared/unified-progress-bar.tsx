"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "@radix-ui/react-progress";

interface UnifiedProgressBarProps {
  value: number;
  onValueChange?: (value: number) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  min?: number;
  max?: number;
  showPercentageOnHover?: boolean;
  isHighlighted?: boolean;
  interactive?: boolean;
}

export function UnifiedProgressBar({
  value,
  onValueChange,
  disabled = false,
  className,
  ariaLabel = "Progress",
  min = 0,
  max = 100,
  showPercentageOnHover = false,
  isHighlighted = false,
  interactive = false,
}: UnifiedProgressBarProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [clickedValue, setClickedValue] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced update function for interactive mode
  const debouncedUpdate = useCallback(
    (newValue: number) => {
      if (!onValueChange || !interactive) return;
      
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
      }, 100);
    },
    [onValueChange, interactive]
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
      const percentage = Math.round((x / rect.width) * 100);
      
      if (interactive) {
        // For interactive mode, adjust to allow reaching 100%
        const adjustedPercentage = x >= rect.width * 0.98 ? 100 : percentage;
        const clampedValue = Math.max(min, Math.min(max, adjustedPercentage));
        setHoverValue(clampedValue);
      } else if (showPercentageOnHover) {
        // For read-only mode, just track hover position for percentage display
        const clampedValue = Math.max(0, Math.min(100, percentage));
        setHoverValue(clampedValue);
      }
      
      setIsHovered(true);
    },
    [disabled, isUpdating, min, max, interactive, showPercentageOnHover]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
    setIsHovered(false);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || disabled || isUpdating || !onValueChange) return;

      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const percentage = Math.round((x / rect.width) * 100);
      // Adjust to allow reaching 100%
      const adjustedPercentage = x >= rect.width * 0.98 ? 100 : percentage;
      const clampedValue = Math.max(min, Math.min(max, adjustedPercentage));
      
      // Only update if different from current value
      if (clampedValue !== value) {
        debouncedUpdate(clampedValue);
      }
    },
    [interactive, disabled, isUpdating, value, min, max, debouncedUpdate, onValueChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive || disabled || isUpdating || !onValueChange) return;

      let nextValue = value;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        nextValue = Math.min(max, value + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        nextValue = Math.max(min, value - 1);
      } else if (event.key === "PageUp") {
        nextValue = Math.min(max, value + 10);
      } else if (event.key === "PageDown") {
        nextValue = Math.max(min, value - 10);
      } else if (event.key === "Home") {
        nextValue = min;
      } else if (event.key === "End") {
        nextValue = max;
      } else {
        return;
      }

      event.preventDefault();
      if (nextValue !== value) {
        debouncedUpdate(nextValue);
      }
    },
    [interactive, disabled, isUpdating, onValueChange, value, min, max, debouncedUpdate]
  );

  const showHoverPreview = interactive && hoverValue !== null && hoverValue !== value && !isUpdating && clickedValue === null;
  const showClickAnimation = interactive && clickedValue !== null;
  const showPercentage = (isHovered || isHighlighted) && showPercentageOnHover;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={progressRef}
        className={cn(
          "relative",
          interactive && !disabled && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 rounded"
        )}
        onMouseMove={interactive || showPercentageOnHover ? handleMouseMove : undefined}
        onMouseLeave={interactive || showPercentageOnHover ? handleMouseLeave : undefined}
        onClick={interactive ? handleClick : undefined}
        onKeyDown={interactive ? handleKeyDown : undefined}
        role={interactive ? "slider" : undefined}
        tabIndex={interactive && !disabled ? 0 : undefined}
        aria-label={interactive ? ariaLabel : undefined}
        aria-valuemin={interactive ? min : undefined}
        aria-valuemax={interactive ? max : undefined}
        aria-valuenow={interactive ? value : undefined}
        aria-valuetext={interactive ? `${value}%` : undefined}
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

        {/* Hover Preview (semi-transparent overlay) - only for interactive mode */}
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

        {/* Click Animation (transitions from hover opacity to full) - only for interactive mode */}
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

        {/* Percentage Labels - shown on hover or when highlighted */}
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

            {/* Hovered progress percentage - only for interactive mode */}
            {interactive && showHoverPreview && hoverValue !== null && (
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
