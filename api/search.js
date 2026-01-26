const isPrivateHost = (hostname) => {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local')) return true
  if (host === '127.0.0.1' || host === '::1') return true
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true
  const match172 = host.match(/^172\.(\d+)\.\d+\.\d+$/)
  if (match172) {
    const octet = Number(match172[1])
    if (octet >= 16 && octet <= 31) return true
  }
  if (host.startsWith('fc') || host.startsWith('fd')) return true
  if (host.startsWith('fe80')) return true
  return false
}

const normalizeSearchBaseUrl = (raw) => {
  const v = String(raw || '').trim()
  if (!v) return ''
  try {
    const url = new URL(v)
    url.hash = ''
    url.search = ''
    if (/\/search\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/search\/?$/, '')
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return v.replace(/\/search\/?$/, '').replace(/\/+$/, '')
  }
}

export default async function handler(req, res) {
  const query = String(req.query.q || '').trim()
  const format = String(req.query.format || 'json').trim()
  const baseRaw = req.query.base || 'https://search.brainstormnodes.org'
  const base = normalizeSearchBaseUrl(baseRaw)

  if (!query) {
    res.status(400).json({ error: 'Missing q parameter' })
    return
  }

  let targetUrl
  try {
    const parsed = new URL(`${base}/search`)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).json({ error: 'Invalid base URL protocol' })
      return
    }
    if (isPrivateHost(parsed.hostname)) {
      res.status(400).json({ error: 'Blocked base URL host' })
      return
    }
    parsed.searchParams.set('q', query)
    parsed.searchParams.set('format', format)
    targetUrl = parsed.toString()
  } catch {
    res.status(400).json({ error: 'Invalid base URL' })
    return
  }

  try {
    const response = await fetch(targetUrl, {
      headers: { 'accept': 'application/json' },
    })
    const body = await response.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    res.status(response.status).send(body)
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Search proxy failed' })
  }
}
