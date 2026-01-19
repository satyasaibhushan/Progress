"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chartColors, gridColors } from "@/lib/theme-colors";

interface ProgressChartProps {
  data: Array<{
    name: string;
    tasks: number;
    habits: number;
  }>;
  title?: string;
}

export function ProgressChart({ data, title = "Progress Trend" }: ProgressChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColors.grid} />
            <XAxis
              dataKey="name"
              stroke={gridColors.axis}
              style={{ fontSize: "12px" }}
            />
            <YAxis
              stroke={gridColors.axis}
              style={{ fontSize: "12px" }}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: gridColors.background,
                border: `1px solid ${gridColors.border}`,
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="tasks"
              stroke={chartColors.tasks}
              strokeWidth={2}
              name="Tasks Progress"
              dot={{ fill: chartColors.tasks, r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="habits"
              stroke={chartColors.habits}
              strokeWidth={2}
              name="Habits Progress"
              dot={{ fill: chartColors.habits, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
