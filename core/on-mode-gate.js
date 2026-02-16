function parseHostAllowlist(text) {
    const set = new Set()
    String(text || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .forEach((host) => set.add(host))
    return set
}

function createOnModeGate(options = {}) {
    const mode = options.mode || 'off'
    const allowlist = options.allowlist || new Set()
    const stats = {
        checked: 0,
        applied: 0,
        skippedByAllowlist: 0,
        skippedByMode: 0,
        invalidSource: 0,
    }

    return {
        shouldApply(source) {
            stats.checked += 1
            if (mode !== 'on') {
                stats.skippedByMode += 1
                return false
            }
            if (allowlist.size === 0) {
                stats.applied += 1
                return true
            }
            try {
                const host = new URL(source).hostname.toLowerCase()
                if (allowlist.has(host)) {
                    stats.applied += 1
                    return true
                }
                stats.skippedByAllowlist += 1
                return false
            } catch (_) {
                stats.invalidSource += 1
                return false
            }
        },
        getStats() {
            return { ...stats }
        },
        reset() {
            stats.checked = 0
            stats.applied = 0
            stats.skippedByAllowlist = 0
            stats.skippedByMode = 0
            stats.invalidSource = 0
        },
    }
}

module.exports = {
    parseHostAllowlist,
    createOnModeGate,
}

