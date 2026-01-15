import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createGroupSchema } from "@/lib/validations/group"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"
import { validateUniqueGroupName } from "@/lib/validations/uniqueness"

// GET /api/groups - Get all groups for the authenticated user
export async function GET() {
  try {
    const { userId } = await getAuthenticatedUser()

    const groups = await prisma.group.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            tasks: true,
            habits: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ data: groups })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/groups - Create a new group
export async function POST(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()

    const body = await request.json()
    const validatedData = createGroupSchema.parse(body)

    // Validate unique name
    await validateUniqueGroupName(userId, validatedData.name)

    const group = await prisma.group.create({
      data: {
        ...validatedData,
        userId,
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

    return NextResponse.json({ data: group }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
