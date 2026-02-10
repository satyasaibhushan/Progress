export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateGroupSchema } from "@/lib/validations/group"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueGroupName } from "@/lib/validations/uniqueness"

// GET /api/groups/[id] - Get a specific group
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    const group = await prisma.group.findFirst({
      where: {
        id,
        userId, // Security: only user's own groups
      },
      include: {
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    return NextResponse.json({ data: group })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/groups/[id] - Update a group
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    // Check if group exists and belongs to user
    const existingGroup = await prisma.group.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!existingGroup) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateGroupSchema.parse(body)

    // Validate unique name (if name is being updated)
    if (validatedData.name) {
      await validateUniqueGroupName(userId, validatedData.name, id)
    }

    const group = await prisma.group.update({
      where: {
        id,
      },
      data: validatedData,
      include: {
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
    })

    return NextResponse.json({ data: group })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/groups/[id] - Delete a group
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await getAuthenticatedUser()
    const { id } = await params

    // Check if group exists and belongs to user
    const existingGroup = await prisma.group.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!existingGroup) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    await prisma.group.delete({
      where: {
        id,
      },
    })

    return NextResponse.json({ message: "Group deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
