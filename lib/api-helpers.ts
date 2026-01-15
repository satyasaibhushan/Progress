import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ValidationError, UnauthorizedError } from "@/lib/errors";

/**
 * Get the authenticated user from the session
 * Throws a 401 response if not authenticated
 */
export async function getAuthenticatedUser() {
	const session = await auth();

	if (!session?.user?.id) {
		throw new UnauthorizedError();
	}

	return {
		userId: session.user.id,
		user: session.user,
	};
}

/**
 * Development only: Get user ID without auth check
 * WARNING: Only use in development for API testing!
 */
export async function getDevUser() {
	if (process.env.NODE_ENV !== "development") {
		throw new Error("DEV_ONLY");
	}

	const session = await auth();

	if (!session?.user?.id) {
		throw new UnauthorizedError("Please login first via browser");
	}

	return {
		userId: session.user.id,
		user: session.user,
	};
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown) {
	console.error("[API_ERROR]", error);

	// Handle UnauthorizedError
	if (error instanceof UnauthorizedError) {
		return NextResponse.json({ error: error.message }, { status: 401 });
	}

	// Handle Zod validation errors
	if (error instanceof Error && error.name === "ZodError") {
		return NextResponse.json({ error: "Validation error", details: error }, { status: 400 });
	}

	// Handle ValidationError (e.g., duplicate names)
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	// Generic server error
	return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
