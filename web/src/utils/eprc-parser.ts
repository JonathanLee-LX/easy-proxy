import type { RuleItem } from '@/types'

const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/
const URL_PATTERN = /^https?:\/\//

/**
 * Parse EPRC format text into RuleItem array
 * @param text - EPRC format text (one rule per line)
 * @returns Array of parsed rules
 */
export function parseEprcRules(text: string): RuleItem[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .flatMap((line) => {
      const trimmed = line.trim()
      
      // Skip comment lines (starting with #)
      if (trimmed.startsWith('#')) {
        return []
      }
      
      // Handle disabled rules (starting with //)
      let enabled = true
      if (trimmed.startsWith('//')) {
        enabled = false
        line = trimmed.slice(2).trim()
      } else {
        line = trimmed
      }
      
      const parts = line.split(/\s+/).filter(Boolean)
      if (parts.length < 2) return []

      const isTargetFirst = IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])
      if (isTargetFirst) {
        const [target, ...targetRules] = parts
        return targetRules.map((rule) => ({ rule, target, enabled }))
      }

      const target = parts[parts.length - 1]
      const targetRules = parts.slice(0, -1)
      return targetRules.map((rule) => ({ rule, target, enabled }))
    })
}

/**
 * Convert RuleItem array back to EPRC format text
 * @param rules - Array of rules to convert
 * @returns EPRC format text
 */
export function rulesToEprc(rules: RuleItem[]): string {
  return rules
    .map((r) => {
      const prefix = r.enabled ? '' : '//'
      return `${prefix}${r.rule} ${r.target}`
    })
    .join('\n')
}
