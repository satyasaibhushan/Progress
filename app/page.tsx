import { auth } from "@/lib/auth"
import { UserMenu } from "@/components/layout/user-menu"

export default async function Home() {
  const session = await auth()

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Progress</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold">Welcome back, {session?.user?.name}!</h2>
          <p className="text-muted-foreground">
            Start tracking your goals, tasks, and habits to achieve your objectives.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-6">
              <h3 className="mb-2 text-lg font-semibold">Goals</h3>
              <p className="text-sm text-muted-foreground">Track your long-term objectives</p>
              <p className="mt-4 text-3xl font-bold">0</p>
            </div>

            <div className="rounded-lg border p-6">
              <h3 className="mb-2 text-lg font-semibold">Active Tasks</h3>
              <p className="text-sm text-muted-foreground">Tasks in progress</p>
              <p className="mt-4 text-3xl font-bold">0</p>
            </div>

            <div className="rounded-lg border p-6">
              <h3 className="mb-2 text-lg font-semibold">Habits</h3>
              <p className="text-sm text-muted-foreground">Daily habit tracking</p>
              <p className="mt-4 text-3xl font-bold">0</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
