export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { serializeTask } from "@/lib/utils"
import { z } from "zod"
import {
  canRemoveLabelFromTask,
  propagateLabelsToChildren,
} from "@/lib/inheritance-helpers"
import { reconcileUserLabelInheritance } from "@/lib/server/inheritance/labels"

const addLabelSchema = z.object({
  labelId: z.string().min(1, "Label ID is required"),
})

const removeLabelSchema = z.object({
  labelId: z.string().min(1, "Label ID is required"),
})

// POST /api/tasks/[id]/labels - Add a label to a task
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    // Check if task exists and belongs to user
    const task = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const body = await request.json()
    const { labelId } = addLabelSchema.parse(body)

    // Check if label exists and belongs to user
    const label = await prisma.label.findFirst({
      where: {
        id: labelId,
        userId,
      },
    })

    if (!label) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 })
    }

    // Check if label is already associated
    const existing = await prisma.taskLabel.findUnique({
      where: {
        taskId_labelId: {
          taskId: id,
          labelId,
        },
      },
    })

    if (existing) {
      if (existing.inheritedFromTaskId === null) {
        return NextResponse.json(
          { error: "Label already associated with this task" },
          { status: 400 }
        )
      }
      await prisma.taskLabel.update({
        where: { taskId_labelId: { taskId: id, labelId } },
        data: { inheritedFromTaskId: null },
      })
    } else {
      await prisma.taskLabel.create({
        data: {
          taskId: id,
          labelId,
        },
      })
    }

    await propagateLabelsToChildren(id, [labelId], userId)

    // Return updated task with labels
    const updatedTask = await prisma.task.findUnique({
      where: { id },
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
        taskLabels: {
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
    })

    return NextResponse.json({ data: serializeTask(updatedTask!) })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/tasks/[id]/labels - Remove a label from a task
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    // Check if task exists and belongs to user
    const task = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const queryLabelId = new URL(request.url).searchParams.get("labelId")
    const { labelId } = removeLabelSchema.parse({
      ...(body && typeof body === "object" ? body : {}),
      labelId: (body && typeof body === "object" && "labelId" in body
        ? (body as { labelId?: unknown }).labelId
        : undefined) ?? queryLabelId ?? undefined,
    })

    // Check if association exists
    const existing = await prisma.taskLabel.findUnique({
      where: {
        taskId_labelId: {
          taskId: id,
          labelId,
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Label not associated with this task" },
        { status: 404 }
      )
    }

    // Check if label can be removed (not inherited from parent)
    const canRemove = await canRemoveLabelFromTask(id, labelId, userId)
    if (!canRemove) {
      return NextResponse.json(
        { 
          error: "Cannot remove label. This label is inherited from a parent task. Unlink this task from its parent to remove the label.",
        },
        { status: 400 }
      )
    }

    // Remove association
    await prisma.taskLabel.delete({
      where: {
        taskId_labelId: {
          taskId: id,
          labelId,
        },
      },
    })
    await reconcileUserLabelInheritance(userId)

    // Return updated task with labels
    const updatedTask = await prisma.task.findUnique({
      where: { id },
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
        taskLabels: {
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
    })

    return NextResponse.json({ data: serializeTask(updatedTask!) })
  } catch (error) {
    return handleApiError(error)
  }
}
