export const CREDIT_UNITS = {
  renderLive: 1,
  renderCached: 1,
  summarizeLive: 2,
  summarizeCached: 1,
} as const

export const CREDIT_TO_TOKEN_RATIO = 0.001

export function normalizeCreditUnits(raw: unknown, fallback = 1): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Number(value.toFixed(3))
}

export function selectRenderCredits(cacheHit: boolean): number {
  return cacheHit ? CREDIT_UNITS.renderCached : CREDIT_UNITS.renderLive
}

export function selectSummarizeCredits(cacheHit: boolean): number {
  return cacheHit ? CREDIT_UNITS.summarizeCached : CREDIT_UNITS.summarizeLive
}
