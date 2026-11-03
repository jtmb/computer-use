import { createServer } from "node:http"

export async function startBenchmarkFixture(scenario = "normal") {
  if (scenario !== "normal" && scenario !== "recoverable") {
    throw new TypeError("scenario must be normal or recoverable")
  }

  let activeScenario = scenario
  let requests = 0
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== `/${activeScenario}`) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      response.end("not found")
      return
    }

    requests += 1
    if (activeScenario === "recoverable" && requests === 1) {
      request.socket.destroy()
      return
    }

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    })
    response.end(
      `<!doctype html><html lang="en"><head><title>Synthetic ${activeScenario} fixture</title></head>` +
      `<body><main><h1>Benchmark ${activeScenario} fixture</h1><p>Loopback-only synthetic content.</p></main></body></html>`,
    )
  })

  await new Promise((resolveListen, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolveListen()
    })
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    await new Promise((resolveClose) => server.close(resolveClose))
    throw new Error("synthetic benchmark fixture did not bind an ephemeral loopback port")
  }

  return {
    url: `http://127.0.0.1:${address.port}/${scenario}`,
    urlFor(value) {
      if (value !== "normal" && value !== "recoverable") throw new TypeError("scenario must be normal or recoverable")
      return `http://127.0.0.1:${address.port}/${value}`
    },
    setScenario(value) {
      if (value !== "normal" && value !== "recoverable") throw new TypeError("scenario must be normal or recoverable")
      activeScenario = value
      requests = 0
    },
    reset() { requests = 0 },
    close: () => new Promise((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose())
    }),
  }
}
