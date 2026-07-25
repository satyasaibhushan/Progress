import { getMcpProtectedResourceMetadata } from "@/lib/mcp/resource-metadata"

export const dynamic = "force-dynamic"

export function GET() {
  return getMcpProtectedResourceMetadata()
}
