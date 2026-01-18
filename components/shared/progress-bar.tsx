"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  color?: string;
}

export function ProgressBar({ 
  value, 
  max = 100, 
  className,
  showLabel = false,
  labelClassName,
  color
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className={cn("flex items-center justify-between mb-2", labelClassName)}>
          <span className="text-sm text-muted-foreground">Progress</span>
          <span className="text-sm font-medium">{Math.round(percentage)}%</span>
        </div>
      )}
      <Progress 
        value={percentage} 
        className="h-2"
        style={color ? { ['--progress-background' as string]: color } : undefined}
      />
    </div>
  );
}
