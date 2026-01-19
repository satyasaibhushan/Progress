"use client";

import { ImportancePreset } from "@/types";
import { cn } from "@/lib/utils";

interface ImportanceIndicatorProps {
  importance: number;
  preset?: ImportancePreset;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
}

interface ImportanceInfo {
  dotClasses: string;
  textClasses: string;
  name: string;
}

export function ImportanceIndicator({
  importance,
  preset,
  size = 'md',
  showValue = false
}: ImportanceIndicatorProps) {
  // Map preset to Tailwind classes
  const getPresetInfo = (preset?: ImportancePreset): ImportanceInfo => {
    switch (preset) {
      case 'CRITICAL':
        return { dotClasses: 'bg-red-600 border-red-900', name: 'Critical', textClasses: 'text-red-600' };
      case 'HIGH':
        return { dotClasses: 'bg-amber-600 border-amber-700', name: 'High', textClasses: 'text-amber-600' };
      case 'MEDIUM':
        return { dotClasses: 'bg-blue-600 border-blue-700', name: 'Medium', textClasses: 'text-blue-600' };
      case 'LOW':
        return { dotClasses: 'bg-green-600 border-green-700', name: 'Low', textClasses: 'text-green-600' };
      default:
        // If no preset, use importance number to determine color
        if (importance >= 90) return { dotClasses: 'bg-red-600 border-red-900', name: 'Critical', textClasses: 'text-red-600' };
        if (importance >= 70) return { dotClasses: 'bg-amber-600 border-amber-700', name: 'High', textClasses: 'text-amber-600' };
        if (importance >= 40) return { dotClasses: 'bg-blue-600 border-blue-700', name: 'Medium', textClasses: 'text-blue-600' };
        return { dotClasses: 'bg-green-600 border-green-700', name: 'Low', textClasses: 'text-green-600' };
    }
  };

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const info = getPresetInfo(preset);

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          sizeClasses[size],
          'rounded-full border-2',
          info.dotClasses
        )}
        title={`Importance: ${info.name} (${importance}/100)`}
      />
      {showValue && (
        <span className={cn('text-xs', info.textClasses)}>{info.name}</span>
      )}
    </div>
  );
}
