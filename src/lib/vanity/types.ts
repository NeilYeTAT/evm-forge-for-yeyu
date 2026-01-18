export interface VanityConfig {
  count: number
  startsWith: string
  endsWith: string
  prefixSuffixMode: 'and' | 'or'
  includes: string
  caseSensitive: boolean
  includesMode: 'all' | 'any'
}

export interface VanityResult {
  address: string
  privateKey: string
  createdAt: number
}

export interface WorkerMessage {
  type: 'start' | 'stop'
  config?: VanityConfig
}

export interface WorkerResponse {
  type: 'progress' | 'found' | 'finished'
  attempts?: number
  result?: VanityResult
}
