"use client";

import { CheckCircle2, Target, Clock, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatTileProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
}

export function StatTile({
  icon,
  value,
  label,
  subtitle,
  trend,
  className,
}: StatTileProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
            {icon}
          </div>
          {trend && (
            <span
              className={cn(
                "text-xs px-2 py-1 rounded",
                trend.isPositive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}
            >
              {trend.value}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-semibold mb-1">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

interface OverviewStatsProps {
  completionRate: number;
  completedTasks: number;
  totalTasks: number;
  avgProgress: number;
  tasksThisWeek: number;
  overdueTasks?: number;
  habitCompletionRate: number;
  habitsOnTrack: number;
  activeHabits: number;
}

export function OverviewStats({
  completionRate,
  completedTasks,
  totalTasks,
  avgProgress,
  tasksThisWeek,
  overdueTasks = 0,
  habitCompletionRate,
  habitsOnTrack,
  activeHabits,
}: OverviewStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatTile
        icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
        value={`${completionRate}%`}
        label="Completion Rate"
        subtitle={`${completedTasks} of ${totalTasks} tasks`}
      />
      <StatTile
        icon={<Target className="w-5 h-5 text-indigo-600" />}
        value={`${avgProgress}%`}
        label="Avg Progress"
        subtitle="Across all tasks"
        trend={{ value: "+5% from last period", isPositive: true }}
      />
      <StatTile
        icon={<Clock className="w-5 h-5 text-amber-600" />}
        value={tasksThisWeek}
        label="Due This Week"
        subtitle={overdueTasks > 0 ? `${overdueTasks} overdue items` : undefined}
      />
      <StatTile
        icon={<Flame className="w-5 h-5 text-purple-600" />}
        value={`${habitCompletionRate}%`}
        label="Habits On Track"
        subtitle={`${habitsOnTrack} of ${activeHabits} habits`}
      />
    </div>
  );
}
