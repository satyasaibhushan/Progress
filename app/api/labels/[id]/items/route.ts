import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"

// GET /api/labels/[id]/items - Get all tasks and habits with this label
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if label exists and belongs to user
    const label = await prisma.label.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!label) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 })
    }

    // Get all tasks with this label
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        labels: {
          some: {
            labelId: id,
          },
        },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parent: {
          select: {
            id: true,
            title: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            children: true,
            habits: true,
          },
        },
      },
      orderBy: {
        importance: "desc",
      },
    })

    // Get all habits with this label
    const habits = await prisma.habit.findMany({
      where: {
        userId,
        labels: {
          some: {
            labelId: id,
          },
        },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            logs: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({
      data: {
        label,
        tasks,
        habits,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
