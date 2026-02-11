"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGroup, updateGroup, UpdateGroupInput } from "@/lib/api/groups";
import { Group } from "@/types";
import { GroupForm, GroupFormData } from "@/components/groups/group-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function EditGroupPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadGroup() {
      try {
        const groupData = await getGroup(groupId);
        setGroup(groupData);
      } catch (error) {
        console.error("Error loading group:", error);
      } finally {
        setLoading(false);
      }
    }
    if (groupId) {
      loadGroup();
    }
  }, [groupId]);

  const handleSubmit = async (data: GroupFormData) => {
    setSubmitting(true);
    try {
      const input: UpdateGroupInput = {
        id: groupId,
        name: data.name,
        description: data.description,
        color: data.color,
      };
      await updateGroup(input);
      router.push(`/groups/${groupId}`);
    } catch (error) {
      console.error("Error updating group:", error);
      // Re-throw with a user-friendly message if it's an Error
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error("Failed to update group. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <LoadingSkeleton count={10} />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-2xl mx-auto">
        <p>Group not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Group</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupForm
            group={group}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            loading={submitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}
