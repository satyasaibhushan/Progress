import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { readOAuthServerConfig } from "@/lib/oauth/config"
import { getAuthorizationRequest } from "@/lib/oauth/store"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>
}) {
  const parameters = await searchParams
  const requestId = parameters.request || ""
  const session = await auth()

  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(
      `/oauth/consent?request=${requestId}`,
    )}`)
  }

  const config = readOAuthServerConfig()
  const pending = await getAuthorizationRequest(requestId, session.user.id)

  if (!pending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Authorization request expired</CardTitle>
            <CardDescription>
              Return to Kairo and start the connection again.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Connect {config.client.name}</CardTitle>
          <CardDescription>
            {config.client.name} is requesting read-only access to your Progress account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">This connection can</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Read your task progress and status</li>
              <li>Read your habit progress and streaks</li>
              <li>Read groups, labels, dates, and recent habit logs</li>
            </ul>
            <p className="mt-3 text-sm font-medium">It cannot modify or delete data.</p>
          </div>

          <div className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session.user.email}</span>
          </div>

          <form
            action="/oauth/authorize/decision"
            method="post"
            className="flex justify-end gap-3"
          >
            <input type="hidden" name="request" value={pending.id} />
            <Button type="submit" name="decision" value="deny" variant="outline">
              Cancel
            </Button>
            <Button type="submit" name="decision" value="allow">
              Allow read-only access
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
