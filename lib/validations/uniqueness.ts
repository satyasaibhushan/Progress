import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

/**
 * Validates that a group name is unique for the user
 */
export async function validateUniqueGroupName(userId: string, name: string, excludeId?: string) {
	const existing = await prisma.group.findFirst({
		where: {
			userId,
			name: { equals: name, mode: "insensitive" },
			...(excludeId && { id: { not: excludeId } }),
		},
	});

	if (existing) {
		throw new ValidationError("A group with this name already exists");
	}
}

/**
 * Validates that a habit title is unique for the user
 */
export async function validateUniqueHabitTitle(userId: string, title: string, excludeId?: string) {
	const existing = await prisma.habit.findFirst({
		where: {
			userId,
			title: { equals: title, mode: "insensitive" },
			...(excludeId && { id: { not: excludeId } }),
		},
	});

	if (existing) {
		throw new ValidationError("A habit with this title already exists");
	}
}

/**
 * Validates that a task title is unique within the same parent level
 */
export async function validateUniqueTaskTitle(
	userId: string,
	title: string,
	parentId: string | null,
	excludeId?: string
) {
	const existing = await prisma.task.findFirst({
		where: {
			userId,
			title: { equals: title, mode: "insensitive" },
			parentId,
			...(excludeId && { id: { not: excludeId } }),
		},
	});

	if (existing) {
		throw new ValidationError("A task with this title already exists at this level");
	}
}
