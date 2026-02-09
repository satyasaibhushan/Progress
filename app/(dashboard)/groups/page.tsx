"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderAction } from "../layout";
import { Plus } from "lucide-react";
import { getGroups } from "@/lib/api/groups";
import { createGroup, updateGroup, deleteGroup } from "@/lib/api/groups";
import { Group } from "@/types";
import { GroupCard } from "@/components/groups/group-card";
import { GroupForm } from "@/components/groups/group-form";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { LazyList } from "@/components/shared/lazy-list";
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
  const [allGroups, setAllGroups] = useState<(Group & { progress?: number; taskCount?: number; habitCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const GROUPS_PAGE_SIZE = 8;

  useEffect(() => {
    async function loadData() {
      try {
        const [allGroupsData] = await Promise.all([
          getGroups(),
        ]);
        setAllGroups(allGroupsData);
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

  const handleCreate = async (data: any) => {
    setSaving(true);
    try {
      await createGroup(data);
      const groupsData = await getGroups();
      setAllGroups(groupsData);
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
      setAllGroups(groupsData);
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
      {allGroups.length === 0 ? (
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
          <LazyList
            items={allGroups}
            pageSize={GROUPS_PAGE_SIZE}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            sentinelClassName="col-span-full"
            render={(visibleGroups) => (
              <>
                {visibleGroups.map((group) => (
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
                ))}
              </>
            )}
          />
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
