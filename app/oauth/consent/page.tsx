import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { findOAuthClient } from "@/lib/oauth/clients"
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

  const pending = await getAuthorizationRequest(requestId, session.user.id)
  const client = pending ? await findOAuthClient(pending.clientId) : null

  if (!pending || !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Authorization request expired</CardTitle>
            <CardDescription>
              Return to your MCP client and start the connection again.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  const callbackUrl = new URL(pending.redirectUri)
  const isLoopbackCallback = callbackUrl.hostname === "localhost"
    || callbackUrl.hostname === "127.0.0.1"
    || callbackUrl.hostname === "[::1]"

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Connect {client.clientName}</CardTitle>
          <CardDescription>
            {client.clientName} is requesting read-only access to your Progress account.
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
          <div className="text-sm text-muted-foreground">
            Authorization will return to{" "}
            <span className="font-medium text-foreground">
              {callbackUrl.host}
            </span>
          </div>
          {isLoopbackCallback && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              This is a local callback. Approve only if you started this
              connection from an MCP client on a device you control.
            </div>
          )}

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
