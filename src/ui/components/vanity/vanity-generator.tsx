'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { exportToCSV, exportToJSON } from '@/lib/vanity/export'
import type { VanityConfig, VanityResult, WorkerResponse } from '@/lib/vanity/types'
import { Button } from '@/ui/shadcn/button'
import { Input } from '@/ui/shadcn/input'

// Validation Schema
const hexRegex = /^[0-9a-fA-F]*$/
const hexListRegex = /^[0-9a-fA-F,\s]*$/

const configSchema = z
  .object({
    count: z.number().int().min(1).max(100, 'Max count is 100 to prevent browser freeze'),
    startsWith: z
      .string()
      .regex(hexRegex, 'Must be hex characters (0-9, a-f)')
      .max(40, 'Max length is 40'),
    endsWith: z
      .string()
      .regex(hexRegex, 'Must be hex characters (0-9, a-f)')
      .max(40, 'Max length is 40'),
    prefixSuffixMode: z.enum(['and', 'or']),
    includes: z.string().regex(hexListRegex, 'Must be hex characters separated by comma/space'),
    caseSensitive: z.boolean(),
    includesMode: z.enum(['all', 'any']),
  })
  .refine(
    data => {
      return data.startsWith.length + data.endsWith.length <= 40
    },
    {
      message: 'Total length of prefix and suffix must be <= 40',
      path: ['startsWith'], // Show error on startsWith
    },
  )

const getValidationErrors = (cfg: VanityConfig) => {
  const result = configSchema.safeParse(cfg)
  const newErrors: Record<string, string> = {}

  if (!result.success) {
    result.error.issues.forEach(err => {
      if (err.path[0] !== undefined) {
        newErrors[err.path[0] as string] = err.message
      }
    })
  }

  // Custom check for includes token length
  if (cfg.includes !== '') {
    const tokens = cfg.includes.split(/[, ]+/).filter(Boolean)
    if (tokens.some(t => t.length > 40)) {
      newErrors['includes'] = 'Each include token must be <= 40 chars'
    }
  }

  return newErrors
}

export function VanityGenerator() {
  // State
  const [config, setConfig] = useState<VanityConfig>({
    count: 1,
    startsWith: '',
    endsWith: '',
    prefixSuffixMode: 'and',
    includes: '',
    caseSensitive: false,
    includesMode: 'all',
  })

  const errors = useMemo(() => getValidationErrors(config), [config])

  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<VanityResult[]>([])
  const [attempts, setAttempts] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [speed, setSpeed] = useState(0)
  const [exportConfirmed, setExportConfirmed] = useState(false)

  const workerRef = useRef<Worker | null>(null)
  const configRef = useRef(config)

  useEffect(() => {
    configRef.current = config
  }, [config])

  const normalizeInput = (val: string) => {
    return val.trim().replace(/^0x/i, '')
  }

  const handleInputChange = (field: keyof VanityConfig, value: string | number | boolean) => {
    let newValue = value
    if ((field === 'startsWith' || field === 'endsWith') && typeof value === 'string') {
      newValue = normalizeInput(value)
    }
    setConfig(prev => ({ ...prev, [field]: newValue }))
  }

  const stop = useCallback(() => {
    setIsRunning(false)
    workerRef.current?.postMessage({ type: 'stop' })
  }, [])

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('@/workers/vanity.worker.ts', import.meta.url))

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { type, result, attempts: workerAttempts } = e.data

      if (type === 'found' && result !== undefined) {
        setResults(prev => {
          const newResults = [...prev, result]
          if (newResults.length >= configRef.current.count) {
            // Stop worker immediately
            workerRef.current?.postMessage({ type: 'stop' })
            setIsRunning(false)
            toast.success(`Generated ${newResults.length} addresses!`)
          }
          return newResults
        })
      } else if (type === 'progress' && workerAttempts !== undefined) {
        setAttempts(prev => prev + workerAttempts)
      }
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  // Speed calculation
  useEffect(() => {
    if (!isRunning || startTime == null) return

    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = (now - startTime) / 1000
      if (elapsed > 0) {
        setSpeed(Math.floor(attempts / elapsed))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, startTime, attempts])

  const start = () => {
    if (isRunning) return

    if (Object.keys(errors).length > 0) {
      toast.error('Please fix validation errors')
      return
    }

    if (config.startsWith === '' && config.endsWith === '' && config.includes === '') {
      // Optional: allow random generation if user wants?
    }

    setResults([])
    setAttempts(0)
    setStartTime(Date.now())
    setSpeed(0)
    setIsRunning(true)

    workerRef.current?.postMessage({
      type: 'start',
      config,
    })
  }

  const reset = () => {
    stop()
    setResults([])
    setAttempts(0)
    setSpeed(0)
    setStartTime(null)
    setConfig({
      count: 1,
      startsWith: '',
      endsWith: '',
      prefixSuffixMode: 'and',
      includes: '',
      caseSensitive: false,
      includesMode: 'all',
    })
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  }

  let difficulty = 0
  if (config.prefixSuffixMode === 'and') {
    difficulty = Math.pow(16, config.startsWith.length + config.endsWith.length)
  } else {
    const pA = config.startsWith !== '' ? Math.pow(16, -config.startsWith.length) : 0
    const pB = config.endsWith !== '' ? Math.pow(16, -config.endsWith.length) : 0
    // If both empty, prob is 1 (always match empty string)
    if (config.startsWith === '' && config.endsWith === '') {
      difficulty = 1
    } else {
      // Assuming independent events (start and end overlap is negligible for small lengths, but technically exists)
      // For simplicity: P(A or B) approx P(A) + P(B) for disjoint, but here they are not disjoint.
      // Exact: P(A) + P(B) - P(A and B)
      const pBoth = Math.pow(16, -(config.startsWith.length + config.endsWith.length))
      const prob = pA + pB - pBoth
      difficulty = prob > 0 ? 1 / prob : 0
    }
  }

  return (
    <div className="space-y-8">
      {/* Config Form */}
      <div className="grid grid-cols-1 gap-6 rounded-lg border border-gray-200 p-6 md:grid-cols-2 dark:border-gray-800">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Count</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={config.count}
              onChange={e => {
                const val = parseInt(e.target.value)
                handleInputChange('count', isNaN(val) ? 0 : val)
              }}
              className={errors.count !== undefined ? 'border-red-500' : ''}
            />
            {errors.count !== undefined && <p className="text-xs text-red-500">{errors.count}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Starts With</label>
            <Input
              value={config.startsWith}
              onChange={e => handleInputChange('startsWith', e.target.value)}
              placeholder="e.g. dead"
              className={errors.startsWith !== undefined ? 'border-red-500' : ''}
            />
            {errors.startsWith !== undefined && (
              <p className="text-xs text-red-500">{errors.startsWith}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Ends With</label>
            <Input
              value={config.endsWith}
              onChange={e => handleInputChange('endsWith', e.target.value)}
              placeholder="e.g. beef"
              className={errors.endsWith !== undefined ? 'border-red-500' : ''}
            />
            {errors.endsWith !== undefined && (
              <p className="text-xs text-red-500">{errors.endsWith}</p>
            )}
          </div>
          {(config.startsWith !== '' || config.endsWith !== '') && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Estimated difficulty: 1 in {Math.round(difficulty).toLocaleString()}
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-xs" title="Logic between Starts With and Ends With">
                  Prefix/Suffix Logic:
                </label>
                <select
                  value={config.prefixSuffixMode}
                  onChange={e => handleInputChange('prefixSuffixMode', e.target.value)}
                  className="rounded border px-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="and">AND</option>
                  <option value="or">OR</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Includes (comma separated)</label>
            <Input
              value={config.includes}
              onChange={e => handleInputChange('includes', e.target.value)}
              placeholder="e.g. cafe, babe"
              className={errors.includes !== undefined ? 'border-red-500' : ''}
            />
            {errors.includes !== undefined && (
              <p className="text-xs text-red-500">{errors.includes}</p>
            )}
            {config.includes.split(/[, ]+/).filter(Boolean).length > 3 && (
              <p className="text-xs text-yellow-600">
                Too many include tokens may significantly slow down generation.
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 pt-8">
            <input
              type="checkbox"
              id="caseSensitive"
              checked={config.caseSensitive}
              onChange={e => handleInputChange('caseSensitive', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-900"
            />
            <label htmlFor="caseSensitive" className="text-sm">
              Case Sensitive
            </label>
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-sm">Includes Logic:</label>
            <select
              value={config.includesMode}
              onChange={e => handleInputChange('includesMode', e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="all">All (AND)</option>
              <option value="any">Any (OR)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex space-x-4">
        {!isRunning ? (
          <Button
            onClick={start}
            className="w-32"
            disabled={Object.keys(errors).length > 0 || config.count < 1}
          >
            Start
          </Button>
        ) : (
          <Button onClick={stop} variant="destructive" className="w-32">
            Stop
          </Button>
        )}
        <Button onClick={reset} variant="outline">
          Reset
        </Button>
      </div>

      {/* Progress */}
      <div className="grid grid-cols-3 gap-4 border-y border-gray-100 py-4 text-center dark:border-gray-800">
        <div>
          <div className="font-mono text-2xl">{attempts.toLocaleString()}</div>
          <div className="text-xs text-gray-500 uppercase dark:text-gray-400">Attempts</div>
        </div>
        <div>
          <div className="font-mono text-2xl">
            {results.length} / {config.count}
          </div>
          <div className="text-xs text-gray-500 uppercase dark:text-gray-400">Found</div>
        </div>
        <div>
          <div className="font-mono text-2xl">{speed.toLocaleString()}</div>
          <div className="text-xs text-gray-500 uppercase dark:text-gray-400">Attempts/Sec</div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <h3 className="text-lg font-medium">Results</h3>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="exportConfirm"
                  checked={exportConfirmed}
                  onChange={e => setExportConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-900"
                />
                <label htmlFor="exportConfirm" className="text-xs text-gray-600 dark:text-gray-400">
                  I understand private keys are sensitive and will not share them.
                </label>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!exportConfirmed}
                  onClick={() => exportToCSV(results)}
                >
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!exportConfirmed}
                  onClick={() => exportToJSON(results)}
                >
                  Export JSON
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">#</th>
                  <th className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                    Address
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                    Private Key
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {results.map((r, i) => (
                  <ResultRow key={i} index={i + 1} result={r} onCopy={copyToClipboard} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultRow({
  index,
  result,
  onCopy,
}: {
  index: number
  result: VanityResult
  onCopy: (t: string, l: string) => void
}) {
  const [revealed, setRevealed] = useState(false)

  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{index}</td>
      <td className="px-4 py-2 font-mono">{result.address}</td>
      <td className="px-4 py-2 font-mono">
        {revealed ? (
          <span className="text-red-600 dark:text-red-400">{result.privateKey}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">
            ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
          </span>
        )}
      </td>
      <td className="space-x-2 px-4 py-2 text-right">
        <button
          onClick={() => onCopy(result.address, 'Address')}
          className="text-xs hover:underline dark:text-gray-300"
        >
          Copy Addr
        </button>
        <button
          onClick={() => {
            if (!revealed) {
              if (confirm('Reveal private key? Ensure you are in a safe environment.')) {
                setRevealed(true)
              }
            } else {
              onCopy(result.privateKey, 'Private Key')
            }
          }}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          {revealed ? 'Copy PK' : 'Reveal'}
        </button>
      </td>
    </tr>
  )
}
