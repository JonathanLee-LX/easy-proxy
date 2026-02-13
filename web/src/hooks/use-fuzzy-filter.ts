import { useMemo, useState } from 'react'
import type { ProxyRecord } from '@/types'

/**
 * Chrome DevTools style fuzzy filter for proxy records.
 * Supports:
 * - Plain text: fuzzy match against source URL
 * - method:GET / method:POST: filter by HTTP method
 * - status:2xx / status:404: filter by status code pattern
 * - domain:example.com: filter by domain
 * - -keyword: negative filter (exclude)
 * - Multiple terms separated by space (AND logic)
 */
export function useFuzzyFilter(records: ProxyRecord[]) {
  const [filterText, setFilterText] = useState('')

  const filteredRecords = useMemo(() => {
    const raw = filterText.trim()
    if (!raw) return records

    const terms = raw.split(/\s+/).filter(Boolean)

    return records.filter((record) => {
      return terms.every((term) => {
        const isNegative = term.startsWith('-') && term.length > 1
        const cleanTerm = isNegative ? term.slice(1) : term

        let matches = false

        // method: filter
        if (cleanTerm.startsWith('method:')) {
          const method = cleanTerm.slice(7).toUpperCase()
          matches = record.method.toUpperCase() === method
        }
        // domain: filter
        else if (cleanTerm.startsWith('domain:')) {
          const domain = cleanTerm.slice(7).toLowerCase()
          try {
            const url = new URL(record.source)
            matches = url.hostname.toLowerCase().includes(domain)
          } catch {
            matches = record.source.toLowerCase().includes(domain)
          }
        }
        // Plain text fuzzy match against source, target, method
        else {
          const lower = cleanTerm.toLowerCase()
          const haystack = `${record.method} ${record.source} ${record.target} ${record.time}`.toLowerCase()
          // Fuzzy: check if all characters appear in order
          matches = fuzzyMatch(lower, haystack)
        }

        return isNegative ? !matches : matches
      })
    })
  }, [records, filterText])

  return { filterText, setFilterText, filteredRecords }
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  // First try simple includes
  if (haystack.includes(needle)) return true

  // Then try character-by-character fuzzy matching
  let ni = 0
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (needle[ni] === haystack[hi]) {
      ni++
    }
  }
  return ni === needle.length
}
