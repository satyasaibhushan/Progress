import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { z } from "zod"
import {
  getBearerChallenge,
  type McpAuthConfig,
} from "@/lib/mcp/config"
import {
  logMcpAuditEvent,
  type McpPrincipal,
} from "@/lib/mcp/auth"
import {
  getProgressItem,
  getProgressOverview,
  listProgressHabits,
  listProgressTasks,
  MCP_HABIT_TYPES,
  MCP_ITEM_STATUSES,
  type McpHabitListOptions,
  type McpListOptions,
} from "@/lib/mcp/progress-data"

type JsonObject = Record<string, unknown>

export type ProgressMcpDataSource = {
  overview(userId: string): Promise<JsonObject>
  listTasks(userId: string, options: McpListOptions): Promise<JsonObject>
  listHabits(userId: string, options: McpHabitListOptions): Promise<JsonObject>
  getItem(userId: string, kind: "task" | "habit", id: string): Promise<JsonObject>
}

const defaultDataSource: ProgressMcpDataSource = {
  overview: getProgressOverview,
  listTasks: listProgressTasks,
  listHabits: listProgressHabits,
  getItem: getProgressItem,
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

function securityMetadata(config: McpAuthConfig): Record<string, unknown> {
  return {
    securitySchemes: [
      {
        type: "oauth2",
        scopes: config.requiredScopes,
      },
    ],
  }
}

function toolResult(data: JsonObject) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data),
      },
    ],
    structuredContent: data,
  }
}

function toolAuthError(config: McpAuthConfig, message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
    _meta: {
      "mcp/www_authenticate": [
        getBearerChallenge(config, {
          error: "insufficient_scope",
          description: message,
        }),
      ],
    },
  }
}

function authorizeTool(
  authInfo: AuthInfo | undefined,
  principal: McpPrincipal,
  config: McpAuthConfig,
) {
  if (authInfo?.extra?.userId !== principal.userId) {
    return toolAuthError(config, "Authentication context is missing or invalid")
  }

  const grantedScopes = new Set(authInfo.scopes)
  const missingScopes = config.requiredScopes.filter(
    (scope) => !grantedScopes.has(scope),
  )
  if (missingScopes.length > 0) {
    return toolAuthError(
      config,
      `Missing required scope${missingScopes.length === 1 ? "" : "s"}: ${missingScopes.join(", ")}`,
    )
  }

  return null
}

export function createProgressMcpServer(
  principal: McpPrincipal,
  config: McpAuthConfig,
  dataSource: ProgressMcpDataSource = defaultDataSource,
): McpServer {
  const server = new McpServer({
    name: "progress",
    version: "1.0.0",
  })
  const metadata = securityMetadata(config)

  server.registerTool(
    "get_progress_overview",
    {
      title: "Get progress overview",
      description: "Summarize the authenticated user's task and habit progress, including priorities and overdue counts.",
      annotations: readOnlyAnnotations,
      _meta: metadata,
    },
    async (extra) => {
      const authError = authorizeTool(extra.authInfo, principal, config)
      if (authError) return authError
      const requestId = String(extra.requestId)

      try {
        const data = await dataSource.overview(principal.userId)
        logMcpAuditEvent({
          requestId,
          outcome: "allowed",
          action: "get_progress_overview",
          principal,
          status: 200,
        })
        return toolResult(data)
      } catch (error) {
        logMcpAuditEvent({
          requestId,
          outcome: "error",
          action: "get_progress_overview",
          principal,
          status: 500,
        })
        throw error
      }
    },
  )

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List the authenticated user's tasks with derived progress, hierarchy, labels, group, dates, and status.",
      inputSchema: {
        status: z.enum(MCP_ITEM_STATUSES).default("all"),
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: readOnlyAnnotations,
      _meta: metadata,
    },
    async ({ status, search, limit }, extra) => {
      const authError = authorizeTool(extra.authInfo, principal, config)
      if (authError) return authError
      const requestId = String(extra.requestId)

      try {
        const data = await dataSource.listTasks(principal.userId, {
          status,
          search,
          limit,
        })
        logMcpAuditEvent({
          requestId,
          outcome: "allowed",
          action: "list_tasks",
          principal,
          status: 200,
        })
        return toolResult(data)
      } catch (error) {
        logMcpAuditEvent({
          requestId,
          outcome: "error",
          action: "list_tasks",
          principal,
          status: 500,
        })
        throw error
      }
    },
  )

  server.registerTool(
    "list_habits",
    {
      title: "List habits",
      description: "List the authenticated user's habits with cumulative progress, current-period progress, streaks, labels, group, and status.",
      inputSchema: {
        status: z.enum(MCP_ITEM_STATUSES).default("all"),
        type: z.enum(MCP_HABIT_TYPES).default("all"),
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: readOnlyAnnotations,
      _meta: metadata,
    },
    async ({ status, type, search, limit }, extra) => {
      const authError = authorizeTool(extra.authInfo, principal, config)
      if (authError) return authError
      const requestId = String(extra.requestId)

      try {
        const data = await dataSource.listHabits(principal.userId, {
          status,
          type,
          search,
          limit,
        })
        logMcpAuditEvent({
          requestId,
          outcome: "allowed",
          action: "list_habits",
          principal,
          status: 200,
        })
        return toolResult(data)
      } catch (error) {
        logMcpAuditEvent({
          requestId,
          outcome: "error",
          action: "list_habits",
          principal,
          status: 500,
        })
        throw error
      }
    },
  )

  server.registerTool(
    "get_progress_item",
    {
      title: "Get task or habit",
      description: "Get one authenticated user's task or habit by ID, including detailed progress fields and recent habit logs.",
      inputSchema: {
        kind: z.enum(["task", "habit"]),
        id: z.string().trim().min(1).max(128),
      },
      annotations: readOnlyAnnotations,
      _meta: metadata,
    },
    async ({ kind, id }, extra) => {
      const authError = authorizeTool(extra.authInfo, principal, config)
      if (authError) return authError
      const requestId = String(extra.requestId)

      try {
        const data = await dataSource.getItem(principal.userId, kind, id)
        logMcpAuditEvent({
          requestId,
          outcome: "allowed",
          action: "get_progress_item",
          principal,
          status: 200,
        })
        return toolResult(data)
      } catch (error) {
        logMcpAuditEvent({
          requestId,
          outcome: "error",
          action: "get_progress_item",
          principal,
          status: 500,
        })
        throw error
      }
    },
  )

  return server
}
