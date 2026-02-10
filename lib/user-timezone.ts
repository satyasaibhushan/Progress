import { prisma } from "@/lib/prisma";

export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone || "UTC";
  } catch {
    return "UTC";
  }
}

