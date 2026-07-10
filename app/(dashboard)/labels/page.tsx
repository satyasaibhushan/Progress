"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useHeaderAction } from "../layout";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Tag } from "lucide-react";
import { createLabel, CreateLabelInput, deleteLabel, getLabelItems, getLabels, updateLabel, UpdateLabelInput } from "@/lib/api/labels";
import { getGroups } from "@/lib/api/groups";
import { Group, Habit, Label, Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { TasksHabitsTree } from "@/components/shared/tasks-habits-tree";
import { LabelStats } from "@/components/analytics/label-stats";
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
import { LabelDialogForm } from "./_components/label-dialog-form";
import { LabelListPanel } from "./_components/label-list-panel";
import { calculateLabelStats, LabelFormValues } from "./_lib/label-page-helpers";

const LABELS_PAGE_SIZE = 12;

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
  const labelItemsRequestRef = useRef(0);
  const highlightedLabelId = searchParams.get("highlight");
  const forceShowAll = !!highlightedLabelId;

  useEffect(() => {
    async function loadData() {
      try {
        const [labelsData, groupsData] = await Promise.all([
          getLabels(),
          getGroups(),
        ]);
        setLabels(labelsData);
        setGroups(groupsData);

        setSelectedLabel((current) => {
          const highlighted = highlightedLabelId
            ? labelsData.find((item) => item.id === highlightedLabelId)
            : undefined;
          if (highlighted) return highlighted;
          if (current && labelsData.some((item) => item.id === current.id)) return current;
          return labelsData[0] ?? null;
        });
      } catch (error) {
        console.error("Error loading labels:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [highlightedLabelId]);

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

  useEffect(() => {
    const requestId = ++labelItemsRequestRef.current;
    async function loadLabelItems() {
      if (!selectedLabel) {
        setLabelTasks([]);
        setLabelHabits([]);
        return;
      }
      try {
        const items = await getLabelItems(selectedLabel.id);
        if (requestId !== labelItemsRequestRef.current) return;
        setLabelTasks(items.tasks || []);
        setLabelHabits(items.habits || []);
      } catch (error) {
        if (requestId !== labelItemsRequestRef.current) return;
        console.error("Error loading label items:", error);
        setLabelTasks([]);
        setLabelHabits([]);
      }
    }

    loadLabelItems();
  }, [selectedLabel]);

  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (highlightId && highlightId !== processedHighlightRef.current) {
      processedHighlightRef.current = highlightId;
      const label = labels.find((item) => item.id === highlightId);
      if (label) {
        setSelectedLabel(label);
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
      setLabels((previous) => previous.filter((label) => label.id !== deleteLabelId));
      if (selectedLabel?.id === deleteLabelId) {
        const remaining = labels.filter((label) => label.id !== deleteLabelId);
        setSelectedLabel(remaining.length > 0 ? remaining[0] : null);
      }
      setDeleteLabelId(null);
    } catch (error) {
      console.error("Error deleting label:", error);
    }
  };

  const handleCreate = async (data: LabelFormValues) => {
    setSaving(true);
    try {
      const input: CreateLabelInput = {
        name: data.name,
        color: data.color,
      };
      const createdLabel = await createLabel(input);
      const updatedLabels = await getLabels();
      setLabels(updatedLabels);
      // When creating the first label there is no selected item yet. Select
      // the newly created label so the details panel is populated immediately.
      setSelectedLabel((current) =>
        current ?? updatedLabels.find((label) => label.id === createdLabel.id) ?? updatedLabels[0] ?? null
      );
      setCreatingLabel(false);
    } catch (error) {
      console.error("Error creating label:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: LabelFormValues) => {
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
      const updated = updatedLabels.find((label) => label.id === editingLabel.id);
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

  const labelStats = calculateLabelStats(labelTasks, labelHabits);

  return (
    <div className="max-w-6xl mx-auto flex flex-col" style={{ height: "calc(100vh - 8rem)" }}>
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
          <div className="lg:col-span-1 flex flex-col overflow-hidden">
            <LabelListPanel
              labels={labels}
              selectedLabelId={selectedLabel?.id ?? null}
              highlightedLabelId={highlightedLabelId}
              pageSize={LABELS_PAGE_SIZE}
              forceShowAll={forceShowAll}
              onSelect={handleLabelClick}
              onEdit={setEditingLabel}
              onDelete={setDeleteLabelId}
            />
          </div>

          {selectedLabel && (
            <div className="lg:col-span-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                <LabelStats
                  labels={labels}
                  selectedLabel={selectedLabel}
                  onLabelChange={setSelectedLabel}
                  stats={labelStats}
                />

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

      <LabelDialogForm
        open={creatingLabel}
        onOpenChange={setCreatingLabel}
        title="Create New Label"
        submitLabel="Create Label"
        saving={saving}
        onSubmit={handleCreate}
      />

      <LabelDialogForm
        open={!!editingLabel}
        onOpenChange={(open) => {
          if (!open) {
            setEditingLabel(null);
          }
        }}
        title="Edit Label"
        submitLabel="Update Label"
        saving={saving}
        initialValues={
          editingLabel
            ? {
                name: editingLabel.name,
                color: editingLabel.color,
              }
            : undefined
        }
        onSubmit={handleEdit}
      />

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
