import type { Context } from 'hono'
import type { CookieOptions } from 'hono/utils/cookie'

import { Hono } from 'hono'
import { deleteCookie, setSignedCookie } from 'hono/cookie'
import { parseSigned } from 'hono/utils/cookie'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { serverErrorCode } from './error.ts'

const actorId = 'operator'
const cookieName = 'open_flow_operator_session'
const maxRequestBytes = 4 * 1024
const sessionLifetimeSeconds = 12 * 60 * 60
const encoder = new TextEncoder()

export class OperatorSession {
  readonly #cookie: CookieOptions
  readonly #now: () => number
  readonly #secret: string
  readonly #token: Uint8Array

  constructor(token: string, secure: boolean, now: () => number = Date.now) {
    const bytes = encoder.encode(token)
    if (bytes.byteLength < 32) throw new Error('OPEN_FLOW_OPERATOR_TOKEN must contain at least 32 UTF-8 bytes.')
    this.#cookie = { httpOnly: true, path: '/', sameSite: 'Strict', secure }
    this.#now = now
    this.#secret = token
    this.#token = bytes
  }

  async actor(request: Request): Promise<string | undefined> {
    const cookie = request.headers.get('cookie')
    if (cookie == null) return
    const value = (await parseSigned(cookie, this.#secret, cookieName))[cookieName]
    if (typeof value != 'string') return
    const [version, expiresAt, nonce, extra] = value.split(':')
    if (version != '1' || extra != null || nonce == null || nonce.length == 0) return
    const expiration = Number(expiresAt)
    return Number.isSafeInteger(expiration) && expiration > this.#now() ? actorId : undefined
  }

  matches(token: string): boolean {
    const candidate = encoder.encode(token)
    return candidate.byteLength == this.#token.byteLength && timingSafeEqual(candidate, this.#token)
  }

  async setCookie(context: Context): Promise<void> {
    const expiresAt = this.#now() + sessionLifetimeSeconds * 1_000
    await setSignedCookie(context, cookieName, `1:${expiresAt}:${randomUUID()}`, this.#secret, {
      ...this.#cookie,
      maxAge: sessionLifetimeSeconds,
    })
  }

  clearCookie(context: Context): void {
    deleteCookie(context, cookieName, this.#cookie)
  }
}

export function createOperatorApp(session?: OperatorSession): Hono {
  const app = new Hono()

  app.get('/session', async (context) => {
    const authenticated = session == null ? false : (await session.actor(context.req.raw)) != null
    return json(200, { authenticated, configured: session != null, version: 1 })
  })

  app.post('/session', async (context) => {
    if (session == null) {
      return json(503, {
        error: { code: serverErrorCode.operatorNotConfigured, message: 'Operator authentication is not configured.' },
        version: 1,
      })
    }
    const body = await loginRequest(context.req.raw)
    if (body == null) return json(400, { error: { code: serverErrorCode.operatorInvalid, message: 'Session request is invalid.' }, version: 1 })
    if (!session.matches(body.token)) {
      return json(401, { error: { code: serverErrorCode.authenticationInvalid, message: 'Operator token is invalid.' }, version: 1 })
    }
    await session.setCookie(context)
    return json(200, { authenticated: true, configured: true, version: 1 }, context.res.headers)
  })

  app.delete('/session', (context) => {
    session?.clearCookie(context)
    return new Response(null, { headers: noStore(context.res.headers), status: 204 })
  })

  return app
}

async function loginRequest(request: Request): Promise<{ readonly token: string } | undefined> {
  if (request.body == null) return
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of request.body) {
    size += chunk.byteLength
    if (size > maxRequestBytes) return
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return
  }
  if (value == null || typeof value != 'object' || Array.isArray(value)) return
  const body = value as Record<string, unknown>
  if (Object.keys(body).length != 2 || body.version !== 1 || typeof body.token != 'string' || body.token.length == 0) return
  return { token: body.token }
}

function json(status: number, body: unknown, headers?: Headers): Response {
  const source = JSON.stringify(body)
  const responseHeaders = noStore(headers)
  responseHeaders.set('content-length', String(encoder.encode(source).byteLength))
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  return new Response(source, { headers: responseHeaders, status })
}

function noStore(headers?: Headers): Headers {
  const values = new Headers(headers)
  values.set('cache-control', 'no-store')
  return values
}
