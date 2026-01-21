/**
 * Helper functions for date-related logic
 */

/**
 * Parse a date string flexibly - accepts any text and tries to parse it as a date
 * Returns ISO datetime string if valid, null if invalid or empty
 */
export function parseDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  
  const trimmed = dateStr.trim()
  if (trimmed === '') return null
  
  // Try to parse the date
  const date = new Date(trimmed)
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return null
  }
  
  // Return ISO string
  return date.toISOString()
}

/**
 * Check if a start date is in the future (task/habit hasn't started yet)
 */
export function isPending(startDate: Date | string | null | undefined): boolean {
  if (!startDate) return false

  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)

  return start > today
}

/**
 * Calculate ideal progress based on start date and deadline
 * Returns a percentage (0-100) of how much should be completed by now
 */
export function calculateIdealProgress(
  startDate: Date | string | null | undefined,
  deadline: Date | string | null | undefined
): number | null {
  if (!startDate || !deadline) return null

  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const end = typeof deadline === 'string' ? new Date(deadline) : deadline
  const now = new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  now.setHours(0, 0, 0, 0)

  // If we haven't started yet, ideal progress is 0
  if (now < start) return 0

  // If deadline has passed, ideal progress is 100
  if (now > end) return 100

  // Calculate progress based on time elapsed
  const totalDuration = end.getTime() - start.getTime()
  const elapsed = now.getTime() - start.getTime()

  if (totalDuration <= 0) return 100

  return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
}

/**
 * Calculate urgency score based on actual vs ideal progress
 * Returns a value between 0-100, where higher means more urgent
 * - 0: Ahead of schedule
 * - 50: On track
 * - 100: Severely behind schedule
 */
export function calculateUrgency(
  actualProgress: number,
  idealProgress: number | null
): number {
  if (idealProgress === null) return 0

  // If ideal progress is 0 (haven't started yet), urgency is low
  if (idealProgress === 0) return 0

  // Calculate how far behind we are
  const difference = idealProgress - actualProgress

  // If we're ahead or on track, urgency is low
  if (difference <= 0) return 0

  // Scale urgency: being 50% behind at 50% ideal = 100 urgency
  // Formula: urgency = (difference / idealProgress) * 100, capped at 100
  const urgency = Math.min(100, (difference / idealProgress) * 100)

  return urgency
}

/**
 * Get urgency label based on urgency score
 */
export function getUrgencyLabel(urgency: number): string {
  if (urgency === 0) return 'On Track'
  if (urgency < 25) return 'Slightly Behind'
  if (urgency < 50) return 'Behind Schedule'
  if (urgency < 75) return 'Very Behind'
  return 'Critical'
}

/**
 * Get urgency color class based on urgency score
 */
export function getUrgencyColor(urgency: number): string {
  if (urgency === 0) return 'text-green-600'
  if (urgency < 25) return 'text-yellow-600'
  if (urgency < 50) return 'text-orange-600'
  if (urgency < 75) return 'text-red-600'
  return 'text-red-700'
}
