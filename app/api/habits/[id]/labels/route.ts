import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { z } from "zod"
import {
  canRemoveLabelFromHabit,
} from "@/lib/inheritance-helpers"
import { serializeHabit } from "@/lib/utils"

const addLabelSchema = z.object({
  labelId: z.string().min(1, "Label ID is required"),
})

const removeLabelSchema = z.object({
  labelId: z.string().min(1, "Label ID is required"),
})

// POST /api/habits/[id]/labels - Add a label to a habit
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
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
    const existing = await prisma.habitLabel.findUnique({
      where: {
        habitId_labelId: {
          habitId: id,
          labelId,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Label already associated with this habit" },
        { status: 400 }
      )
    }

    // Create association
    await prisma.habitLabel.create({
      data: {
        habitId: id,
        labelId,
      },
    })

    // Return updated habit with labels
    const updatedHabit = await prisma.habit.findUnique({
      where: { id: id },
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
        habitLabels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            habitLogs: true,
          },
        },
      },
    })

    return NextResponse.json({ data: serializeHabit(updatedHabit!) })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/habits/[id]/labels - Remove a label from a habit
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if habit exists and belongs to user
    const habit = await prisma.habit.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const body = await request.json()
    const { labelId } = removeLabelSchema.parse(body)

    // Check if association exists
    const existing = await prisma.habitLabel.findUnique({
      where: {
        habitId_labelId: {
          habitId: id,
          labelId,
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Label not associated with this habit" },
        { status: 404 }
      )
    }

    // Check if label can be removed (not inherited from parent)
    const canRemove = await canRemoveLabelFromHabit(id, labelId, userId)
    if (!canRemove) {
      return NextResponse.json(
        { 
          error: "Cannot remove label. This label is inherited from a parent task. Unlink this habit from its parent task to remove the label.",
        },
        { status: 400 }
      )
    }

    // Remove association
    await prisma.habitLabel.delete({
      where: {
        habitId_labelId: {
          habitId: id,
          labelId,
        },
      },
    })

    // Return updated habit with labels
    const updatedHabit = await prisma.habit.findUnique({
      where: { id: id },
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
        habitLabels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            habitLogs: true,
          },
        },
      },
    })

    return NextResponse.json({ data: serializeHabit(updatedHabit!) })
  } catch (error) {
    return handleApiError(error)
  }
}
