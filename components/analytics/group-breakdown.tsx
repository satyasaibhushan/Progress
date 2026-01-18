"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Group } from "@/types";
import { useRouter } from "next/navigation";

interface GroupBreakdownProps {
  groups: Array<{
    group: Group;
    avgProgress: number;
    taskCount: number;
  }>;
  limit?: number;
  showViewMore?: boolean;
}

export function GroupBreakdown({ groups, limit, showViewMore = false }: GroupBreakdownProps) {
  const router = useRouter();
  const displayedGroups = limit ? groups.slice(0, limit) : groups;
  const remainingCount = limit ? groups.length - limit : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress by Group</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayedGroups.map(({ group, avgProgress, taskCount }) => (
            <div 
              key={group.id} 
              className="space-y-2 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
              onClick={() => router.push(`/groups/${group.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {group.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  <h4 className="text-sm font-medium">{group.name}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {taskCount} tasks
                  </span>
                  <span className="text-sm font-medium">{avgProgress}%</span>
                </div>
              </div>
              <Progress
                value={avgProgress}
                className="h-2"
                style={
                  group.color
                    ? {
                        ["--progress-background" as string]: group.color,
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        {showViewMore && remainingCount > 0 && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              onClick={() => router.push("/groups")}
            >
              View More ({remainingCount} more)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
