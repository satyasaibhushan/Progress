"use client";

import { useEffect, useState } from "react";
import { useHeaderAction } from "../layout";
import { useRouter } from "next/navigation";
import { Plus, Tag, MoreVertical } from "lucide-react";
import { getLabels } from "@/lib/api/labels";
import { getLabelItems } from "@/lib/api/labels";
import { getTasks } from "@/lib/api/tasks";
import { getHabits } from "@/lib/api/habits";
import { deleteLabel } from "@/lib/api/labels";
import { Label, Task, Habit } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

export default function LabelsPage() {
  const { setHeaderSubtitle } = useHeaderAction();
  const router = useRouter();
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [labelTasks, setLabelTasks] = useState<Task[]>([]);
  const [labelHabits, setLabelHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLabelId, setDeleteLabelId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const labelsData = await getLabels();
        setLabels(labelsData);
        if (labelsData.length > 0) {
          setSelectedLabel(labelsData[0]);
        }
      } catch (error) {
        console.error("Error loading labels:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Set header subtitle with total count
  useEffect(() => {
    setHeaderSubtitle(labels.length > 0 ? `${labels.length} total` : null);
    return () => setHeaderSubtitle(null);
  }, [setHeaderSubtitle, labels.length]);

  useEffect(() => {
    async function loadLabelItems() {
      if (!selectedLabel) return;
      try {
        const items = await getLabelItems(selectedLabel.id);
        setLabelTasks(items.tasks || []);
        setLabelHabits(items.habits || []);
      } catch (error) {
        console.error("Error loading label items:", error);
      }
    }
    loadLabelItems();
  }, [selectedLabel]);

  const handleDelete = async () => {
    if (!deleteLabelId) return;
    try {
      await deleteLabel(deleteLabelId);
      setLabels(labels.filter((l) => l.id !== deleteLabelId));
      if (selectedLabel?.id === deleteLabelId) {
        setSelectedLabel(labels.find((l) => l.id !== deleteLabelId) || null);
      }
      setDeleteLabelId(null);
    } catch (error) {
      console.error("Error deleting label:", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  const allLeafTasks = getAllLeafTasks(labelTasks);
  const totalItems = labelTasks.length + labelHabits.length;
  const completedItems = allLeafTasks.filter((t) => t.progress === 100).length;
  const avgTaskProgress =
    allLeafTasks.length > 0
      ? Math.round(
          allLeafTasks.reduce((acc, t) => acc + t.progress, 0) / allLeafTasks.length
        )
      : 0;
  const avgHabitProgress =
    labelHabits.length > 0
      ? Math.round(
          labelHabits.reduce(
            (acc, h) =>
              acc + ((h.currentCount || 0) / (h.targetCount || 1)) * 100,
            0
          ) / labelHabits.length
        )
      : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <Button onClick={() => router.push("/labels/new")}>
          <Plus className="w-4 h-4 mr-2" />
          New Label
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Labels</p>
          <p className="text-2xl font-semibold">{labels.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Most Used</p>
          <div className="flex items-center gap-2">
            {labels.length > 0 && (
              <>
                <Badge
                  variant="secondary"
                  style={{
                    backgroundColor: `${labels[0].color}20`,
                    color: labels[0].color,
                  }}
                >
                  {labels[0].name}
                </Badge>
                <span className="text-2xl font-semibold">
                  {labelTasks.length + labelHabits.length}
                </span>
              </>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Tagged Items</p>
          <p className="text-2xl font-semibold">
            {labels.reduce(
              (acc, label) =>
                acc +
                (labelTasks.filter((t) =>
                  t.labels?.some((l) => l.id === label.id)
                ).length +
                  labelHabits.filter((h) =>
                    h.labels?.some((l) => l.id === label.id)
                  ).length),
              0
            )}
          </p>
        </Card>
      </div>

      {labels.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No labels yet"
          description="Create labels to organize your tasks and habits"
          action={{
            label: "Create Label",
            onClick: () => router.push("/labels/new"),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Labels List */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Your Labels</h3>
            {labels.map((label) => {
              const isSelected = selectedLabel?.id === label.id;
              return (
                <Card
                  key={label.id}
                  className={cn(
                    "p-4 cursor-pointer transition-all",
                    isSelected
                      ? "border-indigo-600 bg-indigo-50"
                      : "hover:border-slate-300"
                  )}
                  onClick={() => router.push(`/labels/${label.id}`)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Tag
                        className="w-4 h-4"
                        style={{ color: label.color }}
                      />
                      <span className="text-sm font-medium">{label.name}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button className="p-1 hover:bg-slate-100 rounded">
                          <MoreVertical className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/labels/${label.id}/edit`)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteLabelId(label.id)}
                          className="text-red-600"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Label Details */}
          {selectedLabel && (
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{
                          backgroundColor: `${selectedLabel.color}20`,
                        }}
                      >
                        <Tag
                          className="w-5 h-5"
                          style={{ color: selectedLabel.color }}
                        />
                      </div>
                      <div>
                        <CardTitle>{selectedLabel.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {totalItems} items tagged
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Tasks */}
                  {labelTasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-3">
                        Tasks ({labelTasks.length})
                      </h4>
                      <div className="space-y-2">
                        {allLeafTasks.map((task) => (
                          <Card key={task.id} className="p-3">
                            <div className="flex items-start justify-between mb-2">
                              <h5 className="text-sm font-medium flex-1">
                                {task.title}
                              </h5>
                              <span className="text-sm text-muted-foreground ml-2">
                                {task.progress}%
                              </span>
                            </div>
                            <Progress value={task.progress} className="h-1.5 mb-2" />
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Habits */}
                  {labelHabits.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-3">
                        Habits ({labelHabits.length})
                      </h4>
                      <div className="space-y-2">
                        {labelHabits.map((habit) => {
                          const progress =
                            habit.currentCount && habit.targetCount
                              ? Math.round(
                                  (habit.currentCount / habit.targetCount) * 100
                                )
                              : 0;
                          return (
                            <Card key={habit.id} className="p-3">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h5 className="text-sm font-medium mb-1">
                                    {habit.title}
                                  </h5>
                                  <Badge variant="secondary" className="text-xs">
                                    {habit.type}
                                  </Badge>
                                </div>
                                <span className="text-sm text-muted-foreground ml-2">
                                  {progress}%
                                </span>
                              </div>
                              <Progress value={progress} className="h-1.5 mb-2" />
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                  {habit.currentCount || 0} / {habit.targetCount}
                                </span>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {labelTasks.length === 0 && labelHabits.length === 0 && (
                    <div className="text-center py-12">
                      <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        No items tagged with this label yet
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Start adding this label to tasks or habits
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog
        open={deleteLabelId !== null}
        onOpenChange={(open) => !open && setDeleteLabelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              label. Items with this label will not be deleted, but will no longer
              have this label.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
