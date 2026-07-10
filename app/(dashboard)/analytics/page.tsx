"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Calendar, Flame, Target } from "lucide-react";
import { getGroups } from "@/lib/api/groups";
import { getHabits } from "@/lib/api/habits";
import { getLabels } from "@/lib/api/labels";
import { getTasks } from "@/lib/api/tasks";
import type { Group, Habit, Label, Task } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { parseISO } from "date-fns";
import { getAllLeafTasks, getHabitProgress } from "@/lib/item-metrics";

export default function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [tasksData, habitsData, groupsData, labelsData] = await Promise.all([
          getTasks({ includeChildren: true }),
          getHabits(),
          getGroups(),
          getLabels(),
        ]);
        setTasks(tasksData);
        setHabits(habitsData);
        setGroups(groupsData);
        setLabels(labelsData);
      } catch (error) {
        console.error("Error loading analytics data:", error);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const leafTasks = useMemo(() => getAllLeafTasks(tasks), [tasks]);
  const totalTasks = leafTasks.length;
  const completedTasks = leafTasks.filter((task) => task.progress >= 100).length;
  const averageProgress = totalTasks > 0
    ? Math.round(leafTasks.reduce((sum, task) => sum + task.progress, 0) / totalTasks)
    : 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const longestCurrentStreak = habits.reduce((best, habit) => Math.max(best, habit.streak || 0), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const incompleteDatedTasks = leafTasks.filter((task) => task.deadline && task.progress < 100);
  const dueThisWeek = incompleteDatedTasks.filter((task) => {
    const deadline = parseISO(task.deadline!);
    return !Number.isNaN(deadline.getTime()) && deadline >= today && deadline <= weekEnd;
  }).length;
  const overdue = incompleteDatedTasks.filter((task) => {
    const deadline = parseISO(task.deadline!);
    return !Number.isNaN(deadline.getTime()) && deadline < today;
  }).length;

  const groupProgress = groups.map((group) => ({
    name: group.name,
    progress: Math.round(group.progress || 0),
    tasks: group.taskCount || 0,
    color: group.color || "#6366f1",
  }));
  const labelDistribution = labels.map((label) => ({
    name: label.name,
    value: label.incompleteCount || 0,
    color: label.color || "#6366f1",
  })).filter((label) => label.value > 0);
  const taskStatus = [
    { name: "Completed", value: completedTasks, color: "#16a34a" },
    {
      name: "In progress",
      value: leafTasks.filter((task) => task.progress > 0 && task.progress < 100).length,
      color: "#6366f1",
    },
    { name: "Not started", value: leafTasks.filter((task) => task.progress <= 0).length, color: "#94a3b8" },
  ].filter((entry) => entry.value > 0);

  if (loading) {
    return <div className="max-w-7xl mx-auto"><LoadingSkeleton count={10} /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={<Target className="w-5 h-5 text-indigo-600" />} label="Completion Rate" value={`${completionRate}%`} subtitle={`${completedTasks} of ${totalTasks} tasks`} />
        <MetricCard icon={<BarChart3 className="w-5 h-5 text-green-600" />} label="Average Progress" value={`${averageProgress}%`} subtitle="Across current leaf tasks" />
        <MetricCard icon={<Flame className="w-5 h-5 text-purple-600" />} label="Longest Current Streak" value={`${longestCurrentStreak} ${longestCurrentStreak === 1 ? "period" : "periods"}`} subtitle="Best active habit streak" />
        <MetricCard icon={<Calendar className="w-5 h-5 text-amber-600" />} label="Due in 7 Days" value={dueThisWeek} subtitle={overdue > 0 ? `${overdue} overdue` : "No overdue tasks"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Current Task Status">
          <PieChart>
            <Pie data={taskStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {taskStatus.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ChartCard>
        <ChartCard title="Current Progress by Group">
          <BarChart data={groupProgress}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
            <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} />
            <Tooltip />
            <Bar dataKey="progress" radius={[8, 8, 0, 0]}>
              {groupProgress.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Incomplete Items by Label">
          <PieChart>
            <Pie data={labelDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {labelDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ChartCard>
        <Card>
          <CardHeader><CardTitle>Habit Lifetime Progress</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[300px] overflow-y-auto">
            {habits.length === 0 && <p className="text-sm text-muted-foreground">No habits yet.</p>}
            {habits.map((habit) => {
              const progress = getHabitProgress(habit);
              return (
                <div key={habit.id}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{habit.title}</span>
                      <Badge variant="secondary" className="text-xs">{habit.type}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">{progress}%</span>
                  </div>
                  <UnifiedProgressBar value={progress} interactive={false} showPercentageOnHover={false} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Group Summary</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left py-3 px-4 text-sm text-muted-foreground">Group</th>
              <th className="text-left py-3 px-4 text-sm text-muted-foreground">Tasks</th>
              <th className="text-left py-3 px-4 text-sm text-muted-foreground">Habits</th>
              <th className="text-left py-3 px-4 text-sm text-muted-foreground">Incomplete</th>
              <th className="text-left py-3 px-4 text-sm text-muted-foreground">Progress</th>
            </tr></thead>
            <tbody>{groups.map((group) => (
              <tr key={group.id} className="border-b hover:bg-muted/50">
                <td className="py-3 px-4 text-sm">{group.name}</td>
                <td className="py-3 px-4 text-sm">{group.taskCount || 0}</td>
                <td className="py-3 px-4 text-sm">{group.habitCount || 0}</td>
                <td className="py-3 px-4 text-sm">{group.incompleteCount || 0}</td>
                <td className="py-3 px-4"><div className="flex items-center gap-2"><UnifiedProgressBar value={group.progress || 0} interactive={false} showPercentageOnHover={false} className="w-28" /><span className="text-sm text-muted-foreground">{Math.round(group.progress || 0)}%</span></div></td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: string | number; subtitle: string }) {
  return <Card><CardContent className="p-6"><div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center mb-4">{icon}</div><p className="text-sm text-muted-foreground mb-1">{label}</p><p className="text-2xl font-semibold mb-1">{value}</p><p className="text-xs text-muted-foreground">{subtitle}</p></CardContent></Card>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={250}>{children}</ResponsiveContainer></CardContent></Card>;
}
