import {
  deriveProgressModel,
  type ProgressHabit,
  type ProgressTask,
} from "@/lib/progress-model"

export function attachDerivedTaskProgress<
  TTask extends ProgressTask & {
    total_weight?: bigint | null
    weighted_progress?: bigint | null
  },
  THabit extends ProgressHabit,
>(tasks: TTask[], habits: THabit[]): void {
  const model = deriveProgressModel(tasks, habits)

  for (const task of tasks) {
    const derived = model.tasks.get(task.id)
    if (!derived) continue

    task.progress = derived.progress
    task.total_weight = derived.isLeaf ? null : BigInt(derived.totalWeight)
    task.weighted_progress = derived.isLeaf ? null : BigInt(derived.weightedProgress)
  }
}
