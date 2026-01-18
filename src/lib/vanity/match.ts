import type { VanityConfig } from './types'

export function matchAddress(address: string, config: VanityConfig): boolean {
  let targetAddress = address
  let startsWith = config.startsWith
  let endsWith = config.endsWith
  let includes = config.includes

  if (!config.caseSensitive) {
    targetAddress = targetAddress.toLowerCase()
    startsWith = startsWith.toLowerCase()
    endsWith = endsWith.toLowerCase()
    includes = includes.toLowerCase()
  }

  const cleanAddress = targetAddress.startsWith('0x') ? targetAddress.slice(2) : targetAddress

  // Handle startsWith and endsWith based on prefixSuffixMode
  const hasStart = startsWith !== ''
  const hasEnd = endsWith !== ''

  let startMatch = true
  let endMatch = true

  if (hasStart) {
    const cleanStart = startsWith.startsWith('0x') ? startsWith.slice(2) : startsWith
    if (!cleanAddress.startsWith(cleanStart)) startMatch = false
  }

  if (hasEnd) {
    const cleanEnd = endsWith.startsWith('0x') ? endsWith.slice(2) : endsWith
    if (!cleanAddress.endsWith(cleanEnd)) endMatch = false
  }

  if (config.prefixSuffixMode === 'or') {
    // If both are empty, it's a match (or should we require at least one?)
    // If one is set, we check that one.
    // If both are set, we check if EITHER matches.

    if (hasStart && hasEnd) {
      if (!startMatch && !endMatch) return false
    } else if (hasStart) {
      if (!startMatch) return false
    } else if (hasEnd) {
      if (!endMatch) return false
    }
  } else {
    // AND mode (default)
    if (hasStart && !startMatch) return false
    if (hasEnd && !endMatch) return false
  }

  // Handle includes
  if (includes !== '') {
    const keywords = includes.split(/[, ]+/).filter(Boolean)
    if (keywords.length > 0) {
      if (config.includesMode === 'any') {
        if (!keywords.some(k => cleanAddress.includes(k))) return false
      } else {
        // all
        if (!keywords.every(k => cleanAddress.includes(k))) return false
      }
    }
  }

  return true
}
