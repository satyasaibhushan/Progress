import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateLabelSchema } from "@/lib/validations/label"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"

// GET /api/labels/[id] - Get a specific label with its associated items
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    const label = await prisma.label.findFirst({
      where: {
        id: id,
        userId, // Security: only user's own labels
      },
      include: {
        tasks: {
          include: {
            task: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
              },
            },
          },
        },
        habits: {
          include: {
            habit: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
    })

    if (!label) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 })
    }

    return NextResponse.json({ data: label })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/labels/[id] - Update a label
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if label exists and belongs to user
    const existingLabel = await prisma.label.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!existingLabel) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateLabelSchema.parse(body)

    // If name is being updated, check for duplicates
    if (validatedData.name && validatedData.name !== existingLabel.name) {
      const duplicate = await prisma.label.findFirst({
        where: {
          userId,
          name: validatedData.name,
          id: {
            not: id,
          },
        },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: "Label with this name already exists" },
          { status: 400 }
        )
      }
    }

    const label = await prisma.label.update({
      where: {
        id: id,
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

    return NextResponse.json({ data: label })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/labels/[id] - Delete a label
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await getAuthenticatedUser()

    // Check if label exists and belongs to user
    const existingLabel = await prisma.label.findFirst({
      where: {
        id: id,
        userId,
      },
    })

    if (!existingLabel) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 })
    }

    // Delete will cascade to TaskLabel and HabitLabel due to schema onDelete: Cascade
    await prisma.label.delete({
      where: {
        id: id,
      },
    })

    return NextResponse.json({ message: "Label deleted successfully" })
  } catch (error) {
    return handleApiError(error)
  }
}
