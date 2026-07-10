import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, handleApiError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { isValidTimeZone } from "@/lib/user-timezone";

const updateTimezoneSchema = z.object({
  timezone: z.string().min(1).max(100).refine(isValidTimeZone, "Invalid IANA timezone"),
});

export async function PUT(request: Request) {
  try {
    const { userId } = await getAuthenticatedUser();
    const { timezone } = updateTimezoneSchema.parse(await request.json());
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (currentUser.timezone !== timezone) {
      await prisma.user.update({
        where: { id: userId },
        data: { timezone },
      });
    }

    return NextResponse.json({ timezone });
  } catch (error) {
    return handleApiError(error);
  }
}
