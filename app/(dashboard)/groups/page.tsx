"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useHeaderAction } from "../layout";
import { Plus } from "lucide-react";
import { getGroups } from "@/lib/api/groups";
import { getLabels } from "@/lib/api/labels";
import { createGroup, updateGroup, deleteGroup } from "@/lib/api/groups";
import { Group, Label } from "@/types";
import { GroupCard } from "@/components/groups/group-card";
import { GroupForm } from "@/components/groups/group-form";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Folder } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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


export default function GroupsPage() {
  const { setHeaderSubtitle } = useHeaderAction();
  const router = useRouter();
  const [groups, setGroups] = useState<(Group & { progress?: number; taskCount?: number; habitCount?: number })[]>([]);
  const [allGroups, setAllGroups] = useState<(Group & { progress?: number; taskCount?: number; habitCount?: number })[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const DISPLAY_LIMIT = 6;

  useEffect(() => {
    async function loadData() {
      try {
        const [allGroupsData, labelsData] = await Promise.all([
          getGroups(),
          getLabels(),
        ]);
        setAllGroups(allGroupsData);
        setGroups(allGroupsData.slice(0, DISPLAY_LIMIT));
        setLabels(labelsData);
      } catch (error) {
        console.error("Error loading groups:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Set header subtitle with total count
  useEffect(() => {
    setHeaderSubtitle(allGroups.length > 0 ? `${allGroups.length} total` : null);
    return () => setHeaderSubtitle(null);
  }, [setHeaderSubtitle, allGroups.length]);

  // Update displayed groups when showAll changes
  useEffect(() => {
    if (showAll) {
      setGroups(allGroups);
    } else {
      setGroups(allGroups.slice(0, DISPLAY_LIMIT));
    }
  }, [showAll, allGroups]);

  const handleCreate = async (data: any) => {
    setSaving(true);
    try {
      await createGroup(data);
      const groupsData = await getGroups();
      setGroups(groupsData);
      setCreatingGroup(false);
    } catch (error) {
      console.error("Error creating group:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: any) => {
    if (!editingGroup) return;
    setSaving(true);
    try {
      await updateGroup({ id: editingGroup.id, ...data });
      const groupsData = await getGroups();
      setGroups(groupsData);
      setEditingGroup(null);
    } catch (error) {
      console.error("Error updating group:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;
    try {
      await deleteGroup(deletingGroup.id);
      const updatedGroups = allGroups.filter((g) => g.id !== deletingGroup.id);
      setAllGroups(updatedGroups);
      if (showAll) {
        setGroups(updatedGroups);
      } else {
        setGroups(updatedGroups.slice(0, DISPLAY_LIMIT));
      }
      setDeletingGroup(null);
    } catch (error) {
      console.error("Error deleting group:", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end mb-6">
        <Button onClick={() => setCreatingGroup(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Group
        </Button>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No groups yet"
          description="Create groups to organize your tasks and habits"
          action={{
            label: "Create Group",
            onClick: () => setCreatingGroup(true),
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((group) => {
              return (
                <GroupCard
                  key={group.id}
                  group={group}
                  taskCount={group.taskCount || 0}
                  habitCount={group.habitCount || 0}
                  avgProgress={group.progress || 0}
                  onClick={() => router.push(`/groups/${group.id}`)}
                  onEdit={() => setEditingGroup(group)}
                  onDelete={() => setDeletingGroup(group)}
                />
              );
            })}
          </div>
          {allGroups.length > DISPLAY_LIMIT && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? `Show Less` : `Show More (${allGroups.length - DISPLAY_LIMIT} more)`}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Group Dialog */}
      <Dialog open={creatingGroup} onOpenChange={setCreatingGroup}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <GroupForm
            onSubmit={handleCreate}
            onCancel={() => setCreatingGroup(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {editingGroup && (
            <GroupForm
              group={editingGroup}
              onSubmit={handleEdit}
              onCancel={() => setEditingGroup(null)}
              loading={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the group.
              Tasks and habits in this group will not be deleted, but will no longer
              be associated with this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
