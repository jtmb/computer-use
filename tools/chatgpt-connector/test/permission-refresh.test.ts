import assert from "node:assert/strict"
import test from "node:test"

import { createPermissionRefresher, MAX_REFRESH_ATTEMPTS, type PermissionCache } from "../src/permission-refresh.ts"

function cache(overrides: Partial<PermissionCache> = {}) {
  const refreshed: string[] = []
  let cached = true
  const value: PermissionCache = {
    hasCached: () => cached,
    refresh: async (sessionID) => { refreshed.push(sessionID) },
    ...overrides,
  }
  return { value, refreshed, hide: () => { cached = false } }
}

test("an interrupted session with a cached prompt is reconciled once", async () => {
  const fake = cache()
  const refresher = createPermissionRefresher(fake.value)
  await refresher.interrupted("ses_first1")
  assert.deepEqual(fake.refreshed, ["ses_first1"])
})

test("no cached prompt and concurrent calls do not trigger extra reads", async () => {
  const fake = cache()
  const refresher = createPermissionRefresher(fake.value)
  await refresher.interrupted("ses_clean1")
  assert.deepEqual(fake.refreshed, ["ses_clean1"])

  const hidden = cache()
  hidden.hide()
  await createPermissionRefresher(hidden.value).interrupted("ses_clean1")
  assert.deepEqual(hidden.refreshed, [])

  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  let refreshes = 0
  const slow = cache({ refresh: async () => { refreshes += 1; await pending } })
  const second = createPermissionRefresher(slow.value)
  const first = second.interrupted("ses_first1")
  await second.interrupted("ses_first1")
  release()
  await first
  assert.equal(refreshes, 1)
})

test("a prompt that arrives during the refresh is reconciled again", async () => {
  const fake = cache()
  const refresher = createPermissionRefresher(fake.value)
  const original = fake.value.refresh
  fake.value.refresh = async (sessionID) => {
    await original(sessionID)
    if (fake.refreshed.length === 1) refresher.asked(sessionID)
  }
  await refresher.interrupted("ses_first1")
  assert.deepEqual(fake.refreshed, ["ses_first1", "ses_first1"])
})

test("repeated races stop at the bounded attempt limit", async () => {
  const fake = cache()
  const refresher = createPermissionRefresher(fake.value)
  fake.value.refresh = async (sessionID) => {
    fake.refreshed.push(sessionID)
    refresher.asked(sessionID)
  }
  await refresher.interrupted("ses_first1")
  assert.equal(fake.refreshed.length, MAX_REFRESH_ATTEMPTS)
})

test("a failed refresh keeps the cache and allows a later retry", async () => {
  let fail = true
  const fake = cache({ refresh: async (sessionID) => {
    fake.refreshed.push(sessionID)
    if (fail) throw new Error("synthetic read failure")
  } })
  const refresher = createPermissionRefresher(fake.value)
  await refresher.interrupted("ses_first1")
  assert.deepEqual(fake.refreshed, ["ses_first1"])

  fail = false
  await refresher.interrupted("ses_first1")
  assert.deepEqual(fake.refreshed, ["ses_first1", "ses_first1"])
})
