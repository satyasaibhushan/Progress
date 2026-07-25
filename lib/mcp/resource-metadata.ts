import {
  getProtectedResourceMetadata,
  McpConfigurationError,
  readMcpAuthConfig,
} from "@/lib/mcp/config"

export function getMcpProtectedResourceMetadata(): Response {
  try {
    const config = readMcpAuthConfig()
    return Response.json(getProtectedResourceMetadata(config), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch (error) {
    const message = error instanceof McpConfigurationError
      ? error.message
      : "MCP authorization is unavailable"
    console.error("[MCP_CONFIGURATION_ERROR]", message)

    return Response.json(
      { error: "mcp_configuration_error" },
      {
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      },
    )
  }
}
