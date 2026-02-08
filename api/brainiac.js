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

const normalizeBaseUrl = (raw) => {
  const v = String(raw || '').trim()
  if (!v) return ''
  try {
    const url = new URL(v)
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return v.replace(/\/+$/, '')
  }
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-brainiac-key')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.status(204).end()
    return
  }

  const baseRaw = req.query.base || ''
  const endpointRaw = req.query.endpoint || '/responses'
  const base = normalizeBaseUrl(baseRaw)
  const endpoint = String(endpointRaw || '').trim() || '/responses'

  if (!base) {
    res.status(400).json({ error: 'Missing base parameter' })
    return
  }

  let targetUrl
  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).json({ error: 'Invalid base URL protocol' })
      return
    }
    if (isPrivateHost(parsed.hostname)) {
      res.status(400).json({ error: 'Blocked base URL host' })
      return
    }
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
    targetUrl = parsed.toString()
  } catch {
    res.status(400).json({ error: 'Invalid base URL' })
    return
  }

  try {
    // Prefer x-brainiac-key custom header (avoids infrastructure stripping Authorization)
    const customKey = req.headers['x-brainiac-key'] || ''
    const auth = customKey ? `Bearer ${customKey}` : (req.headers.authorization || '')
    const response = await fetch(targetUrl, {
      method: req.method || 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(auth ? { 'Authorization': auth } : {})
      },
      body: req.method === 'GET' ? undefined : JSON.stringify(req.body || {})
    })
    const body = await response.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    res.status(response.status).send(body)
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Brainiac proxy failed' })
  }
}
