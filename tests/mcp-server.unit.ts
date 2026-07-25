import assert from "node:assert/strict"
import test from "node:test"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createProgressMcpServer, type ProgressMcpDataSource } from "../lib/mcp/server"
import { readMcpAuthConfig } from "../lib/mcp/config"
import type { McpPrincipal } from "../lib/mcp/auth"

const config = readMcpAuthConfig({
  MCP_RESOURCE_URL: "https://progress.example.com/mcp",
  MCP_AUTH_ISSUER: "https://auth.example.com/",
  MCP_AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
  MCP_AUTH_AUDIENCE: "https://progress.example.com/mcp",
  MCP_AUTH_REQUIRED_SCOPES: "progress:read",
})

const principal: McpPrincipal = {
  userId: "progress-user",
  issuer: config.issuer,
  subject: "provider-subject",
  clientId: "test-client",
  scopes: ["progress:read"],
}

const authInfo: AuthInfo = {
  token: "test-token",
  clientId: principal.clientId,
  scopes: principal.scopes,
  resource: config.resourceUrl,
  extra: {
    userId: principal.userId,
  },
}

type JsonRpcResponse = {
  result?: {
    tools?: Array<{
      name: string
      annotations?: Record<string, unknown>
      _meta?: Record<string, unknown>
    }>
    content?: Array<{ type: string; text?: string }>
    structuredContent?: Record<string, unknown>
    isError?: boolean
    _meta?: Record<string, unknown>
  }
  error?: {
    code: number
    message: string
  }
}

async function invokeMcp(
  body: Record<string, unknown>,
  dataSource: ProgressMcpDataSource,
  requestAuthInfo: AuthInfo = authInfo,
): Promise<{ response: Response; body: JsonRpcResponse }> {
  const server = createProgressMcpServer(principal, config, dataSource)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)

  const response = await transport.handleRequest(
    new Request(config.resourceUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify(body),
    }),
    {
      authInfo: requestAuthInfo,
    },
  )
  const parsed = await response.json() as JsonRpcResponse
  await server.close()
  return { response, body: parsed }
}

function createDataSource() {
  const calls: Array<{ action: string; userId: string; input?: unknown }> = []
  const dataSource: ProgressMcpDataSource = {
    async overview(userId) {
      calls.push({ action: "overview", userId })
      return { overallProgress: 42 }
    },
    async listTasks(userId, options) {
      calls.push({ action: "listTasks", userId, input: options })
      return {
        totalMatched: 1,
        tasks: [{ id: "task-1", title: "Ship MCP", progress: 42 }],
      }
    },
    async listHabits(userId, options) {
      calls.push({ action: "listHabits", userId, input: options })
      return { totalMatched: 0, habits: [] }
    },
    async getItem(userId, kind, id) {
      calls.push({ action: "getItem", userId, input: { kind, id } })
      return { kind, item: { id } }
    },
  }

  return { dataSource, calls }
}

test("MCP server exposes only read-only OAuth-protected progress tools", async () => {
  const { dataSource } = createDataSource()
  const { response, body } = await invokeMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    },
    dataSource,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(
    body.result?.tools?.map((tool) => tool.name),
    [
      "get_progress_overview",
      "list_tasks",
      "list_habits",
      "get_progress_item",
    ],
  )

  for (const tool of body.result?.tools || []) {
    assert.equal(tool.annotations?.readOnlyHint, true)
    assert.equal(tool.annotations?.destructiveHint, false)
    assert.deepEqual(tool._meta?.securitySchemes, [{
      type: "oauth2",
      scopes: ["progress:read"],
    }])
  }
})

test("MCP tool calls use the authenticated user and validated defaults", async () => {
  const { dataSource, calls } = createDataSource()
  const { body } = await invokeMcp(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "list_tasks",
        arguments: {},
      },
    },
    dataSource,
  )

  assert.equal(body.result?.isError, undefined)
  assert.deepEqual(body.result?.structuredContent, {
    totalMatched: 1,
    tasks: [{ id: "task-1", title: "Ship MCP", progress: 42 }],
  })
  assert.deepEqual(calls, [{
    action: "listTasks",
    userId: "progress-user",
    input: {
      status: "all",
      search: undefined,
      limit: 50,
    },
  }])
})

test("MCP tools reject a mismatched transport identity before loading data", async () => {
  const { dataSource, calls } = createDataSource()
  const { body } = await invokeMcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_progress_overview",
        arguments: {},
      },
    },
    dataSource,
    {
      ...authInfo,
      extra: {
        userId: "different-user",
      },
    },
  )

  assert.equal(body.result?.isError, true)
  assert.match(
    String(body.result?._meta?.["mcp/www_authenticate"]),
    /insufficient_scope/,
  )
  assert.deepEqual(calls, [])
})
