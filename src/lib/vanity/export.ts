import type { VanityResult } from './types'

export function exportToCSV(results: VanityResult[]) {
  const headers = ['Address', 'PrivateKey', 'CreatedAt']
  const rows = results.map(r => [r.address, r.privateKey, new Date(r.createdAt).toISOString()])

  const lines = [headers.join(',')]
  rows.forEach(row => lines.push(row.join(',')))
  const csvContent = lines.join('\n')

  downloadFile(csvContent, 'vanity-addresses.csv', 'text/csv')
}

export function exportToJSON(results: VanityResult[]) {
  const jsonContent = JSON.stringify(results, null, 2)
  downloadFile(jsonContent, 'vanity-addresses.json', 'application/json')
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
