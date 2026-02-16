function normalizeShortResponse(response) {
    const res = response || {}
    return {
        statusCode: res.statusCode || 200,
        headers: res.headers || {},
        body: res.body || '',
    }
}

function sendShortResponse(res, response) {
    const normalized = normalizeShortResponse(response)
    res.writeHead(normalized.statusCode, normalized.headers)
    res.end(normalized.body)
}

module.exports = {
    normalizeShortResponse,
    sendShortResponse,
}

