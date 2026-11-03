export type ModelRef = {
  providerID: string
  modelID: string
  variant?: string
}

type JsonRecord = Record<string, unknown>

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function modelKey(model: ModelRef): string {
  return `${model.providerID}/${model.modelID}`
}

export function modelLabel(model: ModelRef): string {
  return `${modelKey(model)}${model.variant ? `#${model.variant}` : ""}`
}

export function parseModelKey(value: unknown): ModelRef | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 320 || value.trim() !== value) {
    return undefined
  }
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return undefined

  const separator = value.indexOf("/")
  if (separator <= 0 || separator === value.length - 1) return undefined
  const providerID = value.slice(0, separator)
  const modelAndVariant = value.slice(separator + 1)
  const variantSeparator = modelAndVariant.indexOf("#")
  const modelID = variantSeparator < 0 ? modelAndVariant : modelAndVariant.slice(0, variantSeparator)
  const variant = variantSeparator < 0 ? undefined : modelAndVariant.slice(variantSeparator + 1)

  if (!providerID || !modelID || providerID.includes("#") || modelID.includes("#")) return undefined
  if (modelID.split("/").some((part) => part.length === 0)) return undefined
  if (variantSeparator >= 0 && (!variant || variant.includes("#"))) return undefined
  if (providerID.length > 80 || modelID.length > 200 || (variant?.length ?? 0) > 80) return undefined

  return variant ? { providerID, modelID, variant } : { providerID, modelID }
}

export function sameModel(left: ModelRef | undefined, right: ModelRef | undefined): boolean {
  return !!left && !!right && modelLabel(left) === modelLabel(right)
}
