import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers";

export interface SearchResult {
  id: string;
  title: string;
  type: "task" | "habit" | "group" | "label";
  description?: string;
  groupName?: string;
  parentTaskTitle?: string;
  color?: string; // For labels
  itemCount?: number; // For groups and labels
}

// GET /api/search?q=query - Search tasks and habits
export async function GET(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ data: [] });
    }

    const searchTerm = query.trim().toLowerCase();

    // Search tasks (including subtasks)
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        OR: [
          {
            title: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        group: true,
        parent: true,
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Search habits
    const habits = await prisma.habit.findMany({
      where: {
        userId,
        OR: [
          {
            title: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        group: true,
        parentTask: true,
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Search groups
    const groups = await prisma.group.findMany({
      where: {
        userId,
        name: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      include: {
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
      take: 5,
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Search labels
    const labels = await prisma.label.findMany({
      where: {
        userId,
        name: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      include: {
        _count: {
          select: {
            taskLabels: true,
            habitLabels: true,
          },
        },
      },
      take: 5,
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Format results
    const taskResults: SearchResult[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: "task" as const,
      description: task.description || undefined,
      groupName: task.group?.name,
      parentTaskTitle: task.parent?.title,
    }));

    const habitResults: SearchResult[] = habits.map((habit) => ({
      id: habit.id,
      title: habit.title,
      type: "habit" as const,
      description: habit.description || undefined,
      groupName: habit.group?.name,
      parentTaskTitle: habit.parentTask?.title,
    }));

    const groupResults: SearchResult[] = groups.map((group) => ({
      id: group.id,
      title: group.name,
      type: "group" as const,
      description: group.description || undefined,
      itemCount: group._count.tasks + group._count.habits,
    }));

    const labelResults: SearchResult[] = labels.map((label) => ({
      id: label.id,
      title: label.name,
      type: "label" as const,
      color: label.color || undefined,
      itemCount: label._count.taskLabels + label._count.habitLabels,
    }));

    // Combine and limit to 15 total results
    const results = [...taskResults, ...habitResults, ...groupResults, ...labelResults].slice(0, 15);

    return NextResponse.json({ data: results });
  } catch (error) {
    return handleApiError(error);
  }
}
