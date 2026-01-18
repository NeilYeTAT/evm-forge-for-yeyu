import type { VanityConfig, WorkerMessage } from '../lib/vanity/types'

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { matchAddress } from '../lib/vanity/match'

let isRunning = false
let currentConfig: VanityConfig | null = null

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, config } = e.data

  if (type === 'start' && config !== undefined) {
    if (!isRunning) {
      isRunning = true
      currentConfig = config
      workLoop()
    }
  } else if (type === 'stop') {
    isRunning = false
    currentConfig = null
  }
}

function workLoop() {
  if (!isRunning || currentConfig == null) return

  const batchSize = 500
  let attempts = 0

  for (let i = 0; i < batchSize; i++) {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const address = account.address

    if (matchAddress(address, currentConfig)) {
      self.postMessage({
        type: 'found',
        result: {
          address,
          privateKey,
          createdAt: Date.now(),
        },
      })
    }
    attempts++
  }

  self.postMessage({
    type: 'progress',
    attempts,
  })

  if (isRunning) {
    setTimeout(workLoop, 0)
  }
}
