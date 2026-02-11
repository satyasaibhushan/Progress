"use client";

import { Edit, Tag, Trash2 } from "lucide-react";
import { Label } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LazyList } from "@/components/shared/lazy-list";
import { cn } from "@/lib/utils";

interface LabelListPanelProps {
  labels: Label[];
  selectedLabelId: string | null;
  highlightedLabelId: string | null;
  pageSize: number;
  forceShowAll: boolean;
  onSelect: (label: Label) => void;
  onEdit: (label: Label) => void;
  onDelete: (labelId: string) => void;
}

export function LabelListPanel({
  labels,
  selectedLabelId,
  highlightedLabelId,
  pageSize,
  forceShowAll,
  onSelect,
  onEdit,
  onDelete,
}: LabelListPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
      <LazyList
        items={labels}
        pageSize={pageSize}
        forceShowAll={forceShowAll}
        className="space-y-3"
        render={(visibleLabels) => (
          <>
            {visibleLabels.map((label) => {
              const isSelected = selectedLabelId === label.id;
              const isHighlighted = highlightedLabelId === label.id;

              return (
                <Card
                  key={label.id}
                  className={cn(
                    "p-4 cursor-pointer transition-all group",
                    isSelected || isHighlighted
                      ? "border-indigo-600 bg-indigo-50"
                      : "hover:border-slate-300"
                  )}
                  onClick={() => onSelect(label)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open label ${label.name}`}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelect(label);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <Tag className="w-4 h-4" style={{ color: label.color }} />
                      <span className="text-sm font-medium">{label.name}</span>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity",
                        (isSelected || isHighlighted) && "opacity-100"
                      )}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(label);
                        }}
                        aria-label={`Edit label ${label.name}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(label.id);
                        }}
                        aria-label={`Delete label ${label.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </>
        )}
      />
    </div>
  );
}
