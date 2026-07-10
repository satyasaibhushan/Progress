"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Group } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label as FormLabel } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  color: z.string().optional(),
});

type GroupFormData = z.infer<typeof formSchema>;
export type { GroupFormData };

interface GroupFormProps {
  group?: Group;
  onSubmit: (data: GroupFormData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

const COLOR_OPTIONS = [
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export function GroupForm({
  group,
  onSubmit,
  onCancel,
  loading = false,
}: GroupFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<GroupFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: group
      ? {
          name: group.name,
          description: group.description || "",
          color: group.color || COLOR_OPTIONS[0],
        }
      : {
          color: COLOR_OPTIONS[0],
        },
  });

  const selectedColor = useWatch({ control, name: "color" });
  const [apiError, setApiError] = useState<string | null>(null);

  const handleFormSubmit = async (data: GroupFormData) => {
    try {
      setApiError(null);
      await onSubmit(data);
    } catch (error) {
      // Extract error message
      const errorMessage = error instanceof Error ? error.message : "An error occurred. Please try again.";
      setApiError(errorMessage);
      // Re-throw to prevent form from closing if needed
      throw error;
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* API Error Display */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
          <p className="text-sm font-medium">{apiError}</p>
        </div>
      )}
      
      {/* Name */}
      <div>
        <FormLabel htmlFor="name">Name *</FormLabel>
        <Input
          id="name"
          {...register("name")}
          placeholder="e.g., Work Projects"
          className={errors.name ? "border-red-500" : ""}
        />
        {errors.name && (
          <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <FormLabel htmlFor="description">Description</FormLabel>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Optional description"
          rows={3}
        />
      </div>

      {/* Color */}
      <div>
        <FormLabel>Color</FormLabel>
        <div className="grid grid-cols-8 gap-2 mt-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setValue("color", color)}
              className={cn(
                "w-10 h-10 rounded-lg border-2 transition-colors",
                selectedColor === color
                  ? "border-slate-900 scale-110"
                  : "border-transparent hover:border-slate-300"
              )}
              style={{ backgroundColor: color }}
              aria-label={`Set group color to ${color}`}
              aria-pressed={selectedColor === color}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : group ? "Update Group" : "Create Group"}
        </Button>
      </div>
    </form>
  );
}
