import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { z } from "zod"

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
      return NextResponse.json(
        { error: "Label already associated with this task" },
        { status: 400 }
      )
    }

    // Create association
    await prisma.taskLabel.create({
      data: {
        taskId: id,
        labelId,
      },
    })

    // Return updated task with labels
    const updatedTask = await prisma.task.findUnique({
      where: { id },
      include: {
        labels: {
          include: {
            label: true,
          },
        },
      },
    })

    return NextResponse.json({ data: updatedTask })
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

    const body = await request.json()
    const { labelId } = removeLabelSchema.parse(body)

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

    // Remove association
    await prisma.taskLabel.delete({
      where: {
        taskId_labelId: {
          taskId: id,
          labelId,
        },
      },
    })

    // Return updated task with labels
    const updatedTask = await prisma.task.findUnique({
      where: { id },
      include: {
        labels: {
          include: {
            label: true,
          },
        },
      },
    })

    return NextResponse.json({ data: updatedTask })
  } catch (error) {
    return handleApiError(error)
  }
}
