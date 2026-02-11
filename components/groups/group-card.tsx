"use client";

import { Group } from "@/types";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Folder, MoreVertical, ArrowRight, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GroupCardProps {
  group: Group;
  taskCount?: number;
  habitCount?: number;
  avgProgress?: number;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function GroupCard({
  group,
  taskCount = 0,
  habitCount = 0,
  avgProgress = 0,
  onClick,
  onEdit,
  onDelete,
}: GroupCardProps) {
  return (
    <Card
      className="p-6 cursor-pointer hover:border-slate-300 transition-colors"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Open group ${group.name}` : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onClick();
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: group.color ? `${group.color}20` : "#f3f4f6",
            }}
          >
            <Folder
              className="w-5 h-5"
              style={{ color: group.color || "#6b7280" }}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">{group.name}</h3>
            {group.description && (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-slate-100 rounded" aria-label={`Group actions for ${group.name}`}>
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Tasks</p>
          <p className="text-xl font-semibold">{taskCount}</p>
        </div>
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Habits</p>
          <p className="text-xl font-semibold">{habitCount}</p>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Average Progress</span>
          <span className="font-medium">{avgProgress}%</span>
        </div>
        <Progress
          value={avgProgress}
          className="h-2"
          style={
            group.color
              ? {
                  ["--progress-background" as string]: group.color,
                }
              : undefined
          }
        />
      </div>
    </Card>
  );
}
