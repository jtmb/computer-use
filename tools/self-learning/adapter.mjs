const MAX_BYTES = 2 * 1024 * 1024

export function waitFor(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => {})
    return Promise.reject(signal.reason)
  }
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
    if (signal.aborted) abort()
  })
}

function safeEndpoint(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Self-learning requires a loopback-only service endpoint')
  return url.origin
}

export function boundedFetch(baseUrl, underlyingFetch = fetch) {
  const origin = safeEndpoint(baseUrl)
  return async (input, init = {}) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input))
    if (requestUrl.origin !== origin) throw new Error('Refusing a request outside the discovered service')
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined)
    signal?.throwIfAborted()
    const response = await waitFor(underlyingFetch(input, { ...init, redirect: 'error' }), signal)
    if (!response.body) return response
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    let complete = false
    try {
      while (true) {
        const { done, value } = await waitFor(reader.read(), signal)
        if (done) { complete = true; break }
        total += value.byteLength
        if (total > MAX_BYTES) {
          throw new Error('Service response exceeds self-learning byte limit')
        }
        chunks.push(value)
      }
    } finally {
      if (!complete) void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    return new Response(new Blob(chunks), { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}

function sameSession(a, b) {
  return a && b && a.id === b.id && a.projectID === b.projectID && a.location?.directory === b.location?.directory
}

export function messageReader({ service, clientFactory, hostSession, hostPid, hostVersion, fetchImpl = fetch }) {
  let discovery
  async function invoke(input, options, operation) {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
    signal.throwIfAborted()
    if (!discovery) {
      const pending = Promise.resolve(service.discover({ version: hostVersion }))
      discovery = pending
      pending.then(() => { if (discovery === pending) discovery = undefined }, () => { if (discovery === pending) discovery = undefined })
    }
    const endpoint = await waitFor(discovery, signal)
    signal.throwIfAborted()
    if (!endpoint) throw new Error('No healthy registered OpenCode service; no service was started')
    const origin = safeEndpoint(endpoint.url)
    const client = clientFactory({ baseUrl: origin, headers: service.headers(endpoint), fetch: boundedFetch(origin, fetchImpl) })
    const info = await waitFor(client.server.info({ signal }), signal)
    if (info.pid !== hostPid || info.version !== hostVersion) throw new Error('Registered service is not the plugin host process')
    const [host, remote] = await waitFor(Promise.all([
      hostSession.get({ sessionID: input.sessionID }, { signal }),
      client.session.get({ sessionID: input.sessionID }, { signal }),
    ]), signal)
    if (!sameSession(host, remote) || host.id !== input.sessionID) throw new Error('Session identity differs between plugin and discovered service')
    signal.throwIfAborted()
    return waitFor(operation(client, input, signal), signal)
  }
  return {
    list: (input, options = {}) => invoke(input, options, (client, value, signal) => client.message.list(value, { signal })),
    get: (input, options = {}) => invoke(input, options, (client, value, signal) => client.session.message.get(value, { signal })),
    listSessions: (input, callerSessionID, options = {}) => invoke({ sessionID: callerSessionID }, options, (client, _value, signal) => client.session.list(input, { signal })),
  }
}

export function sessionAccess(hostSession, message, callerSessionID) {
  return {
    get: (request, options) => hostSession.get(request, options),
    list: (request, options) => message.listSessions(request, callerSessionID, options),
  }
}
