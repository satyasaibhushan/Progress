"use client";

import * as React from "react";
import { Label } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface LabelSelectorProps {
  labels: Label[];
  selectedLabelIds: string[];
  onSelectionChange: (labelIds: string[]) => void;
  availableLabels: Label[];
  onCreateNew?: () => void;
  className?: string;
}

export function LabelSelector({
  labels,
  selectedLabelIds,
  onSelectionChange,
  availableLabels,
  onCreateNew,
  className
}: LabelSelectorProps) {
  const handleToggle = (labelId: string) => {
    if (selectedLabelIds.includes(labelId)) {
      onSelectionChange(selectedLabelIds.filter(id => id !== labelId));
    } else {
      onSelectionChange([...selectedLabelIds, labelId]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {labels.map((label) => (
          <Badge
            key={label.id}
            variant="secondary"
            className="cursor-pointer"
            style={{
              backgroundColor: `${label.color}20`,
              color: label.color,
              borderColor: label.color
            }}
            onClick={() => handleToggle(label.id)}
          >
            {label.name}
            {selectedLabelIds.includes(label.id) && (
              <span className="ml-1">✓</span>
            )}
          </Badge>
        ))}
      </div>
      
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            {selectedLabelIds.length > 0 
              ? `${selectedLabelIds.length} selected` 
              : "Select labels"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-2">
            <div className="font-medium text-sm mb-2">Select Labels</div>
            {availableLabels.map((label) => (
              <div key={label.id} className="flex items-center space-x-2">
                <Checkbox
                  id={label.id}
                  checked={selectedLabelIds.includes(label.id)}
                  onCheckedChange={() => handleToggle(label.id)}
                />
                <label
                  htmlFor={label.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                >
                  <Badge
                    variant="secondary"
                    style={{
                      backgroundColor: `${label.color}20`,
                      color: label.color
                    }}
                  >
                    {label.name}
                  </Badge>
                </label>
              </div>
            ))}
            {onCreateNew && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2"
                onClick={onCreateNew}
              >
                + Create New Label
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
