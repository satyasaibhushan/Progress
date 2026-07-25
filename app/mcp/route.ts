import { randomUUID } from "node:crypto"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import {
  authenticateMcpRequest,
  createMcpAuthErrorResponse,
  logMcpAuditEvent,
  McpAuthenticationError,
} from "@/lib/mcp/auth"
import {
  McpConfigurationError,
  readMcpAuthConfig,
} from "@/lib/mcp/config"
import { createProgressMcpServer } from "@/lib/mcp/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getRequestId(request: Request): string {
  const provided = request.headers.get("x-request-id")
  if (provided && /^[a-zA-Z0-9._:-]{1,128}$/.test(provided)) {
    return provided
  }
  return randomUUID()
}

function withMcpHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Expose-Headers", "MCP-Session-Id, WWW-Authenticate, X-Request-Id")
  headers.set("Cache-Control", "no-store")
  headers.set("X-Request-Id", requestId)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const requestId = getRequestId(request)

  try {
    const config = readMcpAuthConfig()
    const principal = await authenticateMcpRequest(request, config)
    const authorization = request.headers.get("authorization")
    const token = authorization?.slice(7) || ""
    const server = createProgressMcpServer(principal, config)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    await server.connect(transport)
    const response = await transport.handleRequest(request, {
      authInfo: {
        token,
        clientId: principal.clientId,
        scopes: principal.scopes,
        expiresAt: principal.expiresAt,
        resource: config.resourceUrl,
        extra: {
          userId: principal.userId,
          issuer: principal.issuer,
          subject: principal.subject,
        },
      },
    })

    logMcpAuditEvent({
      requestId,
      outcome: "allowed",
      action: `transport:${request.method}`,
      principal,
      status: response.status,
    })
    return withMcpHeaders(response, requestId)
  } catch (error) {
    if (error instanceof McpAuthenticationError) {
      let config
      try {
        config = readMcpAuthConfig()
      } catch {
        return Response.json(
          { error: "mcp_configuration_error", request_id: requestId },
          { status: 503 },
        )
      }

      logMcpAuditEvent({
        requestId,
        outcome: "denied",
        action: `transport:${request.method}`,
        status: error.status,
      })
      return withMcpHeaders(
        createMcpAuthErrorResponse(error, config, requestId),
        requestId,
      )
    }

    if (error instanceof McpConfigurationError) {
      console.error("[MCP_CONFIGURATION_ERROR]", error.message)
      return Response.json(
        { error: "mcp_configuration_error", request_id: requestId },
        {
          status: 503,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
            "X-Request-Id": requestId,
          },
        },
      )
    }

    console.error("[MCP_REQUEST_ERROR]", error)
    logMcpAuditEvent({
      requestId,
      outcome: "error",
      action: `transport:${request.method}`,
      status: 500,
    })
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    )
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, X-Request-Id",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "MCP-Session-Id, WWW-Authenticate, X-Request-Id",
      "Access-Control-Max-Age": "86400",
    },
  })
}

export const GET = handleMcpRequest
export const POST = handleMcpRequest
export const DELETE = handleMcpRequest
