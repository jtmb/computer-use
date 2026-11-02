// Shared target language for the grader and the validator: `*` stays inside one
// path segment, `**` spans segments. Contradiction checks must agree with
// matching, or the validator accepts a rule pair that no trace can satisfy.

export function globToRegExp(glob) {
  let source = "^"
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === "*") {
      if (glob[index + 1] === "*") {
        source += ".*"
        index += 1
      } else {
        source += "[^/]*"
      }
    } else if (/[\\^$.*+?()[\]{}|]/.test(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
  }
  return new RegExp(`${source}$`)
}

const targetOf = (rule) => {
  if (rule.target !== undefined) return { kind: "exact", value: rule.target }
  if (rule.targetGlob !== undefined) return { kind: "glob", value: rule.targetGlob }
  return { kind: "any", value: null }
}

// A character absent from both globs stands in for every other symbol, so the
// product search below stays finite without enumerating an unbounded alphabet.
const OTHER_CHAR = "\u0000"

function epsilonClosure(glob, states) {
  const closed = new Set()
  const pending = [...states]
  while (pending.length > 0) {
    const index = pending.pop()
    if (closed.has(index)) continue
    closed.add(index)
    if (index >= glob.length) continue
    if (glob[index] === "*" && glob[index + 1] === "*") pending.push(index + 2)
    else if (glob[index] === "*") pending.push(index + 1)
  }
  return closed
}

function consume(glob, index, char, into) {
  if (index >= glob.length) return
  if (glob[index] === "*" && glob[index + 1] === "*") into.add(index)
  else if (glob[index] === "*") {
    if (char !== "/") into.add(index)
  } else if (glob[index] === char) into.add(index + 1)
}

export function globsIntersect(left, right) {
  const alphabet = new Set(["/", OTHER_CHAR])
  for (const glob of [left, right]) {
    for (const char of glob) if (char !== "*") alphabet.add(char)
  }
  const symbols = [...alphabet]
  const pending = [{ left: epsilonClosure(left, [0]), right: epsilonClosure(right, [0]) }]
  const visited = new Set()

  while (pending.length > 0) {
    const state = pending.shift()
    if (state.left.has(left.length) && state.right.has(right.length)) return true
    const key = `${[...state.left].sort((a, b) => a - b).join(".")}/${[...state.right].sort((a, b) => a - b).join(".")}`
    if (visited.has(key)) continue
    visited.add(key)

    for (const symbol of symbols) {
      const nextLeft = new Set()
      for (const index of state.left) consume(left, index, symbol, nextLeft)
      if (nextLeft.size === 0) continue
      const nextRight = new Set()
      for (const index of state.right) consume(right, index, symbol, nextRight)
      if (nextRight.size === 0) continue
      pending.push({ left: epsilonClosure(left, nextLeft), right: epsilonClosure(right, nextRight) })
    }
  }
  return false
}

// Two rules conflict when one recorded action could satisfy both: same effect,
// compatible recording surface, and intersecting target sets.
export function targetSetsOverlap(leftRule, rightRule) {
  if (leftRule.effect !== rightRule.effect) return false
  if (leftRule.source && rightRule.source && leftRule.source !== rightRule.source) return false
  const left = targetOf(leftRule)
  const right = targetOf(rightRule)
  if (left.kind === "any" || right.kind === "any") return true
  if (left.kind === "exact" && right.kind === "exact") return left.value === right.value
  if (left.kind === "exact") return globToRegExp(right.value).test(left.value)
  if (right.kind === "exact") return globToRegExp(left.value).test(right.value)
  if (left.value === right.value) return true
  return globsIntersect(left.value, right.value)
}
