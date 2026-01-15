import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createLabelSchema } from "@/lib/validations/label"
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers"

// GET /api/labels - Get all labels for the authenticated user
export async function GET() {
  try {
    const { userId } = await getAuthenticatedUser()

    const labels = await prisma.label.findMany({
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
        name: "asc",
      },
    })

    return NextResponse.json({ data: labels })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/labels - Create a new label
export async function POST(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser()

    const body = await request.json()
    const validatedData = createLabelSchema.parse(body)

    // Check if label with same name already exists for this user
    const existingLabel = await prisma.label.findFirst({
      where: {
        userId,
        name: validatedData.name,
      },
    })

    if (existingLabel) {
      return NextResponse.json(
        { error: "Label with this name already exists" },
        { status: 400 }
      )
    }

    const label = await prisma.label.create({
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

    return NextResponse.json({ data: label }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
