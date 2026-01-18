"use client";

import { ImportancePreset } from "@/types";

interface ImportanceIndicatorProps {
  importance: number;
  preset?: ImportancePreset;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
}

export function ImportanceIndicator({ 
  importance, 
  preset, 
  size = 'md', 
  showValue = false 
}: ImportanceIndicatorProps) {
  // Map preset to color and icon
  const getPresetInfo = (preset?: ImportancePreset) => {
    switch (preset) {
      case 'CRITICAL':
        return { bg: '#dc2626', border: '#991b1b', name: 'Critical', text: '#dc2626' };
      case 'HIGH':
        return { bg: '#f59e0b', border: '#d97706', name: 'High', text: '#f59e0b' };
      case 'MEDIUM':
        return { bg: '#3b82f6', border: '#2563eb', name: 'Medium', text: '#3b82f6' };
      case 'LOW':
        return { bg: '#22c55e', border: '#16a34a', name: 'Low', text: '#22c55e' };
      default:
        // If no preset, use importance number to determine color
        if (importance >= 90) return { bg: '#dc2626', border: '#991b1b', name: 'Critical', text: '#dc2626' };
        if (importance >= 70) return { bg: '#f59e0b', border: '#d97706', name: 'High', text: '#f59e0b' };
        if (importance >= 40) return { bg: '#3b82f6', border: '#2563eb', name: 'Medium', text: '#3b82f6' };
        return { bg: '#22c55e', border: '#16a34a', name: 'Low', text: '#22c55e' };
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
        className={`${sizeClasses[size]} rounded-full border-2`}
        style={{ 
          backgroundColor: info.bg,
          borderColor: info.border
        }}
        title={`Importance: ${info.name} (${importance}/100)`}
      />
      {showValue && (
        <span className="text-xs" style={{ color: info.text }}>{info.name}</span>
      )}
    </div>
  );
}
