"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useHeaderAction } from "../layout";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Tag, Edit, Trash2 } from "lucide-react";
import { getLabels, getLabelItems } from "@/lib/api/labels";
import { getGroups } from "@/lib/api/groups";
import { deleteLabel } from "@/lib/api/labels";
import { Label, Task, Habit, Group } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UnifiedProgressBar } from "@/components/shared/unified-progress-bar";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { TasksHabitsTree } from "@/components/shared/tasks-habits-tree";
import { LabelStats } from "@/components/analytics/label-stats";
import { cn } from "@/lib/utils";
import { LazyList } from "@/components/shared/lazy-list";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateLabel, UpdateLabelInput, createLabel, CreateLabelInput } from "@/lib/api/labels";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label as FormLabel } from "@/components/ui/label";

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

function LabelsPageContent() {
  const { setHeaderSubtitle, setHeaderRightAction } = useHeaderAction();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [labelTasks, setLabelTasks] = useState<Task[]>([]);
  const [labelHabits, setLabelHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLabelId, setDeleteLabelId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const processedHighlightRef = useRef<string | null>(null);
  const highlightedLabelId = searchParams.get("highlight");
  const forceShowAll = !!highlightedLabelId;
  const LABELS_PAGE_SIZE = 12;

  const formSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    color: z.string().min(1, "Color is required"),
  });

  const COLOR_OPTIONS = [
    "#ef4444",
    "#f59e0b",
    "#84cc16",
    "#10b981",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      color: COLOR_OPTIONS[0],
    },
  });

  // Update form when editingLabel changes
  useEffect(() => {
    if (editingLabel) {
      setValue("name", editingLabel.name);
      setValue("color", editingLabel.color || COLOR_OPTIONS[0]);
    } else {
      reset();
    }
  }, [editingLabel, setValue, reset]);

  useEffect(() => {
    async function loadData() {
      try {
        const [labelsData, groupsData] = await Promise.all([
          getLabels(),
          getGroups(),
        ]);
        setLabels(labelsData);
        setGroups(groupsData);
        
        // Set selected label from URL or first label
        if (highlightedLabelId) {
          const label = labelsData.find((l) => l.id === highlightedLabelId);
          if (label) {
            setSelectedLabel(label);
          } else if (labelsData.length > 0) {
            setSelectedLabel(labelsData[0]);
          }
        } else if (labelsData.length > 0) {
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

  // Set header subtitle and right action
  useEffect(() => {
    setHeaderSubtitle(labels.length > 0 ? `${labels.length} total` : null);
    setHeaderRightAction(
      <Button onClick={() => setCreatingLabel(true)}>
        <Plus className="w-4 h-4 mr-2" />
        New Label
      </Button>
    );
    return () => {
      setHeaderSubtitle(null);
      setHeaderRightAction(null);
    };
  }, [setHeaderSubtitle, setHeaderRightAction, labels.length]);

  // Load label items when selected label changes
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

  // Handle highlighting from URL params
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (highlightId && highlightId !== processedHighlightRef.current) {
      processedHighlightRef.current = highlightId;
      const label = labels.find((l) => l.id === highlightId);
      if (label) {
        setSelectedLabel(label);
        // Update URL without the highlight param after selection
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.delete("highlight");
        router.replace(`/labels?${newParams.toString()}`, { scroll: false });
      }
    } else if (!highlightId) {
      processedHighlightRef.current = null;
    }
  }, [searchParams, labels, router]);

  const handleDelete = async () => {
    if (!deleteLabelId) return;
    try {
      await deleteLabel(deleteLabelId);
      setLabels(labels.filter((l) => l.id !== deleteLabelId));
      if (selectedLabel?.id === deleteLabelId) {
        const remaining = labels.filter((l) => l.id !== deleteLabelId);
        setSelectedLabel(remaining.length > 0 ? remaining[0] : null);
      }
      setDeleteLabelId(null);
    } catch (error) {
      console.error("Error deleting label:", error);
    }
  };

  const handleCreate = async (data: z.infer<typeof formSchema>) => {
    setSaving(true);
    try {
      const input: CreateLabelInput = {
        name: data.name,
        color: data.color,
      };
      await createLabel(input);
      const updatedLabels = await getLabels();
      setLabels(updatedLabels);
      setCreatingLabel(false);
      reset();
    } catch (error) {
      console.error("Error creating label:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: z.infer<typeof formSchema>) => {
    if (!editingLabel) return;
    setSaving(true);
    try {
      const input: UpdateLabelInput = {
        id: editingLabel.id,
        name: data.name,
        color: data.color,
      };
      await updateLabel(input);
      const updatedLabels = await getLabels();
      setLabels(updatedLabels);
      const updated = updatedLabels.find((l) => l.id === editingLabel.id);
      if (updated) {
        setSelectedLabel(updated);
      }
      setEditingLabel(null);
    } catch (error) {
      console.error("Error updating label:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleLabelClick = (label: Label) => {
    setSelectedLabel(label);
    // Update URL to include highlight
    const newParams = new URLSearchParams();
    newParams.set("highlight", label.id);
    router.push(`/labels?${newParams.toString()}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  const allLeafTasks = getAllLeafTasks(labelTasks);
  const totalItems = allLeafTasks.length + labelHabits.length;
  const completedItems = allLeafTasks.filter((t) => t.progress === 100).length;
  const avgTaskProgress =
    allLeafTasks.length > 0
      ? Math.round(
          allLeafTasks.reduce((acc, t) => acc + t.progress, 0) / allLeafTasks.length
        )
      : 0;
  
  // Calculate habit progress from logs
  const avgHabitProgress = labelHabits.length > 0
    ? Math.round(
        labelHabits.reduce((acc, h) => {
          let habitProgress = 0;
          if (h.habitLogs && h.habitLogs.length > 0) {
            const totalCount = h.habitLogs.reduce((sum, log) => sum + log.count, 0);
            if (h.targetCount > 0) {
              habitProgress = Math.min(100, Math.round((totalCount / h.targetCount) * 100));
            }
          } else if (h.currentCount !== undefined && h.targetCount) {
            habitProgress = Math.min(100, Math.round((h.currentCount / h.targetCount) * 100));
          }
          return acc + habitProgress;
        }, 0) / labelHabits.length
      )
    : 0;

  const labelStats = {
    totalItems,
    tasksCount: allLeafTasks.length,
    habitsCount: labelHabits.length,
    completedItems,
    avgTaskProgress,
    avgHabitProgress,
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {labels.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No labels yet"
          description="Create labels to organize your tasks and habits"
          action={{
            label: "Create Label",
            onClick: () => setCreatingLabel(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Labels List - Left Column */}
          <div className="lg:col-span-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              <LazyList
                items={labels}
                pageSize={LABELS_PAGE_SIZE}
                forceShowAll={forceShowAll}
                className="space-y-3"
                render={(visibleLabels) => (
                  <>
                    {visibleLabels.map((label) => {
                      const isSelected = selectedLabel?.id === label.id;
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
                          onClick={() => handleLabelClick(label)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1">
                              <Tag
                                className="w-4 h-4"
                                style={{ color: label.color }}
                              />
                              <span className="text-sm font-medium">{label.name}</span>
                            </div>
                            <div className={cn(
                              "flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity",
                              (isSelected || isHighlighted) && "opacity-100"
                            )}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingLabel(label);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteLabelId(label.id);
                                }}
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
          </div>

          {/* Label Details - Right Column */}
          {selectedLabel && (
            <div className="lg:col-span-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {/* Label Stats */}
                <LabelStats
                  labels={labels}
                  selectedLabel={selectedLabel}
                  onLabelChange={setSelectedLabel}
                  stats={labelStats}
                />

                {/* Tasks and Habits */}
                {(labelTasks.length > 0 || labelHabits.length > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Tasks & Habits</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TasksHabitsTree
                        tasks={labelTasks}
                        habits={labelHabits}
                        groups={groups}
                        onTaskClick={(taskId) => router.push(`/tasks?highlight=${taskId}`)}
                        onHabitClick={(habitId) => router.push(`/habits?highlight=${habitId}`)}
                        showCounts={false}
                      />
                    </CardContent>
                  </Card>
                )}

                {labelTasks.length === 0 && labelHabits.length === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        No items tagged with this label yet
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Start adding this label to tasks or habits
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Label Dialog */}
      <Dialog open={creatingLabel} onOpenChange={setCreatingLabel}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Label</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleCreate)} className="space-y-6">
            {/* Name */}
            <div>
              <FormLabel htmlFor="create-name">Name *</FormLabel>
              <Input
                id="create-name"
                {...register("name")}
                placeholder="e.g., Urgent, Important"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Color */}
            <div>
              <FormLabel>Color *</FormLabel>
              <div className="grid grid-cols-8 gap-2 mt-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setValue("color", color)}
                    className={cn(
                      "w-10 h-10 rounded-lg border-2 transition-colors",
                      watch("color") === color
                        ? "border-slate-900 scale-110"
                        : "border-transparent hover:border-slate-300"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm text-muted-foreground mb-2">Preview</p>
              <Badge
                variant="secondary"
                style={{
                  backgroundColor: `${watch("color")}20`,
                  color: watch("color"),
                }}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                {watch("name") || "Label Name"}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreatingLabel(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Label"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Label Dialog */}
      <Dialog open={!!editingLabel} onOpenChange={(open) => !open && setEditingLabel(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Label</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleEdit)} className="space-y-6">
            {/* Name */}
            <div>
              <FormLabel htmlFor="edit-name">Name *</FormLabel>
              <Input
                id="edit-name"
                {...register("name")}
                placeholder="e.g., Urgent, Important"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Color */}
            <div>
              <FormLabel>Color *</FormLabel>
              <div className="grid grid-cols-8 gap-2 mt-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setValue("color", color)}
                    className={cn(
                      "w-10 h-10 rounded-lg border-2 transition-colors",
                      watch("color") === color
                        ? "border-slate-900 scale-110"
                        : "border-transparent hover:border-slate-300"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm text-muted-foreground mb-2">Preview</p>
              <Badge
                variant="secondary"
                style={{
                  backgroundColor: `${watch("color")}20`,
                  color: watch("color"),
                }}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                {watch("name") || "Label Name"}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingLabel(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Updating..." : "Update Label"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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

export default function LabelsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton count={10} />}>
      <LabelsPageContent />
    </Suspense>
  );
}
