import type { OAuthServerConfig } from "@/lib/oauth/config"

const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/

export type ValidatedAuthorizationRequest = {
  clientId: string
  redirectUri: string
  resource: string
  scope: string
  state: string
  codeChallenge: string
}

export class OAuthProtocolError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message)
    this.name = "OAuthProtocolError"
  }
}

function getSingleParameter(
  parameters: URLSearchParams,
  name: string,
  options?: { required?: boolean; maxLength?: number },
): string | null {
  const values = parameters.getAll(name)
  if (values.length > 1) {
    throw new OAuthProtocolError("invalid_request", `${name} must not be repeated`)
  }

  const value = values[0]?.trim() || null
  if (options?.required && !value) {
    throw new OAuthProtocolError("invalid_request", `${name} is required`)
  }
  if (value && value.length > (options?.maxLength || 2048)) {
    throw new OAuthProtocolError("invalid_request", `${name} is too long`)
  }
  return value
}

export function validateAuthorizationRequest(
  url: URL,
  config: OAuthServerConfig,
): ValidatedAuthorizationRequest {
  const parameters = url.searchParams
  const responseType = getSingleParameter(parameters, "response_type", {
    required: true,
    maxLength: 32,
  })
  const clientId = getSingleParameter(parameters, "client_id", {
    required: true,
    maxLength: 128,
  })
  const redirectUri = getSingleParameter(parameters, "redirect_uri", {
    required: true,
  })
  const resource = getSingleParameter(parameters, "resource", {
    required: true,
  })
  const scope = getSingleParameter(parameters, "scope", {
    required: true,
    maxLength: 512,
  })
  const state = getSingleParameter(parameters, "state", {
    required: true,
    maxLength: 512,
  })
  const codeChallenge = getSingleParameter(parameters, "code_challenge", {
    required: true,
    maxLength: 128,
  })
  const codeChallengeMethod = getSingleParameter(
    parameters,
    "code_challenge_method",
    { required: true, maxLength: 16 },
  )

  if (responseType !== "code") {
    throw new OAuthProtocolError(
      "unsupported_response_type",
      "Only the authorization code response type is supported",
    )
  }
  if (clientId !== config.client.id) {
    throw new OAuthProtocolError("unauthorized_client", "Unknown OAuth client")
  }
  if (!redirectUri || !config.client.redirectUris.includes(redirectUri)) {
    throw new OAuthProtocolError("invalid_request", "redirect_uri is not registered")
  }
  if (resource !== config.resourceUrl.toString()) {
    throw new OAuthProtocolError("invalid_target", "resource is not supported")
  }
  if (codeChallengeMethod !== "S256") {
    throw new OAuthProtocolError(
      "invalid_request",
      "code_challenge_method must be S256",
    )
  }
  if (!codeChallenge || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    throw new OAuthProtocolError("invalid_request", "code_challenge is invalid")
  }
  if (!state) {
    throw new OAuthProtocolError("invalid_request", "state is required")
  }

  const requestedScopes = new Set(scope?.split(/\s+/).filter(Boolean))
  const hasUnknownScope = [...requestedScopes].some(
    (requested) => !config.scopes.includes(requested),
  )
  const missesRequiredScope = config.scopes.some(
    (required) => !requestedScopes.has(required),
  )
  if (hasUnknownScope || missesRequiredScope) {
    throw new OAuthProtocolError("invalid_scope", "Requested scope is not supported")
  }

  return {
    clientId,
    redirectUri,
    resource,
    scope: config.scopes.join(" "),
    state,
    codeChallenge,
  }
}

export function validatePkceVerifier(verifier: string): void {
  if (!PKCE_VERIFIER_PATTERN.test(verifier)) {
    throw new OAuthProtocolError("invalid_grant", "code_verifier is invalid")
  }
}

export function createAuthorizationResponseUrl(
  redirectUri: string,
  parameters: Record<string, string | null | undefined>,
): URL {
  const url = new URL(redirectUri)
  for (const [name, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(name, value)
  }
  return url
}

export function oauthJsonError(error: unknown): Response {
  const protocolError = error instanceof OAuthProtocolError
    ? error
    : new OAuthProtocolError("server_error", "OAuth request failed", 500)

  return Response.json(
    {
      error: protocolError.errorCode,
      error_description: protocolError.message,
    },
    {
      status: protocolError.status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  )
}

export async function readFormRequest(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type")?.toLowerCase() || ""
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    throw new OAuthProtocolError(
      "invalid_request",
      "Content-Type must be application/x-www-form-urlencoded",
    )
  }

  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > 8192) {
    throw new OAuthProtocolError("invalid_request", "Request body is too large", 413)
  }

  const body = await request.text()
  if (body.length > 8192) {
    throw new OAuthProtocolError("invalid_request", "Request body is too large", 413)
  }
  return new URLSearchParams(body)
}

export function requireSingleFormValue(
  form: URLSearchParams,
  name: string,
  maximumLength: number = 4096,
): string {
  const value = getSingleParameter(form, name, {
    required: true,
    maxLength: maximumLength,
  })
  return value || ""
}

export function readOptionalSingleFormValue(
  form: URLSearchParams,
  name: string,
  maximumLength: number = 4096,
): string | null {
  return getSingleParameter(form, name, { maxLength: maximumLength })
}
