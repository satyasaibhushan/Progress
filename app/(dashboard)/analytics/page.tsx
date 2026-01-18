"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Target, Calendar, BarChart3 } from "lucide-react";
import { getTasks } from "@/lib/api/tasks";
import { getHabits } from "@/lib/api/habits";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { Task, Habit, Group, Label } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Badge } from "@/components/ui/badge";

function getAllLeafTasks(tasks: Task[]): Task[] {
  const leafTasks: Task[] = [];
  const traverse = (taskList: Task[]) => {
    taskList.forEach((task) => {
      if (task.children && task.children.length > 0) {
        traverse(task.children);
      } else {
        leafTasks.push(task);
      }
    });
  };
  traverse(tasks);
  return leafTasks;
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("week");
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
    loadData();
  }, []);

  const allLeafTasks = useMemo(() => getAllLeafTasks(tasks), [tasks]);

  // Calculate analytics
  const totalTasks = allLeafTasks.length;
  const completedTasks = allLeafTasks.filter((t) => t.progress === 100).length;
  const avgProgress =
    totalTasks > 0
      ? Math.round(
          allLeafTasks.reduce((acc, t) => acc + t.progress, 0) / totalTasks
        )
      : 0;

  // Progress by group
  const groupProgress = useMemo(() => {
    return groups.map((group) => {
      const groupTasks = allLeafTasks.filter((t) => t.groupId === group.id);
      const avg = groupTasks.length > 0
        ? Math.round(
            groupTasks.reduce((acc, t) => acc + t.progress, 0) / groupTasks.length
          )
        : 0;
      return {
        name: group.name,
        progress: avg,
        tasks: groupTasks.length,
        color: group.color || "#3b82f6",
      };
    });
  }, [groups, allLeafTasks]);

  // Progress by label
  const labelProgress = useMemo(() => {
    return labels.map((label) => {
      const labelTasks = allLeafTasks.filter((t) =>
        t.labels?.some((l) => l.id === label.id)
      );
      return {
        name: label.name,
        value: labelTasks.length,
        color: label.color || "#3b82f6",
      };
    });
  }, [labels, allLeafTasks]);

  // Weekly progress trend (mock data for now)
  const weeklyProgress = [
    { day: "Mon", progress: 45, tasks: 3 },
    { day: "Tue", progress: 52, tasks: 4 },
    { day: "Wed", progress: 58, tasks: 5 },
    { day: "Thu", progress: 61, tasks: 4 },
    { day: "Fri", progress: 65, tasks: 6 },
    { day: "Sat", progress: 68, tasks: 3 },
    { day: "Sun", progress: 70, tasks: 2 },
  ];

  // Habit completion rate
  const habitStats = useMemo(() => {
    return habits.map((habit) => {
      const completion =
        habit.currentCount && habit.targetCount
          ? Math.round((habit.currentCount / habit.targetCount) * 100)
          : 0;
      return {
        name: habit.title,
        completion: Math.min(completion, 100),
        type: habit.type,
      };
    });
  }, [habits]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-indigo-600" />
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <TrendingUp className="w-3 h-3 inline mr-1" />
                +12%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-1">Completion Rate</p>
            <p className="text-2xl font-semibold mb-1">
              {totalTasks > 0
                ? Math.round((completedTasks / totalTasks) * 100)
                : 0}
              %
            </p>
            <p className="text-xs text-muted-foreground">
              {completedTasks} of {totalTasks} tasks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-green-600" />
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <TrendingUp className="w-3 h-3 inline mr-1" />
                +8%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-1">Avg Progress</p>
            <p className="text-2xl font-semibold mb-1">{avgProgress}%</p>
            <p className="text-xs text-muted-foreground">Across all tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <TrendingUp className="w-3 h-3 inline mr-1" />
                +5%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-1">Habit Streak</p>
            <p className="text-2xl font-semibold mb-1">12 days</p>
            <p className="text-xs text-muted-foreground">Personal best: 18 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <Badge variant="secondary" className="bg-red-100 text-red-700">
                <TrendingDown className="w-3 h-3 inline mr-1" />
                2 overdue
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-1">This Week</p>
            <p className="text-2xl font-semibold mb-1">3 tasks</p>
            <p className="text-xs text-muted-foreground">Due in next 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Progress Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={weeklyProgress}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" stroke="#64748b" style={{ fontSize: "12px" }} />
                <YAxis stroke="#64748b" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="progress"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: "#6366f1", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Progress by Group */}
        <Card>
          <CardHeader>
            <CardTitle>Progress by Group</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={groupProgress}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: "12px" }} />
                <YAxis stroke="#64748b" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="progress" radius={[8, 8, 0, 0]}>
                  {groupProgress.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* More Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Label Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Label</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={labelProgress}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {labelProgress.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {labelProgress.map((label) => (
                <div key={label.name} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="text-muted-foreground">{label.name}</span>
                  <span className="text-muted-foreground">({label.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Habit Completion */}
        <Card>
          <CardHeader>
            <CardTitle>Habit Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {habitStats.map((habit) => (
                <div key={habit.name}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{habit.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {habit.type}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {habit.completion}%
                    </span>
                  </div>
                  <UnifiedProgressBar
                    value={habit.completion}
                    interactive={false}
                    showPercentageOnHover={false}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm text-muted-foreground">
                    Group
                  </th>
                  <th className="text-left py-3 px-4 text-sm text-muted-foreground">
                    Tasks
                  </th>
                  <th className="text-left py-3 px-4 text-sm text-muted-foreground">
                    Completed
                  </th>
                  <th className="text-left py-3 px-4 text-sm text-muted-foreground">
                    In Progress
                  </th>
                  <th className="text-left py-3 px-4 text-sm text-muted-foreground">
                    Avg Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const groupTasks = allLeafTasks.filter(
                    (t) => t.groupId === group.id
                  );
                  const completed = groupTasks.filter((t) => t.progress === 100).length;
                  const inProgress = groupTasks.filter(
                    (t) => t.progress > 0 && t.progress < 100
                  ).length;
                  const avgProg =
                    groupTasks.length > 0
                      ? Math.round(
                          groupTasks.reduce((acc, t) => acc + t.progress, 0) /
                            groupTasks.length
                        )
                      : 0;

                  return (
                    <tr key={group.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {group.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                          )}
                          <span className="text-sm">{group.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">{groupTasks.length}</td>
                      <td className="py-3 px-4 text-sm">{completed}</td>
                      <td className="py-3 px-4 text-sm">{inProgress}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <UnifiedProgressBar
                            interactive={false}
                            showPercentageOnHover={false}
                            value={avgProg}
                            className="flex-1 h-1.5 max-w-[100px]"
                          />
                          <span className="text-sm text-muted-foreground w-12">
                            {avgProg}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
