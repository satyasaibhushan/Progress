import { prisma } from "./prisma"
import { calculateHabitCompletion } from "./progress-calculator"

interface SuggestionItem {
  id: string
  type: "task" | "habit"
  title: string
  progress: number
  expectedProgress: number
  progressGap: number
  importance: number
  score: number
  deadline?: Date | null
  endDate?: Date | null
  createdAt: Date
  // Additional context
  groupId?: string | null
  parentId?: string | null
  parentTaskId?: string | null
}

/**
 * Calculate expected progress based on time elapsed
 */
function calculateExpectedProgress(
  startDate: Date,
  endDate: Date | null,
  currentDate: Date = new Date()
): number {
  if (!endDate) return 0

  const totalMs = endDate.getTime() - startDate.getTime()
  const elapsedMs = currentDate.getTime() - startDate.getTime()

  if (totalMs <= 0) return 100 // Already past end date
  if (elapsedMs <= 0) return 0 // Not started yet

  const expectedProgress = (elapsedMs / totalMs) * 100
  return Math.max(0, Math.min(100, expectedProgress))
}

/**
 * Calculate suggestion score for an item
 * Score = importance × (expectedProgress - currentProgress) × randomFactor
 */
function calculateScore(
  importance: number,
  expectedProgress: number,
  currentProgress: number,
  randomize: boolean = true
): number {
  const progressGap = Math.max(0, expectedProgress - currentProgress)
  const baseScore = importance * progressGap

  if (!randomize) return baseScore

  // 20% randomness: multiply by random factor between 0.8 and 1.2
  const randomFactor = 0.8 + Math.random() * 0.4 // 0.8 to 1.2
  return baseScore * randomFactor
}

/**
 * Get all leaf tasks (tasks with no children and no habits)
 */
async function getLeafTasks(userId: string): Promise<SuggestionItem[]> {
  // Fetch tasks with deadlines and their counts
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      deadline: { not: null }, // Only tasks with deadlines
    },
    select: {
      id: true,
      title: true,
      progress: true,
      importance: true,
      deadline: true,
      createdAt: true,
      groupId: true,
      parentId: true,
      _count: {
        select: {
          children: true,
          habits: true,
        },
      },
    },
  })

  // Filter to only leaf tasks (no children and no habits) and exclude completed ones
  const leafTasks = tasks.filter(
    (task) => 
      task._count.children === 0 && 
      task._count.habits === 0 &&
      (task.progress || 0) < 100 // Exclude completed tasks
  )

  const now = new Date()
  const items: SuggestionItem[] = []

  for (const task of leafTasks) {
    const currentProgress = task.progress || 0
    const expectedProgress = calculateExpectedProgress(
      task.createdAt,
      task.deadline,
      now
    )
    const progressGap = Math.max(0, expectedProgress - currentProgress)

    items.push({
      id: task.id,
      type: "task",
      title: task.title,
      progress: currentProgress,
      expectedProgress,
      progressGap,
      importance: task.importance,
      score: 0, // Will be calculated later
      deadline: task.deadline,
      createdAt: task.createdAt,
      groupId: task.groupId,
      parentId: task.parentId,
    })
  }

  return items
}

/**
 * Get all habits
 */
async function getLeafHabits(userId: string): Promise<SuggestionItem[]> {
  const habits = await prisma.habit.findMany({
    where: {
      userId,
      endDate: { not: null }, // Only habits with endDate
    },
    select: {
      id: true,
      title: true,
      importance: true,
      endDate: true,
      createdAt: true,
      targetCount: true,
      groupId: true,
      parentTaskId: true,
    },
  })

  const now = new Date()
  const items: SuggestionItem[] = []

  for (const habit of habits) {
    const currentProgress = await calculateHabitCompletion(habit.id)
    
    // Exclude completed habits (progress >= 100%)
    if (currentProgress >= 100) {
      continue
    }
    
    const expectedProgress = calculateExpectedProgress(
      habit.createdAt,
      habit.endDate,
      now
    )
    const progressGap = Math.max(0, expectedProgress - currentProgress)

    items.push({
      id: habit.id,
      type: "habit",
      title: habit.title,
      progress: currentProgress,
      expectedProgress,
      progressGap,
      importance: habit.importance,
      score: 0, // Will be calculated later
      endDate: habit.endDate,
      createdAt: habit.createdAt,
      groupId: habit.groupId,
      parentTaskId: habit.parentTaskId,
    })
  }

  return items
}

/**
 * Get suggestion for a user
 * Returns the item with highest score: importance × (expectedProgress - currentProgress) × randomFactor
 */
export async function getSuggestion(
  userId: string,
  randomize: boolean = true
): Promise<SuggestionItem | null> {
  // Get all leaf nodes
  const [leafTasks, leafHabits] = await Promise.all([
    getLeafTasks(userId),
    getLeafHabits(userId),
  ])

  // Combine and calculate scores
  const allItems: SuggestionItem[] = [...leafTasks, ...leafHabits]

  if (allItems.length === 0) {
    return null
  }

  // Calculate scores for all items
  for (const item of allItems) {
    item.score = calculateScore(
      item.importance,
      item.expectedProgress,
      item.progress,
      randomize
    )
  }

  // Sort by score (descending) and return top item
  allItems.sort((a, b) => b.score - a.score)

  return allItems[0]
}

/**
 * Get multiple suggestions (top N)
 */
export async function getSuggestions(
  userId: string,
  limit: number = 1,
  randomize: boolean = true
): Promise<SuggestionItem[]> {
  const [leafTasks, leafHabits] = await Promise.all([
    getLeafTasks(userId),
    getLeafHabits(userId),
  ])

  const allItems: SuggestionItem[] = [...leafTasks, ...leafHabits]

  if (allItems.length === 0) {
    return []
  }

  // Calculate scores
  for (const item of allItems) {
    item.score = calculateScore(
      item.importance,
      item.expectedProgress,
      item.progress,
      randomize
    )
  }

  // Sort by score and return top N
  allItems.sort((a, b) => b.score - a.score)
  return allItems.slice(0, limit)
}
