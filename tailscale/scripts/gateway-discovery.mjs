export function serverIdentity(info) {
  if (!info || !Number.isSafeInteger(info.pid) || info.pid < 1 || typeof info.version !== "string"
    || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(info.version)
    || Number.parseInt(info.version.split(".")[0], 10) < 2 || !Array.isArray(info.urls) || info.urls.length !== 1) {
    throw new Error("OpenCode instance identity is missing or ambiguous.")
  }
  let url
  try { url = new URL(info.urls[0]) } catch { throw new Error("OpenCode advertised an invalid endpoint.") }
  // The CLI reports the actual ephemeral listener; an implicit (:80) or zero port
  // cannot identify the OpenCode service and must not become a proxy target.
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.port === "0"
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Only the existing local IPv4 loopback OpenCode service can be served.")
  }
  return { pid: info.pid, version: info.version, target: url.origin }
}

export function sameServer(left, right) {
  return left.pid === right.pid && left.version === right.version && left.target === right.target
}

export async function discoverExistingServer(connected, sessionID, native) {
  const expected = serverIdentity(connected)
  const address = (await native(["service", "status"])).trim()
  let actual
  try { actual = serverIdentity(JSON.parse(await native(["api", "get", "/api/info"]))) }
  catch { throw new Error("Cannot verify the existing local OpenCode instance through its native API.") }
  if (!sameServer(expected, actual) || address !== actual.target && address !== `${actual.target}/`) {
    throw new Error("The connected OpenCode instance does not match the local service; nothing was started.")
  }
  if (sessionID !== undefined) {
    if (typeof sessionID !== "string" || !/^ses_[a-zA-Z0-9_-]{1,120}$/.test(sessionID)) {
      throw new Error("The selected session ID is invalid.")
    }
    let response
    try { response = JSON.parse(await native(["api", "get", `/api/session/${sessionID}`])) }
    catch { throw new Error("Cannot verify this chat on the existing local OpenCode instance.") }
    if (response?.data?.id !== sessionID) throw new Error("The existing local instance did not confirm the selected chat.")
  }
  return { ...actual, sessionID }
}
