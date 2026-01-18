"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/types";

interface LabelStatsProps {
  labels: Label[];
  selectedLabel: Label;
  onLabelChange: (label: Label) => void;
  stats: {
    totalItems: number;
    tasksCount: number;
    habitsCount: number;
    completedItems: number;
    avgTaskProgress: number;
    avgHabitProgress: number;
  };
}

export function LabelStats({
  labels,
  selectedLabel,
  onLabelChange,
  stats,
}: LabelStatsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Label Statistics</CardTitle>
          <Select
            value={selectedLabel.id}
            onValueChange={(value) => {
              const label = labels.find((l) => l.id === value);
              if (label) onLabelChange(label);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {labels.map((label) => (
                <SelectItem key={label.id} value={label.id}>
                  {label.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b">
            <Badge
              variant="secondary"
              style={{
                backgroundColor: `${selectedLabel.color}20`,
                color: selectedLabel.color,
              }}
            >
              {selectedLabel.name}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {stats.totalItems} total items
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Tasks</p>
              <p className="text-2xl font-semibold">{stats.tasksCount}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Habits</p>
              <p className="text-2xl font-semibold">{stats.habitsCount}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Completed</p>
              <p className="text-2xl font-semibold">{stats.completedItems}</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Remaining</p>
              <p className="text-2xl font-semibold">
                {stats.totalItems - stats.completedItems}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Task Progress</span>
                <span className="text-xs font-medium">{stats.avgTaskProgress}%</span>
              </div>
              <Progress value={stats.avgTaskProgress} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Habit Progress</span>
                <span className="text-xs font-medium">{stats.avgHabitProgress}%</span>
              </div>
              <Progress value={stats.avgHabitProgress} className="h-2" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
