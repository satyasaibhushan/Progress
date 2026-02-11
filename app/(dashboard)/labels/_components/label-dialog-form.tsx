"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FormLabel } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { COLOR_OPTIONS, labelFormSchema, LabelFormValues } from "../_lib/label-page-helpers";

interface LabelDialogFormProps {
  open: boolean;
  title: string;
  submitLabel: string;
  saving: boolean;
  initialValues?: LabelFormValues;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LabelFormValues) => Promise<void>;
}

export function LabelDialogForm({
  open,
  title,
  submitLabel,
  saving,
  initialValues,
  onOpenChange,
  onSubmit,
}: LabelDialogFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<LabelFormValues>({
    resolver: zodResolver(labelFormSchema),
    defaultValues: initialValues ?? {
      name: "",
      color: COLOR_OPTIONS[0],
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      initialValues ?? {
        name: "",
        color: COLOR_OPTIONS[0],
      }
    );
  }, [open, initialValues, reset]);

  const selectedColor = watch("color");
  const watchedName = watch("name");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <FormLabel htmlFor="label-name">Name *</FormLabel>
            <Input
              id="label-name"
              {...register("name")}
              placeholder="e.g., Urgent, Important"
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
            )}
          </div>

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
                  aria-label={`Set color to ${color}`}
                  aria-pressed={selectedColor === color}
                />
              ))}
            </div>
          </div>

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
              {watchedName || "Label Name"}
            </Badge>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
