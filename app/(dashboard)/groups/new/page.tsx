"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createGroup, CreateGroupInput } from "@/lib/api/groups";
import { GroupForm } from "@/components/groups/group-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

export default function NewGroupPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setSubmitting(true);
    try {
      const input: CreateGroupInput = {
        name: data.name,
        description: data.description,
        color: data.color,
      };
      const newGroup = await createGroup(input);
      router.push(`/groups/${newGroup.id}`);
    } catch (error) {
      console.error("Error creating group:", error);
      // Re-throw with a user-friendly message if it's an Error
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error("Failed to create group. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create New Group</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupForm
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            loading={submitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}
