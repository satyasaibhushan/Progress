"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createLabel, CreateLabelInput } from "@/lib/api/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label as FormLabel } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  color: z.string().min(1, "Color is required"),
});

type LabelFormData = z.infer<typeof formSchema>;

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

export default function NewLabelPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LabelFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      color: COLOR_OPTIONS[0],
    },
  });

  const selectedColor = watch("color");
  const name = watch("name") || "Label Name";

  const handleFormSubmit = async (data: LabelFormData) => {
    setSubmitting(true);
    try {
      const input: CreateLabelInput = {
        name: data.name,
        color: data.color,
      };
      const newLabel = await createLabel(input);
      router.push(`/labels`);
    } catch (error) {
      console.error("Error creating label:", error);
      alert("Failed to create label. Please try again.");
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
          <CardTitle>Create New Label</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            {/* Name */}
            <div>
              <FormLabel htmlFor="name">Name *</FormLabel>
              <Input
                id="name"
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
                      selectedColor === color
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
                  backgroundColor: `${selectedColor}20`,
                  color: selectedColor,
                }}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                {name}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Label"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
