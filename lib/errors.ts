/**
 * Custom error class for validation errors
 * Thrown when business logic validation fails (e.g., duplicate names)
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/**
 * Custom error class for unauthorized access
 */
export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message)
    this.name = "UnauthorizedError"
  }
}
