"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Group } from "@/types";
import { useRouter } from "next/navigation";
import { LazyList } from "@/components/shared/lazy-list";
import { ScrollHint } from "@/components/shared/scroll-hint";

interface GroupBreakdownProps {
  groups: Array<{
    group: Group;
    avgProgress: number;
    taskCount: number;
  }>;
  limit?: number;
}

export function GroupBreakdown({ groups, limit }: GroupBreakdownProps) {
  const router = useRouter();
  const pageSize = Math.min(limit ?? groups.length, groups.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress by Group</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <ScrollHint
          className="max-h-[360px] pr-2"
          wrapperClassName="relative"
          watch={groups.length}
        >
          <LazyList
            items={groups}
            pageSize={pageSize}
            className="space-y-4"
            render={(visibleGroups) => (
              <>
                {visibleGroups.map(({ group, avgProgress, taskCount }) => (
                  <div 
                    key={group.id} 
                    className="space-y-2 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                    onClick={() => router.push(`/groups/${group.id}`)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open group ${group.name}`}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      router.push(`/groups/${group.id}`);
                    }}
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
              </>
            )}
          />
        </ScrollHint>
      </CardContent>
    </Card>
  );
}
