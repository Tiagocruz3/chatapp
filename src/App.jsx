import { useState, useRef, useEffect, useMemo, useCallback, startTransition, memo, forwardRef, useImperativeHandle } from 'react'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import { AuthGate } from './components/AuthGate'
import * as pdfjsLib from 'pdfjs-dist/build/pdf'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth/mammoth.browser'
import { WebContainer } from '@webcontainer/api'

// pdf.js worker config (Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// Language display names
const languageNames = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'React JSX',
  tsx: 'React TSX',
  py: 'Python',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  rb: 'Ruby',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  md: 'Markdown',
  markdown: 'Markdown',
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  zsh: 'Zsh',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  graphql: 'GraphQL',
  vue: 'Vue',
  svelte: 'Svelte',
}

const CODE_NL_SENTINEL = '__CODE_NL__'
const ADMIN_EMAIL = 'tiagocruz3@gmail.com'

const escapeHtmlAttr = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeHtmlText = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const decodeBasicEntities = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const stripMarkdown = (input) => {
  const text = String(input || '')
  if (!text) return ''
  let out = text
    // Code blocks
    .replace(/```[\s\S]*?\n([\s\S]*?)```/g, (_, code) => code.trim())
    // Inline code
    .replace(/`([^`]+)`/g, '$1')
    // Images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Headings
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Blockquotes
    .replace(/^>\s?/gm, '')
    // List markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // HTML tags (in case content already has HTML)
    .replace(/<[^>]+>/g, '')

  return out.trim()
}

const normalizeAssistantResult = (result) => {
  if (typeof result === 'string') {
    return { text: result, usage: null }
  }
  if (result && typeof result === 'object') {
    const text = typeof result.text === 'string'
      ? result.text
      : typeof result.content === 'string'
        ? result.content
        : ''
    return { text, usage: result.usage || null }
  }
  return { text: String(result ?? ''), usage: null }
}

const normalizeTokenUsage = (usage) => {
  if (!usage || typeof usage !== 'object') return { inputTokens: 0, outputTokens: 0 }
  const inputTokens =
    usage.prompt_tokens ??
    usage.input_tokens ??
    usage.inputTokens ??
    usage.promptTokens ??
    0
  const outputTokens =
    usage.completion_tokens ??
    usage.output_tokens ??
    usage.outputTokens ??
    usage.completionTokens ??
    0
  return {
    inputTokens: Number(inputTokens || 0),
    outputTokens: Number(outputTokens || 0),
  }
}

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const getDomainFromUrl = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const buildSearchResultsHtml = ({ query = '', results = [] }) => {
  const safeQuery = escapeHtmlText(query || '')
  const normalizedResults = (Array.isArray(results) ? results : [])
    .filter((r) => r && (r.url || r.link))
    .slice(0, 6)
    .map((r) => {
      const url = String(r.url || r.link || '').trim()
      const title = String(r.title || r.name || url)
      const snippet = String(r.snippet || r.content || r.description || '')
      const image =
        r.image || r.thumbnail || r.image_url || r.img || r.thumbnail_url || ''
      const domain = getDomainFromUrl(url)
      const favicon = domain
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
        : ''
      return {
        url,
        title,
        snippet,
        image,
        domain,
        favicon,
      }
    })

  const header = `
    <div class="search-results-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <span>Search results for <strong>${safeQuery || 'your query'}</strong></span>
      <span class="search-results-count">${normalizedResults.length} results</span>
    </div>
  `

  if (normalizedResults.length === 0) {
    return `
      <div class="search-results-container">
        ${header}
        <div class="search-no-results">No results found.</div>
      </div>
    `
  }

  const list = normalizedResults
    .map((r) => {
      const safeTitle = escapeHtmlText(r.title)
      const safeSnippet = escapeHtmlText(r.snippet)
      const safeUrl = escapeHtmlAttr(r.url)
      const safeDomain = escapeHtmlText(r.domain)
      const safeFavicon = escapeHtmlAttr(r.favicon)
      const safeImage = escapeHtmlAttr(r.image || '')
      const imageHtml = r.image
        ? `<div class="search-result-image"><img src="${safeImage}" alt="${safeTitle}" loading="lazy" /></div>`
        : ''
      const sourceHtml = r.domain
        ? `<div class="search-result-source">
             ${r.favicon ? `<img class="search-result-favicon" src="${safeFavicon}" alt="" loading="lazy" />` : ''}
             <span class="search-result-domain">${safeDomain}</span>
           </div>`
        : ''
      return `
        <a class="search-result-card" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
          ${imageHtml}
          <div class="search-result-content">
            ${sourceHtml}
            <h4 class="search-result-title">${safeTitle}</h4>
            ${safeSnippet ? `<p class="search-result-snippet">${safeSnippet}</p>` : ''}
          </div>
        </a>
      `
    })
    .join('')

  return `
    <div class="search-results-container">
      ${header}
      <div class="search-results-list">
        ${list}
      </div>
      <div class="search-results-more">Open a result to read more</div>
    </div>
  `
}

const buildSearchMessageHtml = (content) => {
  if (!content) return ''
  if (content.results && Array.isArray(content.results)) {
    return buildSearchResultsHtml({ query: content.query, results: content.results })
  }

  const rawHtml = String(content.html || '').trim()
  if (!rawHtml) {
    return buildSearchResultsHtml({ query: content.query, results: [] })
  }

  if (rawHtml.includes('search-results-container')) {
    return rawHtml
  }

  const parsed = safeJsonParse(rawHtml)
  if (parsed) {
    const results = parsed.results || parsed.data || (Array.isArray(parsed) ? parsed : [])
    if (Array.isArray(results)) {
      return buildSearchResultsHtml({ query: parsed.query || content.query, results })
    }
  }

  return `
    <div class="search-results-container">
      <div class="search-results-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Search results for <strong>${escapeHtmlText(content.query || 'your query')}</strong></span>
      </div>
      <div class="search-results-list">
        ${rawHtml}
      </div>
    </div>
  `
}

const safeBtoa = (str) => {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch {
    return ''
  }
}

const safeAtob = (str) => {
  try {
    return decodeURIComponent(escape(atob(str)))
  } catch {
    return ''
  }
}

const getKeywordRegexForLang = (lang) => {
  const l = (lang || '').toLowerCase()
  const js = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try',
    'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'await', 'static', 'get',
    'set', 'of',
  ]
  const py = [
    'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
    'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try',
    'while', 'with', 'yield',
  ]
  const json = ['true', 'false', 'null']

  if (['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript'].includes(l)) return js
  if (['py', 'python'].includes(l)) return py
  if (['json'].includes(l)) return json
  // Generic fallback: no keyword highlighting
  return []
}

const highlightCode = (code, lang) => {
  const l = (lang || '').toLowerCase()
  const keywords = getKeywordRegexForLang(l)
  const keywordAlt = keywords.length ? `\\b(?:${keywords.map(k => k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b` : null

  // NOTE: `code` is already HTML-escaped by `formatMarkdown` (we escape before replacements).
  // Keep regex order: strings first, then comments, then numbers, then keywords.
  const parts = []
  if (['py', 'python'].includes(l)) {
    parts.push(
      // strings (single/double, basic)
      `"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'`,
      // comments
      `#[^\\n]*`,
    )
  } else if (['json'].includes(l)) {
    parts.push(
      `"(?:\\\\.|[^"\\\\])*"`,
      `\\b\\d+(?:\\.\\d+)?\\b`,
    )
  } else if (['html', 'xml'].includes(l)) {
    // Very lightweight HTML highlighting (tags / attributes / strings)
    // We'll highlight tag names and attribute strings only.
    // Strings in attributes:
    parts.push(`"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'`)
    // Tags (already escaped, so tags appear as &lt;...&gt;)
    // We'll handle tags separately below.
  } else if (['css', 'scss'].includes(l)) {
    parts.push(
      `"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'`,
      `\\/\\*[\\s\\S]*?\\*\\/`,
    )
  } else {
    // JS-like default
    parts.push(
      // template / single / double strings
      '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\])*"|' + "'(?:\\\\.|[^'\\\\])*'",
      // comments
      `\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*`,
    )
  }

  // Numbers (common)
  parts.push(`\\b\\d+(?:\\.\\d+)?\\b`)
  // Keywords (per language)
  if (keywordAlt) parts.push(keywordAlt)

  const master = new RegExp(parts.join('|'), 'gm')

  let out = code.replace(master, (m) => {
    // Strings
    if (m.startsWith('"') || m.startsWith("'") || m.startsWith('`')) return `<span class="tok-string">${m}</span>`
    // Comments
    if (m.startsWith('/*') || m.startsWith('//') || m.startsWith('#')) return `<span class="tok-comment">${m}</span>`
    // Numbers
    if (/^\d/.test(m)) return `<span class="tok-number">${m}</span>`
    // Keywords
    if (keywordAlt && new RegExp(`^${keywordAlt}$`, 'i').test(m)) return `<span class="tok-keyword">${m}</span>`
    return m
  })

  // Extra lightweight HTML tag highlighting (since &lt;...&gt; is escaped)
  if (['html', 'xml'].includes(l)) {
    out = out
      .replace(/(&lt;\/?)([a-zA-Z][\w:-]*)([^&]*?)(\/?&gt;)/g, (match, open, tag, rest, close) => {
        const tagHtml = `${open}<span class="tok-tag">${tag}</span>${rest}${close}`
        return tagHtml
      })
      .replace(/(\s)([a-zA-Z_:][\w:.-]*)(=)/g, (match, sp, attr, eq) => `${sp}<span class="tok-attr">${attr}</span>${eq}`)
  }

  return out
}

// Simple markdown parser for formatting responses
const formatMarkdown = (text) => {
  if (!text || typeof text !== 'string') return text
  
  // Check if content contains search results HTML - preserve them (don't escape)
  let searchResultsHtml = ''
  let remainingText = text
  // Try marker-based match first, then fall back to structure-based match
  const markerMatch = text.match(/<div class="search-results-container">[\s\S]*?<!--\/SEARCH_RESULTS-->/)
  const structureMatch = !markerMatch && text.match(/<div class="search-results-container">[\s\S]*?<\/div>\s*<\/div>\s*(?=\n|$)/)
  const searchResultsMatch = markerMatch || structureMatch
  if (searchResultsMatch) {
    searchResultsHtml = searchResultsMatch[0].replace('<!--/SEARCH_RESULTS-->', '')
    remainingText = text.replace(searchResultsMatch[0], '')
  }
  
  let html = remainingText
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks with language + optional filename (syntax: ```lang:filename.js)
    // If filename is provided, render as a file card; otherwise render as code block
    // IMPORTANT: return HTML WITHOUT any newline characters, because later we convert '\n' -> '<br/>'
    // and we don't want <br/> inserted inside the code block UI.
    .replace(/```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g, (match, lang, filename, code) => {
      const language = lang || ''
      const displayName = language ? (languageNames[language.toLowerCase()] || language) : 'code'
      const raw = decodeBasicEntities(code.trim())
      const rawB64 = safeBtoa(raw)
      const lineCount = raw.split('\n').length

      // If filename provided, render as compact file link (code will be auto-added to editor)
      if (filename && filename.trim()) {
        const safeFilename = escapeHtmlAttr(filename.trim())
        return `<div class="code-file-card" data-filename="${safeFilename}" data-lang="${escapeHtmlAttr(language)}" data-raw="${rawB64}"><div class="code-file-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="code-file-card-info"><span class="code-file-card-name">${safeFilename}</span><span class="code-file-card-meta">${lineCount} lines</span></div><div class="code-file-card-actions"><button class="code-file-open">Open</button><button class="code-file-copy">Copy</button></div></div>`
      }

      // No filename - render as normal code block
      const safeCode = highlightCode(code.trim(), language).replace(/\n/g, CODE_NL_SENTINEL)
      return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-block-lang">${escapeHtmlAttr(displayName)}</span><div class="code-block-actions"><button class="code-block-save" title="Save to Library"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button><button class="code-block-canvas" title="Add to Canvas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button><button class="code-block-copy" title="Copy code"><svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></button></div></div><pre><code data-lang="${escapeHtmlAttr(language)}" data-raw="${rawB64}">${safeCode}</code></pre></div>`
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bullet lists (handle - and •)
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Images (markdown)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="chat-image" loading="lazy" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, '</p><p>')
    // Single line breaks
    .replace(/\n/g, '<br/>')
  
  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/(<li>.*?<\/li>)(\s*<br\/>)?(\s*<li>)/g, '$1$3')
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
  // Clean up any duplicate <ul> tags
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  
  // Wrap in paragraph
  html = '<p>' + html + '</p>'
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/<p>\s*<br\/>\s*<\/p>/g, '')
  
  // Restore code newlines (kept safe from '\n' -> '<br/>' conversion)
  html = html.replace(new RegExp(CODE_NL_SENTINEL, 'g'), '\n')
  
  // Prepend search results if we had them
  if (searchResultsHtml) {
    html = searchResultsHtml + html
  }
  
  return html
}

// Knowledge Graph Component - Enhanced for large datasets with clustering, filtering, and search
function KnowledgeGraph({ memories = [], documents = [], isLoading }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragNode, setDragNode] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  
  // Enhanced features state
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('clustered') // 'clustered' | 'timeline' | 'radial'
  const [displayLimit, setDisplayLimit] = useState(50)
  const [typeFilters, setTypeFilters] = useState({
    memory: true, document: true, pdf: true, image: true,
    preference: true, personal_detail: true, project_context: true, fact: true
  })
  const [expandedClusters, setExpandedClusters] = useState({})
  const [showMinimap, setShowMinimap] = useState(true)

  // Node type colors and categories
  const nodeColors = {
    memory: { fill: '#10b981', stroke: '#059669', label: 'Memory', category: 'memories' },
    document: { fill: '#6366f1', stroke: '#4f46e5', label: 'Document', category: 'documents' },
    pdf: { fill: '#ef4444', stroke: '#dc2626', label: 'PDF', category: 'documents' },
    image: { fill: '#f59e0b', stroke: '#d97706', label: 'Image', category: 'documents' },
    preference: { fill: '#14b8a6', stroke: '#0d9488', label: 'Preference', category: 'memories' },
    personal_detail: { fill: '#ec4899', stroke: '#db2777', label: 'Personal', category: 'memories' },
    project_context: { fill: '#3b82f6', stroke: '#2563eb', label: 'Project', category: 'memories' },
    fact: { fill: '#8b5cf6', stroke: '#7c3aed', label: 'Fact', category: 'memories' },
  }

  // Cluster configuration
  const clusterConfig = {
    memories: { label: 'Memories', color: '#10b981', icon: 'brain' },
    documents: { label: 'Documents', color: '#6366f1', icon: 'file' },
    pdfs: { label: 'PDFs', color: '#ef4444', icon: 'pdf' },
    images: { label: 'Images', color: '#f59e0b', icon: 'image' }
  }

  // Detect document type from metadata or filename
  const getDocumentType = (doc) => {
    const filename = doc.title?.toLowerCase() || doc.metadata?.filename?.toLowerCase() || ''
    const mime = doc.metadata?.mime?.toLowerCase() || ''
    
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(filename)) {
      return 'image'
    }
    if (mime.includes('pdf') || filename.endsWith('.pdf')) {
      return 'pdf'
    }
    return 'document'
  }

  // Calculate cluster positions based on view mode
  const getClusterLayout = useCallback((totalNodes, dimensions) => {
    const centerX = dimensions.width / 2
    const centerY = dimensions.height / 2
    const maxRadius = Math.min(dimensions.width, dimensions.height) * 0.42

    if (viewMode === 'clustered') {
      // Arrange clusters in a circle around center
      return {
        memories: { x: centerX - maxRadius * 0.5, y: centerY - maxRadius * 0.3, radius: maxRadius * 0.35 },
        documents: { x: centerX + maxRadius * 0.5, y: centerY - maxRadius * 0.3, radius: maxRadius * 0.35 },
        pdfs: { x: centerX - maxRadius * 0.3, y: centerY + maxRadius * 0.4, radius: maxRadius * 0.25 },
        images: { x: centerX + maxRadius * 0.3, y: centerY + maxRadius * 0.4, radius: maxRadius * 0.25 }
      }
    } else if (viewMode === 'timeline') {
      // Horizontal timeline layout
      return {
        memories: { x: centerX * 0.5, y: centerY, radius: maxRadius * 0.3 },
        documents: { x: centerX * 1.0, y: centerY, radius: maxRadius * 0.3 },
        pdfs: { x: centerX * 1.3, y: centerY, radius: maxRadius * 0.25 },
        images: { x: centerX * 1.6, y: centerY, radius: maxRadius * 0.25 }
      }
    } else {
      // Radial layout - all around center
      return {
        memories: { x: centerX, y: centerY, radius: maxRadius * 0.3 },
        documents: { x: centerX, y: centerY, radius: maxRadius * 0.5 },
        pdfs: { x: centerX, y: centerY, radius: maxRadius * 0.7 },
        images: { x: centerX, y: centerY, radius: maxRadius * 0.85 }
      }
    }
  }, [viewMode])

  // Force-directed layout simulation with collision detection
  const applyForceLayout = useCallback((nodes, iterations = 50) => {
    const workingNodes = nodes.map(n => ({ ...n }))
    const minDistance = 50
    const repulsionStrength = 500
    const centerPull = 0.01

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < workingNodes.length; i++) {
        let fx = 0, fy = 0
        const node = workingNodes[i]

        // Repulsion from other nodes
        for (let j = 0; j < workingNodes.length; j++) {
          if (i === j) continue
          const other = workingNodes[j]
          const dx = node.x - other.x
          const dy = node.y - other.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          
          if (dist < minDistance * 2) {
            const force = repulsionStrength / (dist * dist)
            fx += (dx / dist) * force
            fy += (dy / dist) * force
          }
        }

        // Gentle pull toward cluster center
        if (node.clusterCenter) {
          const dx = node.clusterCenter.x - node.x
          const dy = node.clusterCenter.y - node.y
          fx += dx * centerPull
          fy += dy * centerPull
        }

        // Apply forces with damping
        const damping = 1 - (iter / iterations) * 0.5
        workingNodes[i].x += fx * damping
        workingNodes[i].y += fy * damping
      }
    }

    return workingNodes
  }, [])

  // Generate nodes and edges from memories and documents
  useEffect(() => {
    if (memories.length === 0 && documents.length === 0) {
      setNodes([])
      setEdges([])
      return
    }

    const clusterLayout = getClusterLayout(memories.length + documents.length, dimensions)
    const newNodes = []
    const newEdges = []

    // Filter and limit data
    const filteredMemories = memories
      .filter(mem => {
        const memType = mem.memory_type || 'memory'
        return typeFilters[memType] !== false
      })
      .filter(mem => {
        if (!searchQuery) return true
        return mem.content?.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .slice(0, displayLimit)

    const filteredDocuments = documents
      .filter(doc => {
        const docType = getDocumentType(doc)
        return typeFilters[docType] !== false
      })
      .filter(doc => {
        if (!searchQuery) return true
        return doc.title?.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .slice(0, displayLimit)

    // Group by type for clustering
    const memoryTypes = {}
    const documentTypes = { document: [], pdf: [], image: [] }

    // Process memories
    filteredMemories.forEach((mem, i) => {
      const nodeType = mem.memory_type || 'memory'
      if (!memoryTypes[nodeType]) memoryTypes[nodeType] = []
      memoryTypes[nodeType].push(mem)
    })

    // Process documents
    filteredDocuments.forEach((doc) => {
      const docType = getDocumentType(doc)
      documentTypes[docType].push(doc)
    })

    // Calculate dynamic node size based on total count
    const totalItems = filteredMemories.length + filteredDocuments.length
    const baseRadius = totalItems > 100 ? 12 : totalItems > 50 ? 16 : totalItems > 20 ? 20 : 24
    const spacing = totalItems > 100 ? 30 : totalItems > 50 ? 40 : 50

    // Layout memories within their cluster
    let memIndex = 0
    Object.entries(memoryTypes).forEach(([type, mems]) => {
      const cluster = clusterLayout.memories
      const subClusterAngleOffset = Object.keys(memoryTypes).indexOf(type) * (Math.PI / 4)
      
      mems.forEach((mem, i) => {
        const totalInType = mems.length
        const angle = subClusterAngleOffset + (i / Math.max(totalInType, 1)) * Math.PI * 0.5
        const radiusVariation = cluster.radius * (0.3 + (i % 3) * 0.25)
        
        newNodes.push({
          id: `mem-${mem.memory_id}`,
          type: type,
          label: mem.content?.substring(0, 25) + (mem.content?.length > 25 ? '...' : ''),
          fullContent: mem.content,
          x: cluster.x + Math.cos(angle) * radiusVariation,
          y: cluster.y + Math.sin(angle) * radiusVariation,
          radius: baseRadius,
          data: mem,
          confidence: mem.confidence || 0.5,
          created: new Date(mem.created_at),
          cluster: 'memories',
          clusterCenter: { x: cluster.x, y: cluster.y }
        })
        memIndex++
      })
    })

    // Layout documents within their clusters
    Object.entries(documentTypes).forEach(([docType, docs]) => {
      if (docs.length === 0) return
      
      const clusterKey = docType === 'pdf' ? 'pdfs' : docType === 'image' ? 'images' : 'documents'
      const cluster = clusterLayout[clusterKey]
      
      docs.forEach((doc, i) => {
        const totalInCluster = docs.length
        const spiralAngle = (i / Math.max(totalInCluster, 1)) * Math.PI * 2 * Math.ceil(totalInCluster / 8)
        const spiralRadius = cluster.radius * (0.2 + (i / totalInCluster) * 0.8)
        
        newNodes.push({
          id: `doc-${doc.document_id}`,
          type: docType,
          label: doc.title?.substring(0, 20) + (doc.title?.length > 20 ? '...' : '') || 'Untitled',
          fullContent: doc.title || 'Untitled document',
          x: cluster.x + Math.cos(spiralAngle) * spiralRadius,
          y: cluster.y + Math.sin(spiralAngle) * spiralRadius,
          radius: baseRadius + 2,
          data: doc,
          sourceType: doc.source_type,
          isEmbedded: doc.is_embedded || false,
          embeddedCount: doc.embedded_count || 0,
          created: new Date(doc.created_at),
          cluster: clusterKey,
          clusterCenter: { x: cluster.x, y: cluster.y }
        })
      })
    })

    // Apply force-directed layout for better spacing
    const layoutedNodes = applyForceLayout(newNodes, totalItems > 50 ? 30 : 50)

    // Create edges - limit connections for performance
    const maxEdgesPerNode = totalItems > 100 ? 2 : totalItems > 50 ? 3 : 5
    const nodeConnections = {}

    // Connect nodes within the same cluster (limited)
    const nodesByCluster = {}
    layoutedNodes.forEach(node => {
      if (!nodesByCluster[node.cluster]) nodesByCluster[node.cluster] = []
      nodesByCluster[node.cluster].push(node)
    })

    Object.values(nodesByCluster).forEach(clusterNodes => {
      for (let i = 0; i < clusterNodes.length && i < 20; i++) {
        const node = clusterNodes[i]
        nodeConnections[node.id] = nodeConnections[node.id] || 0
        
        // Connect to nearest neighbors
        const nearestCount = Math.min(maxEdgesPerNode, clusterNodes.length - 1)
        const sortedByDistance = clusterNodes
          .filter(n => n.id !== node.id)
          .map(n => ({
            node: n,
            dist: Math.sqrt((n.x - node.x) ** 2 + (n.y - node.y) ** 2)
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, nearestCount)

        sortedByDistance.forEach(({ node: nearNode }) => {
          const edgeId = `edge-${node.id}-${nearNode.id}`
          const reverseEdgeId = `edge-${nearNode.id}-${node.id}`
          
          if (!newEdges.find(e => e.id === edgeId || e.id === reverseEdgeId)) {
            if (nodeConnections[node.id] < maxEdgesPerNode && 
                (nodeConnections[nearNode.id] || 0) < maxEdgesPerNode) {
              newEdges.push({
                id: edgeId,
                source: node.id,
                target: nearNode.id,
                strength: 0.3,
                type: 'cluster'
              })
              nodeConnections[node.id]++
              nodeConnections[nearNode.id] = (nodeConnections[nearNode.id] || 0) + 1
            }
          }
        })
      }
    })

    setNodes(layoutedNodes)
    setEdges(newEdges)
  }, [memories, documents, dimensions, typeFilters, searchQuery, displayLimit, viewMode, getClusterLayout, applyForceLayout])

  // Handle container resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || 800,
          height: entry.contentRect.height || 500
        })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // Mouse handlers
  const handleMouseDown = (e, node) => {
    e.stopPropagation()
    setDragNode(node)
    setSelectedNode(node)
  }

  const handleBackgroundMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'svg') {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      })
      return
    }

    if (!dragNode || !svgRef.current) return
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const x = (e.clientX - rect.left - pan.x) / zoom
    const y = (e.clientY - rect.top - pan.y) / zoom
    
    setNodes(prevNodes => prevNodes.map(n => 
      n.id === dragNode.id ? { ...n, x, y } : n
    ))
  }

  const handleMouseUp = () => {
    setDragNode(null)
    setIsPanning(false)
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.2, Math.min(4, z * delta)))
  }

  const getNodeById = (id) => nodes.find(n => n.id === id)

  // Toggle filter
  const toggleFilter = (type) => {
    setTypeFilters(prev => ({ ...prev, [type]: !prev[type] }))
  }

  // Count items by type
  const typeCounts = useMemo(() => {
    const counts = { memory: 0, document: 0, pdf: 0, image: 0, preference: 0, personal_detail: 0, project_context: 0, fact: 0 }
    memories.forEach(m => {
      const type = m.memory_type || 'memory'
      counts[type] = (counts[type] || 0) + 1
    })
    documents.forEach(d => {
      const type = getDocumentType(d)
      counts[type] = (counts[type] || 0) + 1
    })
    return counts
  }, [memories, documents])

  // Calculate minimap viewport
  const minimapScale = 0.12
  const minimapViewport = useMemo(() => ({
    x: -pan.x / zoom * minimapScale,
    y: -pan.y / zoom * minimapScale,
    width: (dimensions.width / zoom) * minimapScale,
    height: (dimensions.height / zoom) * minimapScale
  }), [pan, zoom, dimensions])

  // Empty state
  if (memories.length === 0 && documents.length === 0 && !isLoading) {
    return (
      <div className="kb-panel">
        <div className="kb-panel-header">
          <div className="kb-panel-info">
            <h2>Knowledge Graph</h2>
            <p>Interactive visualization of your knowledge connections.</p>
          </div>
        </div>
        <div className="kb-empty-state">
          <div className="kb-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="6" cy="6" r="3"/>
              <circle cx="18" cy="18" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="6" r="3"/>
              <line x1="9" y1="6" x2="15" y2="6"/>
              <line x1="6" y1="9" x2="6" y2="15"/>
              <line x1="18" y1="9" x2="18" y2="15"/>
              <line x1="9" y1="18" x2="15" y2="18"/>
            </svg>
          </div>
          <h3>No knowledge yet</h3>
          <p>Chat with agents and upload documents to build your knowledge graph.</p>
        </div>
      </div>
    )
  }

  const totalItems = memories.length + documents.length
  const visibleItems = nodes.length

  return (
    <div className="kb-panel kb-graph-panel">
      {/* Enhanced Header with Search and Filters */}
      <div className="kb-graph-header">
        <div className="kb-graph-title-row">
          <div className="kb-panel-info">
            <h2>Knowledge Graph</h2>
            <p>{visibleItems} of {totalItems} items • Drag to pan, scroll to zoom</p>
          </div>
          <div className="kb-graph-controls">
            <button 
              className="kb-zoom-btn" 
              onClick={() => setZoom(z => Math.min(4, z * 1.3))}
              title="Zoom in"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button 
              className="kb-zoom-btn" 
              onClick={() => setZoom(z => Math.max(0.2, z * 0.7))}
              title="Zoom out"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button 
              className="kb-zoom-btn" 
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              title="Reset view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
            <button 
              className={`kb-zoom-btn ${showMinimap ? 'active' : ''}`}
              onClick={() => setShowMinimap(!showMinimap)}
              title="Toggle minimap"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <rect x="13" y="13" width="6" height="6" rx="1"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Search and View Controls */}
        <div className="kb-graph-toolbar">
          <div className="kb-graph-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="kb-search-clear" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>

          <div className="kb-graph-view-modes">
            <button 
              className={`kb-view-btn ${viewMode === 'clustered' ? 'active' : ''}`}
              onClick={() => setViewMode('clustered')}
              title="Clustered view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
              </svg>
            </button>
            <button 
              className={`kb-view-btn ${viewMode === 'radial' ? 'active' : ''}`}
              onClick={() => setViewMode('radial')}
              title="Radial view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <circle cx="12" cy="12" r="7" strokeDasharray="2 2"/>
                <circle cx="12" cy="12" r="10" strokeDasharray="2 2"/>
              </svg>
            </button>
            <button 
              className={`kb-view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
              title="Timeline view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>
              </svg>
            </button>
          </div>

          <div className="kb-graph-limit">
            <label>Show:</label>
            <select value={displayLimit} onChange={(e) => setDisplayLimit(Number(e.target.value))}>
              <option value={25}>25 items</option>
              <option value={50}>50 items</option>
              <option value={100}>100 items</option>
              <option value={200}>200 items</option>
              <option value={999999}>All items</option>
            </select>
          </div>
        </div>

        {/* Type Filters */}
        <div className="kb-graph-filters">
          {Object.entries(nodeColors).map(([type, config]) => {
            const count = typeCounts[type] || 0
            if (count === 0) return null
            return (
              <button
                key={type}
                className={`kb-filter-btn ${typeFilters[type] ? 'active' : 'inactive'}`}
                onClick={() => toggleFilter(type)}
                style={{ 
                  '--filter-color': config.fill,
                  borderColor: typeFilters[type] ? config.fill : 'transparent'
                }}
              >
                <span className="kb-filter-dot" style={{ background: config.fill }}></span>
                <span className="kb-filter-label">{config.label}</span>
                <span className="kb-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Graph Container */}
      <div className="kb-graph-container" ref={containerRef}>
        {isLoading ? (
          <div className="kb-loading">
            <div className="kb-loading-spinner"></div>
            <span>Building knowledge graph...</span>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              className="kb-graph-svg"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              onMouseDown={handleBackgroundMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            >
              <defs>
                <radialGradient id="depthGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
                {/* Cluster background gradients */}
                <radialGradient id="clusterBg-memories">
                  <stop offset="0%" stopColor="rgba(16,185,129,0.08)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                </radialGradient>
                <radialGradient id="clusterBg-documents">
                  <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
                  <stop offset="100%" stopColor="rgba(99,102,241,0)" />
                </radialGradient>
                <radialGradient id="clusterBg-pdfs">
                  <stop offset="0%" stopColor="rgba(239,68,68,0.08)" />
                  <stop offset="100%" stopColor="rgba(239,68,68,0)" />
                </radialGradient>
                <radialGradient id="clusterBg-images">
                  <stop offset="0%" stopColor="rgba(245,158,11,0.08)" />
                  <stop offset="100%" stopColor="rgba(245,158,11,0)" />
                </radialGradient>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Cluster backgrounds */}
                {viewMode === 'clustered' && (
                  <>
                    {Object.entries(getClusterLayout(nodes.length, dimensions)).map(([cluster, pos]) => (
                      <circle
                        key={`cluster-bg-${cluster}`}
                        cx={pos.x}
                        cy={pos.y}
                        r={pos.radius * 1.2}
                        fill={`url(#clusterBg-${cluster})`}
                        opacity={0.6}
                      />
                    ))}
                  </>
                )}

                {/* Edges */}
                {edges.map(edge => {
                  const source = getNodeById(edge.source)
                  const target = getNodeById(edge.target)
                  if (!source || !target) return null
                  
                  const isHighlighted = selectedNode && 
                    (selectedNode.id === edge.source || selectedNode.id === edge.target)
                  const isSearchMatch = searchQuery && (
                    source.fullContent?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    target.fullContent?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  
                  return (
                    <line
                      key={edge.id}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={isHighlighted ? '#10b981' : isSearchMatch ? '#6366f1' : 'rgba(255,255,255,0.08)'}
                      strokeWidth={isHighlighted ? 2 : 1}
                      opacity={isHighlighted ? 1 : 0.5}
                    />
                  )
                })}

                {/* Nodes */}
                {nodes.map(node => {
                  const color = nodeColors[node.type] || nodeColors.memory
                  const isSelected = selectedNode?.id === node.id
                  const isHovered = hoveredNode?.id === node.id
                  const isSearchMatch = searchQuery && node.fullContent?.toLowerCase().includes(searchQuery.toLowerCase())
                  const nodeScale = isSelected ? 1.3 : isHovered ? 1.15 : isSearchMatch ? 1.1 : 1
                  const nodeOpacity = searchQuery && !isSearchMatch ? 0.3 : 1

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y}) scale(${nodeScale})`}
                      onMouseDown={(e) => handleMouseDown(e, node)}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      style={{ cursor: dragNode ? 'grabbing' : 'pointer' }}
                      opacity={nodeOpacity}
                    >
                      {/* Highlight ring for search matches */}
                      {isSearchMatch && !isSelected && (
                        <circle
                          r={node.radius + 6}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2"
                          opacity="0.6"
                          strokeDasharray="4 2"
                        />
                      )}
                      {/* Selection glow */}
                      {isSelected && (
                        <circle
                          r={node.radius + 8}
                          fill="none"
                          stroke={color.fill}
                          strokeWidth="3"
                          opacity="0.4"
                        />
                      )}
                      {/* Node circle */}
                      <circle
                        r={node.radius}
                        fill={color.fill}
                        stroke={isSelected ? '#fff' : color.stroke}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        opacity={0.9}
                      />
                      {/* Node icon */}
                      {node.type === 'pdf' ? (
                        <text x="0" y="4" textAnchor="middle" fill="#fff" fontSize={node.radius * 0.6} fontWeight="bold">PDF</text>
                      ) : node.type === 'image' ? (
                        <g transform={`translate(${-node.radius * 0.4}, ${-node.radius * 0.4})`}>
                          <rect width={node.radius * 0.8} height={node.radius * 0.6} rx="1" fill="none" stroke="#fff" strokeWidth="1"/>
                          <circle cx={node.radius * 0.25} cy={node.radius * 0.2} r={node.radius * 0.1} fill="#fff"/>
                        </g>
                      ) : node.type === 'document' ? (
                        <g transform={`translate(${-node.radius * 0.35}, ${-node.radius * 0.45})`}>
                          <rect width={node.radius * 0.7} height={node.radius * 0.9} rx="1" fill="none" stroke="#fff" strokeWidth="1"/>
                          <line x1={node.radius * 0.15} y1={node.radius * 0.3} x2={node.radius * 0.55} y2={node.radius * 0.3} stroke="#fff" strokeWidth="1"/>
                          <line x1={node.radius * 0.15} y1={node.radius * 0.5} x2={node.radius * 0.55} y2={node.radius * 0.5} stroke="#fff" strokeWidth="1"/>
                        </g>
                      ) : (
                        <circle cx="0" cy="-2" r={node.radius * 0.25} fill="#fff" opacity="0.9"/>
                      )}
                      {/* Embedded badge */}
                      {node.isEmbedded && (
                        <g transform={`translate(${node.radius * 0.6}, ${-node.radius * 0.6})`}>
                          <circle r={node.radius * 0.35} fill="#10b981" stroke="#fff" strokeWidth="1"/>
                          <path d={`M${-node.radius * 0.12} 0l${node.radius * 0.08} ${node.radius * 0.08} ${node.radius * 0.15}-${node.radius * 0.15}`} fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                        </g>
                      )}
                    </g>
                  )
                })}

                {/* Cluster labels */}
                {viewMode === 'clustered' && Object.entries(getClusterLayout(nodes.length, dimensions)).map(([cluster, pos]) => {
                  const config = clusterConfig[cluster]
                  if (!config) return null
                  const clusterNodes = nodes.filter(n => n.cluster === cluster)
                  if (clusterNodes.length === 0) return null
                  
                  return (
                    <g key={`label-${cluster}`} transform={`translate(${pos.x}, ${pos.y - pos.radius - 15})`}>
                      <text
                        textAnchor="middle"
                        fill={config.color}
                        fontSize="13"
                        fontWeight="600"
                        opacity="0.9"
                      >
                        {config.label} ({clusterNodes.length})
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>

            {/* Minimap */}
            {showMinimap && nodes.length > 0 && (
              <div className="kb-graph-minimap">
                <svg viewBox={`0 0 ${dimensions.width * minimapScale} ${dimensions.height * minimapScale}`}>
                  {/* Minimap nodes */}
                  {nodes.map(node => (
                    <circle
                      key={`mini-${node.id}`}
                      cx={node.x * minimapScale}
                      cy={node.y * minimapScale}
                      r={2}
                      fill={nodeColors[node.type]?.fill || '#10b981'}
                      opacity={0.8}
                    />
                  ))}
                  {/* Viewport indicator */}
                  <rect
                    x={Math.max(0, minimapViewport.x)}
                    y={Math.max(0, minimapViewport.y)}
                    width={minimapViewport.width}
                    height={minimapViewport.height}
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                </svg>
              </div>
            )}
          </>
        )}

        {/* Tooltip */}
        {hoveredNode && !dragNode && !isPanning && (
          <div 
            className="kb-graph-tooltip"
            style={{
              left: Math.min(hoveredNode.x * zoom + pan.x + 30, dimensions.width - 250),
              top: Math.min(hoveredNode.y * zoom + pan.y - 20, dimensions.height - 100)
            }}
          >
            <div className="kb-tooltip-type" style={{ color: nodeColors[hoveredNode.type]?.fill }}>
              {nodeColors[hoveredNode.type]?.label || 'Node'}
            </div>
            <div className="kb-tooltip-content">{hoveredNode.fullContent}</div>
            {hoveredNode.confidence !== undefined && (
              <div className="kb-tooltip-meta">
                Confidence: {Math.round(hoveredNode.confidence * 100)}%
              </div>
            )}
            {hoveredNode.sourceType && (
              <div className="kb-tooltip-meta">Type: {hoveredNode.sourceType}</div>
            )}
            {hoveredNode.isEmbedded && (
              <div className="kb-tooltip-meta" style={{ color: '#10b981' }}>
                ✓ Embedded ({hoveredNode.embeddedCount} chunks)
              </div>
            )}
            {hoveredNode.created && (
              <div className="kb-tooltip-meta">
                Created: {hoveredNode.created.toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="kb-graph-stats-bar">
        <div className="kb-graph-stat">
          <span className="kb-stat-dot" style={{ background: nodeColors.memory.fill }}></span>
          {memories.length} Memories
        </div>
        <div className="kb-graph-stat">
          <span className="kb-stat-dot" style={{ background: nodeColors.document.fill }}></span>
          {documents.length} Documents
        </div>
        <div className="kb-graph-stat">
          <span className="kb-stat-dot" style={{ background: '#fff' }}></span>
          {edges.length} Connections
        </div>
        <div className="kb-graph-stat">
          <span className="kb-stat-dot" style={{ background: '#8b5cf6' }}></span>
          Zoom: {Math.round(zoom * 100)}%
        </div>
        {selectedNode && (
          <div className="kb-graph-selected">
            Selected: <strong>{selectedNode.label}</strong>
            <button onClick={() => setSelectedNode(null)} className="kb-deselect-btn">×</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Isolated textarea component for smooth typing - prevents parent re-renders during input
const ChatTextarea = memo(forwardRef(function ChatTextarea({ 
  externalValue, 
  onSubmit, 
  onHistoryNav,
  onValueChange,
  placeholder, 
  disabled,
  userMessages = []
}, ref) {
  const [localValue, setLocalValue] = useState('')
  const textareaRef = useRef(null)
  const historyIndexRef = useRef(-1)
  
  // Sync external value when it changes (e.g., cleared after submit, or history navigation)
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== localValue) {
      setLocalValue(externalValue)
    }
  }, [externalValue])
  
  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    clear: () => {
      setLocalValue('')
      historyIndexRef.current = -1
    },
    getValue: () => localValue,
    setValue: (val) => setLocalValue(val),
    focus: () => textareaRef.current?.focus()
  }), [localValue])
  
  // Auto-resize with requestAnimationFrame
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [localValue])
  
  const handleChange = useCallback((e) => {
    const nextValue = e.target.value
    setLocalValue(nextValue)
    onValueChange?.(nextValue)
  }, [onValueChange])
  
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (localValue.trim()) {
        onSubmit?.(localValue.trim())
        setLocalValue('')
        onValueChange?.('')
        historyIndexRef.current = -1
      }
      return
    }
    
    // History navigation
    if (e.key === 'ArrowUp' && userMessages.length > 0) {
      const textarea = e.target
      if (textarea.selectionStart === 0 || !localValue) {
        e.preventDefault()
        const newIndex = Math.min(historyIndexRef.current + 1, userMessages.length - 1)
        historyIndexRef.current = newIndex
        const nextValue = userMessages[newIndex] || ''
        setLocalValue(nextValue)
        onValueChange?.(nextValue)
        onHistoryNav?.(newIndex)
      }
    }
    
    if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      const textarea = e.target
      if (textarea.selectionStart === textarea.value.length) {
        e.preventDefault()
        const newIndex = historyIndexRef.current - 1
        if (newIndex < 0) {
          historyIndexRef.current = -1
          setLocalValue('')
          onValueChange?.('')
        } else {
          historyIndexRef.current = newIndex
          const nextValue = userMessages[newIndex] || ''
          setLocalValue(nextValue)
          onValueChange?.(nextValue)
        }
        onHistoryNav?.(newIndex)
      }
    }
  }, [localValue, userMessages, onSubmit, onHistoryNav])
  
  return (
    <textarea
      ref={textareaRef}
      value={localValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
      spellCheck="false"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
    />
  )
}))

function App() {
  const [authUser, setAuthUser] = useState(null)
  const initialConversationIdRef = useRef(crypto.randomUUID())
  const [conversations, setConversations] = useState(() => [
    { id: initialConversationIdRef.current, title: 'New chat', messages: [] },
  ])
  // Restore active conversation from session storage on refresh
  const [activeConversation, setActiveConversation] = useState(() => {
    try {
      const saved = sessionStorage.getItem('activeConversation')
      // Return null if not found, empty, or literal "null" string
      return saved && saved !== 'null' ? saved : null
    } catch {
      return null
    }
  })
  const chatInputRef = useRef(null) // Ref for the isolated chat textarea
  const codeChatEndRef = useRef(null)
  const codeChatMessagesRef = useRef(null)
  const codeChatSidebarRef = useRef(null)
  const [codeChatAutoScroll, setCodeChatAutoScroll] = useState(true)
  const [inputHistoryIndex, setInputHistoryIndex] = useState(-1) // -1 = not navigating history
  const [isTyping, setIsTyping] = useState(false)
  const [typingStatus, setTypingStatus] = useState('') // 'generating' | 'image' | 'searching'
  // NOTE: We render responses fully formatted once they arrive (no simulated token streaming)
  const generationAbortRef = useRef(null)
  const generationRunIdRef = useRef(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarChatSearchOpen, setSidebarChatSearchOpen] = useState(false)
  const [sidebarChatSearchQuery, setSidebarChatSearchQuery] = useState('')
  const [chatsExpanded, setChatsExpanded] = useState(true)
  const [showDeepResearchModal, setShowDeepResearchModal] = useState(false)
  const [imagePreviewModal, setImagePreviewModal] = useState(null) // { url, prompt }
  const [renamingChatId, setRenamingChatId] = useState(null)
  const [renameChatTitle, setRenameChatTitle] = useState('')
  const [moveToChatId, setMoveToChatId] = useState(null) // Chat ID for move-to-project dropdown
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [newlyGeneratedMessageId, setNewlyGeneratedMessageId] = useState(null) // For typing animation
  const [reactions, setReactions] = useState({}) // { messageId: 'liked' | 'disliked' | null }
  const [toast, setToast] = useState(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadModalTarget, setUploadModalTarget] = useState('chat') // 'chat' | 'deepResearch'
  const [showSettingsPage, setShowSettingsPage] = useState(() => {
    try {
      return sessionStorage.getItem('ui_showSettingsPage') === 'true'
    } catch {
      return false
    }
  })
  const [showAdminPage, setShowAdminPage] = useState(false)
  const [showDeepResearchPage, setShowDeepResearchPage] = useState(() => {
    try {
      return sessionStorage.getItem('showDeepResearchPage') === 'true'
    } catch { return false }
  })
  const [showProfilePage, setShowProfilePage] = useState(false)
  const [showGalleryPage, setShowGalleryPage] = useState(false)
  const [showKnowledgeBasePage, setShowKnowledgeBasePage] = useState(false)
  const [knowledgeBaseTab, setKnowledgeBaseTab] = useState('memory') // memory | rag | graph
  const [showSkillsPage, setShowSkillsPage] = useState(false)
  const [skillsSearchQuery, setSkillsSearchQuery] = useState('')
  const [enabledSkills, setEnabledSkills] = useState(() => {
    try {
      const saved = localStorage.getItem('enabledSkills')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [skillTokens, setSkillTokens] = useState(() => {
    try {
      const saved = localStorage.getItem('skillTokens')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [skillCredentialsModal, setSkillCredentialsModal] = useState(null) // { skillId, skillName, tokenKey, tokenLabel, tokenHelp }
  const [skillCredentialsInput, setSkillCredentialsInput] = useState('')
  const [deleteChatModal, setDeleteChatModal] = useState(null) // { id, title } - chat to delete
  const [skillConnecting, setSkillConnecting] = useState(false)

  // Available skills definition
  const availableSkills = [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Manage repositories, issues, PRs, and code on GitHub',
      icon: 'github',
      category: 'Development',
      capabilities: ['Create/manage repos', 'Handle issues & PRs', 'Code search', 'Actions & workflows'],
      tokenKey: 'github_token',
      tokenLabel: 'Personal Access Token',
      tokenHelp: 'Get one from github.com/settings/tokens with repo scope',
      testEndpoint: 'https://api.github.com/user'
    },
    {
      id: 'vercel',
      name: 'Vercel Deploy',
      description: 'Deploy apps and projects to Vercel with zero configuration',
      icon: 'vercel',
      category: 'Deployment',
      capabilities: ['Deploy projects', 'Manage domains', 'Environment variables', 'Deployment logs'],
      tokenKey: 'vercel_token',
      tokenLabel: 'API Token',
      tokenHelp: 'Get one from vercel.com/account/tokens',
      testEndpoint: 'https://api.vercel.com/v2/user'
    },
    {
      id: 'figma',
      name: 'Figma',
      description: 'Use Figma MCP for design-to-code work',
      icon: 'figma',
      category: 'Design',
      capabilities: ['Export assets', 'Inspect designs', 'Generate code', 'Design tokens'],
      tokenKey: 'figma_token',
      tokenLabel: 'Personal Access Token',
      tokenHelp: 'Get one from figma.com/developers/api',
      testEndpoint: 'https://api.figma.com/v1/me'
    },
    {
      id: 'notion',
      name: 'Notion',
      description: 'Capture conversations into structured Notion pages',
      icon: 'notion',
      category: 'Productivity',
      capabilities: ['Create pages', 'Update databases', 'Search content', 'Sync notes'],
      tokenKey: 'notion_token',
      tokenLabel: 'Integration Token',
      tokenHelp: 'Create an integration at notion.so/my-integrations',
      testEndpoint: 'https://api.notion.com/v1/users/me'
    },
    {
      id: 'linear',
      name: 'Linear',
      description: 'Manage Linear issues and projects in Codex',
      icon: 'linear',
      category: 'Project Management',
      capabilities: ['Create issues', 'Update status', 'Manage sprints', 'Track progress'],
      tokenKey: 'linear_token',
      tokenLabel: 'API Key',
      tokenHelp: 'Get one from linear.app/settings/api',
      testEndpoint: null // Linear uses GraphQL
    },
    {
      id: 'sora',
      name: 'Sora Video',
      description: 'Generate and manage Sora AI videos',
      icon: 'sora',
      category: 'AI Generation',
      capabilities: ['Generate videos', 'Edit clips', 'Manage assets', 'Export formats'],
      tokenKey: 'sora_token',
      tokenLabel: 'API Key',
      tokenHelp: 'Coming soon - Sora API not yet public',
      testEndpoint: null
    }
  ]

  const [adminUsers, setAdminUsers] = useState([])
  const [adminUsage, setAdminUsage] = useState([])
  const [adminUsageModels, setAdminUsageModels] = useState([])
  const [adminRates, setAdminRates] = useState({ inputCost: 0, outputCost: 0 })
  const [adminUserRates, setAdminUserRates] = useState({})
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminSavingRates, setAdminSavingRates] = useState(false)
  const [adminSavingUsers, setAdminSavingUsers] = useState({})
  const [deepResearchConversations, setDeepResearchConversations] = useState(() => {
    try {
      const saved = localStorage.getItem('deepResearchConversations')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [activeDeepResearchId, setActiveDeepResearchId] = useState(() => {
    try {
      return sessionStorage.getItem('activeDeepResearchId') || null
    } catch { return null }
  })
  const [deepResearchMessages, setDeepResearchMessages] = useState(() => {
    try {
      const savedId = sessionStorage.getItem('activeDeepResearchId')
      if (savedId) {
        const convs = JSON.parse(localStorage.getItem('deepResearchConversations') || '[]')
        const conv = convs.find(c => c.id === savedId)
        return conv?.messages || []
      }
      return []
    } catch { return [] }
  })
  const deepResearchRenderedMessages = useMemo(() => {
    return deepResearchMessages.map((message) => {
      if (message.role !== 'assistant') return message
      return {
        ...message,
        html: formatMarkdown(message.content),
      }
    })
  }, [deepResearchMessages])
  const [deepResearchInput, setDeepResearchInput] = useState('')
  const [deepResearchTyping, setDeepResearchTyping] = useState(false)
  const deepResearchEndRef = useRef(null)
  const deepResearchAbortRef = useRef(null)
  const deepResearchFileInputRef = useRef(null)
  const [deepResearchFiles, setDeepResearchFiles] = useState([])
  const [deepResearchProcessingFiles, setDeepResearchProcessingFiles] = useState(false)

  // Code Page - Local Projects & GitHub integration (feature disabled, kept for future use)
  const [showCodePage, setShowCodePage] = useState(false)
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('githubToken') || '')
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubUser, setGithubUser] = useState(null)
  const [githubRepos, setGithubRepos] = useState([])
  const [githubReposLoading, setGithubReposLoading] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [repoFiles, setRepoFiles] = useState([]) // File tree of selected repo
  const [repoFilesLoading, setRepoFilesLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null) // Currently selected file
  const [fileContent, setFileContent] = useState('') // Content of selected file
  const [fileContentLoading, setFileContentLoading] = useState(false)
  const [githubOpenTabs, setGithubOpenTabs] = useState([]) // Array of { id, path, name, file }
  const [githubActiveTabId, setGithubActiveTabId] = useState(null)
  const [githubTabContents, setGithubTabContents] = useState({}) // path -> content
  const [codeInput, setCodeInput] = useState('') // Chat input for code page
  const [codeMessages, setCodeMessages] = useState([]) // Chat history for code page
  const [codeGenerating, setCodeGenerating] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState({}) // Track expanded folders in file tree
  const [repoBranch, setRepoBranch] = useState('main') // Current branch
  const [repoBranches, setRepoBranches] = useState([]) // Available branches
  const [pendingFileChanges, setPendingFileChanges] = useState({}) // path -> { content, action: 'create'|'update'|'delete' }
  const [codeTheme, setCodeTheme] = useState('dark')

  // Local Code Editor - Projects stored in localStorage
  const [codeEditorMode, setCodeEditorMode] = useState('local') // 'local' | 'github'
  const [localProjects, setLocalProjects] = useState(() => {
    const saved = localStorage.getItem('codeEditorProjects')
    return saved ? JSON.parse(saved) : []
  })
  const [activeLocalProject, setActiveLocalProject] = useState(null)
  const [localProjectFiles, setLocalProjectFiles] = useState({}) // projectId -> { files: [...], expandedFolders: {} }
  const [openTabs, setOpenTabs] = useState([]) // Array of { id, path, name, projectId }
  const [activeTabId, setActiveTabId] = useState(null)
  const [editorContent, setEditorContent] = useState('') // Current content being edited
  const [unsavedChanges, setUnsavedChanges] = useState({}) // tabId -> true/false
  const [showNewFileModal, setShowNewFileModal] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemParent, setNewItemParent] = useState('') // Parent path for new file/folder
  const [contextMenuFile, setContextMenuFile] = useState(null) // File for context menu
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showPreviewPanel, setShowPreviewPanel] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [consoleOutput, setConsoleOutput] = useState([])
  const [showConsole, setShowConsole] = useState(false)
  const [consoleTab, setConsoleTab] = useState('preview') // 'preview' | 'terminal'
  const [terminalOutput, setTerminalOutput] = useState([])
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalStatus, setTerminalStatus] = useState('idle') // 'idle' | 'booting' | 'mounting' | 'running'
  const [terminalCwd, setTerminalCwd] = useState('/')
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState(-1)
  const [terminalError, setTerminalError] = useState('')
  const terminalOutputRef = useRef(null)
  const webcontainerRef = useRef(null)
  const webcontainerProjectIdRef = useRef(null)
  const [showDeployMenu, setShowDeployMenu] = useState(false)
  const [showCodeChat, setShowCodeChat] = useState(true) // Show/hide chat panel
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [newLocalProjectName, setNewLocalProjectName] = useState('')
  const [newLocalProjectType, setNewLocalProjectType] = useState('html') // 'html' | 'react' | 'node' | 'python' | 'blank'
  const editorRef = useRef(null)
  const editorLineNumbersRef = useRef(null)
  const editorHighlightRef = useRef(null)
  const githubEditorLineNumbersRef = useRef(null)
  const githubEditorHighlightRef = useRef(null)
  const previewIframeRef = useRef(null)

  // GitHub file editing
  const [githubFileEditing, setGithubFileEditing] = useState(false) // Is editing mode active
  const [githubEditContent, setGithubEditContent] = useState('') // Edited content
  const [githubFileSaving, setGithubFileSaving] = useState(false) // Saving in progress
  const [showGithubNewFileModal, setShowGithubNewFileModal] = useState(false)
  const [githubNewFileName, setGithubNewFileName] = useState('')
  const [githubNewFileContent, setGithubNewFileContent] = useState('')
  const [creatingGithubFile, setCreatingGithubFile] = useState(false)

  // Vercel Integration
  const [vercelToken, setVercelToken] = useState(() => localStorage.getItem('vercelToken') || '')
  const [vercelConnected, setVercelConnected] = useState(false)
  const [vercelUser, setVercelUser] = useState(null)
  const [vercelProjects, setVercelProjects] = useState([])
  const [vercelDeployments, setVercelDeployments] = useState([])
  const [vercelLoading, setVercelLoading] = useState(false)
  const [showVercelModal, setShowVercelModal] = useState(false)
  const [showVercelDeployModal, setShowVercelDeployModal] = useState(false)
  const [vercelDeployName, setVercelDeployName] = useState('')
  const [vercelDeploying, setVercelDeploying] = useState(false)
  const [vercelSelectedProject, setVercelSelectedProject] = useState(null)
  const [showVercelDeployments, setShowVercelDeployments] = useState(false)
  const [vercelDeploymentsLoading, setVercelDeploymentsLoading] = useState(false)

  // Claude Code-style Coder State
  const [coderView, setCoderView] = useState('editor') // 'editor' | 'diff' | 'split-diff'
  const [aiPlan, setAiPlan] = useState(null) // { steps: [], filesToChange: [], status: 'pending'|'executing'|'complete' }
  const [proposedChanges, setProposedChanges] = useState([]) // Array of { path, oldContent, newContent, action, status, explanation }
  const [executionSteps, setExecutionSteps] = useState([]) // { id, description, status: 'pending'|'running'|'success'|'error', output }
  const [repoAnalysis, setRepoAnalysis] = useState(null) // { structure, techStack, dependencies, fileCount }
  const [selectedDiffFile, setSelectedDiffFile] = useState(null) // Currently viewing diff for this file
  const [impactSummary, setImpactSummary] = useState(null) // { filesChanged, linesAdded, linesRemoved, riskLevel }
  const [coderSidebarTab, setCoderSidebarTab] = useState('files') // 'files' | 'changes' | 'history'
  const [commandHistory, setCommandHistory] = useState([]) // Track user commands
  const [isIndexing, setIsIndexing] = useState(false) // Repo indexing in progress
  const [fileStatuses, setFileStatuses] = useState({}) // path -> 'modified' | 'added' | 'deleted' | 'unchanged'
  const [deletingDeployment, setDeletingDeployment] = useState(null)

  // Sidebar Tab Navigation
  const [sidebarTab, setSidebarTab] = useState('code') // 'code' | 'supabase' | 'git' | 'vercel'
  
  // Supabase Integration
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem('supabaseUrl') || '')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(() => localStorage.getItem('supabaseAnonKey') || '')
  const [supabaseServiceKey, setSupabaseServiceKey] = useState(() => localStorage.getItem('supabaseServiceKey') || '')
  const [supabaseConnected, setSupabaseConnected] = useState(false)
  const [supabaseTables, setSupabaseTables] = useState([])
  const [supabaseLoading, setSupabaseLoading] = useState(false)
  const [supabaseSelectedTable, setSupabaseSelectedTable] = useState(null)
  const [supabaseTableData, setSupabaseTableData] = useState([])

  // Local Git Operations
  const [gitRepoName, setGitRepoName] = useState('')
  const [gitBranches, setGitBranches] = useState(['main'])
  const [gitCurrentBranch, setGitCurrentBranch] = useState('main')
  const [gitCommits, setGitCommits] = useState([])
  const [gitStagedFiles, setGitStagedFiles] = useState([])
  const [gitCommitMessage, setGitCommitMessage] = useState('')
  const [gitInitialized, setGitInitialized] = useState(false)

  // Repo lifecycle (create/delete) UI
  const [showCreateRepoModal, setShowCreateRepoModal] = useState(false)
  const [creatingRepo, setCreatingRepo] = useState(false)
  const [createRepoError, setCreateRepoError] = useState('')
  const [createRepoForm, setCreateRepoForm] = useState({ name: '', description: '', private: true })

  const [showDeleteRepoModal, setShowDeleteRepoModal] = useState(false)
  const [deleteRepoConfirm, setDeleteRepoConfirm] = useState('')
  const [deletingRepo, setDeletingRepo] = useState(false)
  const [deleteRepoError, setDeleteRepoError] = useState('')
  const [showDeleteFileModal, setShowDeleteFileModal] = useState(false)
  const [deleteFileTarget, setDeleteFileTarget] = useState(null) // { path, sha, name }
  const [deletingFile, setDeletingFile] = useState(false)
  const [deleteFileError, setDeleteFileError] = useState('')
  
  // Projects feature (stored in Supabase, scoped per-user)
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#10b981')
  const [newProjectInstructions, setNewProjectInstructions] = useState('')
  const [userMemories, setUserMemories] = useState([])
  const [ragDocuments, setRagDocuments] = useState([])
  const [kbLoading, setKbLoading] = useState(false)
  // Knowledge Graph needs full (unpaginated) data to represent true counts
  const [graphMemories, setGraphMemories] = useState([])
  const [graphDocuments, setGraphDocuments] = useState([])
  const [graphLoading, setGraphLoading] = useState(false)
  // Pagination state
  const [memoriesPage, setMemoriesPage] = useState(1)
  const [memoriesTotalCount, setMemoriesTotalCount] = useState(0)
  const [documentsPage, setDocumentsPage] = useState(1)
  const [documentsTotalCount, setDocumentsTotalCount] = useState(0)
  const KB_PAGE_SIZE = 10
  const [attachedFiles, setAttachedFiles] = useState([])
  // Per-file upload progress (id -> progress 0-100)
  const [attachmentProgress, setAttachmentProgress] = useState({})
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)
  // Pre-processed OCR context (processed on file attach, used on send)
  const [preProcessedOcr, setPreProcessedOcr] = useState({ ocrContext: '', postedMessage: '' })
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState(() => {
    return localStorage.getItem('n8nWebhookUrl') || ''
  })
  const [importingAgents, setImportingAgents] = useState(false)
  // Agents are stored per-user to avoid cross-account leakage
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [showCoderAgentSelector, setShowCoderAgentSelector] = useState(false)
  const [webhookError, setWebhookError] = useState('')
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [showAddAgentForm, setShowAddAgentForm] = useState(false)
  const [newAgent, setNewAgent] = useState({ name: '', description: '', tags: '', webhookUrl: '', systemPrompt: '' })
  const [editingAgent, setEditingAgent] = useState(null) // Agent being edited
  
  
  // Search Configuration
  const [searchUrl, setSearchUrl] = useState(() => {
    return localStorage.getItem('searchUrl') || 'https://search.brainstormnodes.org/'
  })
  const [searchConnection, setSearchConnection] = useState({ state: 'idle', message: '' })
  const [checkingSearch, setCheckingSearch] = useState(false)

  // Settings tabs
  const [settingsTab, setSettingsTab] = useState(() => {
    try {
      return sessionStorage.getItem('ui_settingsTab') || 'n8n'
    } catch {
      return 'n8n'
    }
  }) // n8n | openrouter | lmstudio | embeddings | ocr | images | mcp

  // MCP Servers config (supports multiple servers via JSON import)
  const [mcpServers, setMcpServers] = useState(() => {
    const saved = localStorage.getItem('mcpServers')
    if (!saved) return []
    try {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [mcpImportJson, setMcpImportJson] = useState('')
  const [mcpImportError, setMcpImportError] = useState('')
  const [mcpFlowFilter, setMcpFlowFilter] = useState('')
  const mcpRpcIdRef = useRef(1)

  // OpenRouter config
  // NOTE: Vite env vars (VITE_*) are bundled into the client and are not secret.
  // We support env as a convenience fallback, but localStorage wins.
  const [openRouterApiKey, setOpenRouterApiKey] = useState(() => {
    return (
      localStorage.getItem('openRouterApiKey') ||
      import.meta.env.VITE_OPENROUTER_API_KEY ||
      ''
    )
  })
  const [openRouterConnectState, setOpenRouterConnectState] = useState(() => {
    return localStorage.getItem('openRouterConnectState') || 'disconnected' // disconnected | connecting | connected | error
  })
  const [openRouterConnectError, setOpenRouterConnectError] = useState('')
  const [openRouterModels, setOpenRouterModels] = useState(() => {
    const saved = localStorage.getItem('openRouterModels')
    if (!saved) return []
    try {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [openRouterModelFilter, setOpenRouterModelFilter] = useState('')
  // OpenRouter agents are also user-scoped (loaded in useEffect below)
  const [openRouterAgents, setOpenRouterAgents] = useState([])
  const [editingOpenRouterAgent, setEditingOpenRouterAgent] = useState(null)
  const [newOpenRouterAgent, setNewOpenRouterAgent] = useState({
    name: '',
    model: 'openai/gpt-4o-mini',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
  })

  // LM Studio (OpenAI-compatible local server) config
  const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState(() => {
    return localStorage.getItem('lmStudioBaseUrl') || 'http://localhost:1234/v1'
  })
  const [lmStudioApiKey, setLmStudioApiKey] = useState(() => {
    return localStorage.getItem('lmStudioApiKey') || ''
  })
  const [lmStudioConnectState, setLmStudioConnectState] = useState(() => {
    return localStorage.getItem('lmStudioConnectState') || 'disconnected'
  })
  const [lmStudioConnectError, setLmStudioConnectError] = useState('')
  const [lmStudioModels, setLmStudioModels] = useState(() => {
    const saved = localStorage.getItem('lmStudioModels')
    if (!saved) return []
    try {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [lmStudioModelFilter, setLmStudioModelFilter] = useState('')
  const [lmStudioAgents, setLmStudioAgents] = useState([])
  const [newLmStudioAgent, setNewLmStudioAgent] = useState({
    name: '',
    model: '',
    systemPrompt: 'You are a helpful assistant.',
    uncensored: false,
    temperature: 0.7,
  })
  const agentsLoadedRef = useRef(false)
  const agentsSyncTimeoutRef = useRef(null)

  // Embeddings / RAG config
  const OPENAI_EMBEDDINGS_MODEL = 'text-embedding-3-small'
  // NOTE: Vite env vars (VITE_*) are bundled into the client and are not secret.
  // We support env as a convenience fallback, but localStorage wins.
  const [openAiApiKey, setOpenAiApiKey] = useState(() => {
    return (
      localStorage.getItem('openAiApiKey') ||
      import.meta.env.VITE_OPENAI_API_KEY ||
      ''
    )
  })
  // For embeddings/RAG we prefer the env key (VITE_OPENAI_API_KEY) if present,
  // so localStorage/UI edits can't accidentally override a working env setup.
  const openAiEmbeddingsApiKey = (import.meta.env.VITE_OPENAI_API_KEY || openAiApiKey || '').trim()
  const [openAiConnectState, setOpenAiConnectState] = useState('disconnected') // disconnected | connecting | connected | error
  const [openAiConnectError, setOpenAiConnectError] = useState('')
  const openAiKeyTestedRef = useRef('') // tracks last tested key to avoid duplicate tests

  const [ragUploadFiles, setRagUploadFiles] = useState([]) // [{ id, file, name, size, type }]
  const [ragIngestState, setRagIngestState] = useState('idle') // idle | ingesting | done | error
  const [ragIngestProgress, setRagIngestProgress] = useState({ fileIndex: 0, fileCount: 0, message: '' })
  const [ragIngestError, setRagIngestError] = useState('')

  // OCR (chat uploads)
  const [ocrModel, setOcrModel] = useState(() => {
    return localStorage.getItem('ocrModel') || 'gpt-4o'
  })
  const [ocrAutoProcessChatUploads, setOcrAutoProcessChatUploads] = useState(() => {
    const v = localStorage.getItem('ocrAutoProcessChatUploads')
    return v == null ? true : v === 'true'
  })
  const [ocrAutoIngestToRag, setOcrAutoIngestToRag] = useState(() => {
    const v = localStorage.getItem('ocrAutoIngestToRag')
    return v == null ? true : v === 'true'
  })
  const [ocrAutoPostSummaryToChat, setOcrAutoPostSummaryToChat] = useState(() => {
    const v = localStorage.getItem('ocrAutoPostSummaryToChat')
    return v == null ? true : v === 'true'
  })

  // Image generation (chat)
  const [imageGenModel, setImageGenModel] = useState(() => {
    return localStorage.getItem('imageGenModel') || 'dall-e-3'
  })
  const [autoImageGenFromChat, setAutoImageGenFromChat] = useState(() => {
    const v = localStorage.getItem('autoImageGenFromChat')
    return v == null ? true : v === 'true'
  })

  // Code Canvas state
  const [canvasFiles, setCanvasFiles] = useState({ html: '', css: '', js: '' })
  const [canvasActiveTab, setCanvasActiveTab] = useState('html') // html | css | js
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const canvasIframeRef = useRef(null)

  const canvasEditorRef = useRef(null)
  const canvasHighlightRef = useRef(null)

  // User profile (Supabase)
  const [profileRow, setProfileRow] = useState(null) // { user_id, display_name, avatar_url, settings }
  const [profileDraft, setProfileDraft] = useState({
    display_name: '',
    role: '',
    timezone: '',
    about: '',
  })
  const [profileSaveState, setProfileSaveState] = useState('idle') // idle | saving | error
  const [profileSaveError, setProfileSaveError] = useState('')

  // Generated images gallery
  const [generatedImages, setGeneratedImages] = useState([]) // [{ image_id, prompt, model, storage_bucket, storage_path, created_at, url }]
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState('')

  // Code artifacts library
  const [codeArtifacts, setCodeArtifacts] = useState([]) // [{ id, title, language, code, created_at }]
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState('')
  const [libraryTab, setLibraryTab] = useState('images') // 'images' | 'artifacts'
  const [editingArtifactId, setEditingArtifactId] = useState(null) // id of artifact being renamed
  const [editingArtifactTitle, setEditingArtifactTitle] = useState('') // draft title during edit

  const user = authUser
    ? {
        name: profileDraft.display_name?.trim() || profileRow?.display_name || authUser.email?.split('@')?.[0] || 'User',
        email: authUser.email || '',
        avatar: (authUser.email?.[0] || 'U').toUpperCase(),
      }
    : {
        name: 'John Doe',
        email: 'john@example.com',
        avatar: 'JD',
      }

  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingOnInput, setIsDraggingOnInput] = useState(false)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachMenuRef = useRef(null)
  const toolsMenuRef = useRef(null)
  const uploadModalRef = useRef(null)
  const sidebarSearchInputRef = useRef(null)

  const currentConversation = conversations.find(c => c.id === activeConversation)

  const filteredConversations = useMemo(() => {
    const q = sidebarChatSearchQuery.trim().toLowerCase()
    if (!q) return conversations
    return (conversations || []).filter((c) => (c?.title || '').toLowerCase().includes(q))
  }, [conversations, sidebarChatSearchQuery])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(null), 2000)
  }

  // Persist active conversation so refresh stays on the same chat
  useEffect(() => {
    try {
      if (activeConversation) {
        sessionStorage.setItem('activeConversation', activeConversation)
      } else {
        sessionStorage.removeItem('activeConversation')
      }
    } catch {}
  }, [activeConversation])

  const dbEnabled = Boolean(isSupabaseConfigured && supabase && authUser)
  const isAdmin = (authUser?.email || '').toLowerCase() === ADMIN_EMAIL

  // Keep Settings open while user is there (prevents unexpected navigation on remount)
  useEffect(() => {
    try {
      sessionStorage.setItem('ui_showSettingsPage', showSettingsPage ? 'true' : 'false')
    } catch {}
  }, [showSettingsPage])

  useEffect(() => {
    if (!showAdminPage || !isAdmin) return
    loadAdminData()
  }, [showAdminPage, isAdmin, dbEnabled])

  useEffect(() => {
    try {
      sessionStorage.setItem('ui_settingsTab', settingsTab || 'n8n')
    } catch {}
  }, [settingsTab])

  const loadGeneratedImages = async () => {
    if (!dbEnabled) return
    setGalleryError('')
    setGalleryLoading(true)
    try {
      const { data, error } = await supabase
        .from('generated_images')
        .select('image_id,prompt,model,parameters,storage_bucket,storage_path,created_at')
        .eq('owner_user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const rows = data || []
      const withUrls = await Promise.all(
        rows.map(async (row) => {
          try {
            const bucket = row.storage_bucket || 'generated-images'
            const path = row.storage_path
            if (!path) return { ...row, url: '' }
            const { data: signed, error: signErr } = await supabase
              .storage
              .from(bucket)
              .createSignedUrl(path, 60 * 60) // 1 hour
            if (signErr) throw signErr
            return { ...row, url: signed?.signedUrl || '' }
          } catch {
            return { ...row, url: '' }
          }
        })
      )
      setGeneratedImages(withUrls)
    } catch (e) {
      console.error(e)
      setGalleryError(e.message || 'Failed to load images')
    } finally {
      setGalleryLoading(false)
    }
  }

  // Code artifacts functions
  const loadCodeArtifacts = async () => {
    if (!dbEnabled) return
    setArtifactsError('')
    setArtifactsLoading(true)
    try {
      const { data, error } = await supabase
        .from('code_artifacts')
        .select('id,title,language,code,created_at')
        .eq('owner_user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setCodeArtifacts(data || [])
    } catch (e) {
      console.error(e)
      setArtifactsError(e.message || 'Failed to load code artifacts')
    } finally {
      setArtifactsLoading(false)
    }
  }

  // Ref to always access latest save function from event handler
  const saveCodeArtifactRef = useRef(null)

  const saveCodeArtifact = async (code, language, displayLang) => {
    if (!dbEnabled) {
      showToast('Sign in to save code to Library')
      return
    }
    try {
      // Generate a title from the first line or language
      const firstLine = code.split('\n')[0]?.trim().slice(0, 50) || ''
      const title = firstLine || `${displayLang || language} snippet`

      const { error } = await supabase
        .from('code_artifacts')
        .insert({
          owner_user_id: authUser.id,
          title,
          language,
          code
        })
      if (error) throw error
      showToast('Saved to Library')
      // Refresh artifacts if on library page
      if (showGalleryPage && libraryTab === 'artifacts') {
        loadCodeArtifacts()
      }
    } catch (e) {
      console.error(e)
      showToast('Failed to save: ' + (e.message || 'Unknown error'))
    }
  }

  // Keep ref updated with latest function
  saveCodeArtifactRef.current = saveCodeArtifact

  const deleteCodeArtifact = async (id) => {
    if (!dbEnabled) return
    try {
      const { error } = await supabase
        .from('code_artifacts')
        .delete()
        .eq('id', id)
        .eq('owner_user_id', authUser.id)
      if (error) throw error
      setCodeArtifacts((prev) => prev.filter((a) => a.id !== id))
      showToast('Artifact deleted')
    } catch (e) {
      console.error(e)
      showToast('Failed to delete: ' + (e.message || 'Unknown error'))
    }
  }

  const copyArtifactCode = async (code) => {
    try {
      // Use ClipboardItem API for plain text only (no formatting)
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const blob = new Blob([code], { type: 'text/plain' })
        const item = new ClipboardItem({ 'text/plain': blob })
        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(code)
      }
      showToast('Code copied to clipboard')
    } catch {
      showToast('Failed to copy')
    }
  }

  // Check if a skill has a valid token
  const isSkillConnected = (skillId) => {
    const skill = availableSkills.find(s => s.id === skillId)
    if (!skill?.tokenKey) return false
    return !!skillTokens[skill.tokenKey]
  }

  // Handle skill card click
  const handleSkillClick = (skill) => {
    const hasToken = skillTokens[skill.tokenKey]
    
    if (!hasToken) {
      // Open credentials modal
      setSkillCredentialsModal({
        skillId: skill.id,
        skillName: skill.name,
        tokenKey: skill.tokenKey,
        tokenLabel: skill.tokenLabel,
        tokenHelp: skill.tokenHelp,
        testEndpoint: skill.testEndpoint
      })
      setSkillCredentialsInput('')
    } else {
      // Toggle enabled/disabled
      toggleSkill(skill.id)
    }
  }

  // Toggle skill enabled/disabled
  const toggleSkill = (skillId) => {
    setEnabledSkills(prev => {
      const newSkills = prev.includes(skillId)
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
      localStorage.setItem('enabledSkills', JSON.stringify(newSkills))
      const skill = availableSkills.find(s => s.id === skillId)
      if (skill) {
        showToast(newSkills.includes(skillId) 
          ? `${skill.name} skill enabled` 
          : `${skill.name} skill disabled`)
      }
      return newSkills
    })
  }

  // Save skill token and test connection
  const saveSkillToken = async () => {
    if (!skillCredentialsModal || !skillCredentialsInput.trim()) return
    
    setSkillConnecting(true)
    const { skillId, skillName, tokenKey, testEndpoint } = skillCredentialsModal
    const token = skillCredentialsInput.trim()
    
    try {
      // Test the token if endpoint available
      if (testEndpoint) {
        const headers = { 'Authorization': `Bearer ${token}` }
        // Notion uses different auth header
        if (skillId === 'notion') {
          headers['Authorization'] = `Bearer ${token}`
          headers['Notion-Version'] = '2022-06-28'
        }
        
        const resp = await fetch(testEndpoint, { headers })
        if (!resp.ok) {
          throw new Error(`Invalid token (${resp.status})`)
        }
      }
      
      // Save token
      const newTokens = { ...skillTokens, [tokenKey]: token }
      setSkillTokens(newTokens)
      localStorage.setItem('skillTokens', JSON.stringify(newTokens))
      
      // Auto-enable the skill
      if (!enabledSkills.includes(skillId)) {
        const newEnabled = [...enabledSkills, skillId]
        setEnabledSkills(newEnabled)
        localStorage.setItem('enabledSkills', JSON.stringify(newEnabled))
      }
      
      showToast(`${skillName} connected successfully!`)
      setSkillCredentialsModal(null)
      setSkillCredentialsInput('')
    } catch (e) {
      showToast(`Connection failed: ${e.message}`)
    } finally {
      setSkillConnecting(false)
    }
  }

  // Disconnect a skill (remove token)
  const disconnectSkill = (skillId) => {
    const skill = availableSkills.find(s => s.id === skillId)
    if (!skill?.tokenKey) return
    
    // Remove token
    const newTokens = { ...skillTokens }
    delete newTokens[skill.tokenKey]
    setSkillTokens(newTokens)
    localStorage.setItem('skillTokens', JSON.stringify(newTokens))
    
    // Disable skill
    const newEnabled = enabledSkills.filter(id => id !== skillId)
    setEnabledSkills(newEnabled)
    localStorage.setItem('enabledSkills', JSON.stringify(newEnabled))
    
    showToast(`${skill.name} disconnected`)
  }

  // Filter skills by search query
  const filteredSkills = availableSkills.filter(skill => {
    if (!skillsSearchQuery.trim()) return true
    const query = skillsSearchQuery.toLowerCase()
    return (
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.category.toLowerCase().includes(query)
    )
  })

  // Rename artifact
  const renameCodeArtifact = async (id, newTitle) => {
    if (!dbEnabled || !newTitle.trim()) return
    try {
      const { error } = await supabase
        .from('code_artifacts')
        .update({ title: newTitle.trim() })
        .eq('id', id)
        .eq('owner_user_id', authUser.id)
      if (error) throw error
      setCodeArtifacts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, title: newTitle.trim() } : a))
      )
      showToast('Artifact renamed')
    } catch (e) {
      console.error(e)
      showToast('Failed to rename: ' + (e.message || 'Unknown error'))
    }
    setEditingArtifactId(null)
    setEditingArtifactTitle('')
  }

  // Open artifact in code canvas and start chat
  const openArtifactInCanvas = (artifact) => {
    // Determine which tab based on language
    const lang = (artifact.language || '').toLowerCase()
    const target =
      ['css', 'scss', 'less'].includes(lang) ? 'css'
        : ['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript'].includes(lang) ? 'js'
          : 'html'

    // Set the code in canvas
    setCanvasFiles((prev) => ({
      ...prev,
      [target]: artifact.code || ''
    }))
    setCanvasActiveTab(target)
    setCanvasOpen(true)

    // Close library page and go to chat
    setShowGalleryPage(false)

    // Start a new conversation about this artifact
    const newId = `conv-${Date.now()}`
    const newConv = {
      id: newId,
      title: artifact.title || 'Code Chat',
      messages: [{
        role: 'system',
        content: `You are helping the user work with their code artifact: "${artifact.title}"\n\nLanguage: ${artifact.language || 'text'}\n\nThe code is now loaded in the code editor on the right. Help the user understand, modify, or improve this code.`
      }, {
        role: 'assistant',
        content: `I've loaded your code artifact **"${artifact.title}"** into the editor. I can see it's written in **${artifact.language || 'text'}**.\n\nHow can I help you with this code? I can:\n- Explain how it works\n- Suggest improvements\n- Help fix bugs\n- Add new features\n- Refactor or optimize it\n\nJust let me know what you'd like to do!`
      }],
      createdAt: Date.now(),
      isNew: false
    }
    setConversations((prev) => [newConv, ...prev])
    setActiveConversationId(newId)
  }

  const loadUserMemories = async (page = 1) => {
    if (!dbEnabled) return
    try {
      // Get total count
      const { count, error: countError } = await supabase
        .from('user_memories')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', authUser.id)
      if (!countError) setMemoriesTotalCount(count || 0)

      // Get paginated data
      const offset = (page - 1) * KB_PAGE_SIZE
      const { data, error } = await supabase
        .from('user_memories')
        .select('memory_id,memory_type,content,confidence,is_active,created_at,updated_at')
        .eq('owner_user_id', authUser.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + KB_PAGE_SIZE - 1)
      if (error) throw error
      setUserMemories(data || [])
      setMemoriesPage(page)
    } catch (e) {
      console.error('Failed to load memories:', e)
    }
  }

  const loadRagDocuments = async (page = 1) => {
    if (!dbEnabled) return
    try {
      // Get total count
      const { count, error: countError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', authUser.id)
      if (!countError) setDocumentsTotalCount(count || 0)

      // Get paginated documents
      const offset = (page - 1) * KB_PAGE_SIZE
      const { data: docs, error } = await supabase
        .from('documents')
        .select('document_id,title,source_type,storage_bucket,storage_path,metadata,created_at')
        .eq('owner_user_id', authUser.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + KB_PAGE_SIZE - 1)
      if (error) throw error
      
      // Then get chunk counts with embeddings for each document
      if (docs && docs.length > 0) {
        const docIds = docs.map(d => d.document_id)
        const { data: chunkData, error: chunkError } = await supabase
          .from('document_chunks')
          .select('document_id,embedding')
          .in('document_id', docIds)
        
        if (!chunkError && chunkData) {
          // Count embedded chunks per document
          const embeddedCounts = {}
          const totalCounts = {}
          chunkData.forEach(chunk => {
            totalCounts[chunk.document_id] = (totalCounts[chunk.document_id] || 0) + 1
            if (chunk.embedding) {
              embeddedCounts[chunk.document_id] = (embeddedCounts[chunk.document_id] || 0) + 1
            }
          })
          
          // Attach counts to documents
          const docsWithStatus = docs.map(doc => ({
            ...doc,
            chunk_count: totalCounts[doc.document_id] || 0,
            embedded_count: embeddedCounts[doc.document_id] || 0,
            is_embedded: (embeddedCounts[doc.document_id] || 0) > 0
          }))
          setRagDocuments(docsWithStatus)
        } else {
          setRagDocuments(docs || [])
        }
      } else {
        setRagDocuments([])
      }
      setDocumentsPage(page)
    } catch (e) {
      console.error('Failed to load documents:', e)
    }
  }

  const loadKnowledgeBaseData = async () => {
    if (!dbEnabled) return
    setKbLoading(true)
    try {
      await Promise.all([loadUserMemories(), loadRagDocuments()])
    } finally {
      setKbLoading(false)
    }
  }

  const loadGraphData = async () => {
    if (!dbEnabled) return
    setGraphLoading(true)
    try {
      const PAGE = 200
      const MAX = 2000 // safety cap for UI performance

      // Load all memories
      const allMem = []
      for (let offset = 0; offset < MAX; offset += PAGE) {
        const { data, error } = await supabase
          .from('user_memories')
          .select('memory_id,memory_type,content,confidence,is_active,created_at,updated_at')
          .eq('owner_user_id', authUser.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const rows = data || []
        allMem.push(...rows)
        if (rows.length < PAGE) break
      }
      setGraphMemories(allMem)

      // Load all documents (note: we don't compute chunk counts here to avoid huge reads)
      const allDocs = []
      for (let offset = 0; offset < MAX; offset += PAGE) {
        const { data, error } = await supabase
          .from('documents')
          .select('document_id,title,source_type,storage_bucket,storage_path,metadata,created_at')
          .eq('owner_user_id', authUser.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const rows = data || []
        allDocs.push(...rows)
        if (rows.length < PAGE) break
      }
      setGraphDocuments(allDocs)
    } catch (e) {
      console.error('Failed to load graph data:', e)
      // fall back to paginated data
      setGraphMemories(userMemories || [])
      setGraphDocuments(ragDocuments || [])
    } finally {
      setGraphLoading(false)
    }
  }

  // When user opens the Knowledge Graph tab, load the full dataset so counts are accurate
  useEffect(() => {
    if (!dbEnabled) return
    if (!showKnowledgeBasePage) return
    if (knowledgeBaseTab !== 'graph') return
    loadGraphData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEnabled, showKnowledgeBasePage, knowledgeBaseTab, authUser?.id])

  const deleteMemory = async (memoryId) => {
    if (!dbEnabled) return
    try {
      const { error } = await supabase
        .from('user_memories')
        .delete()
        .eq('memory_id', memoryId)
        .eq('owner_user_id', authUser.id)
      if (error) throw error
      setUserMemories(prev => prev.filter(m => m.memory_id !== memoryId))
      showToast('Memory deleted')
    } catch (e) {
      console.error('Failed to delete memory:', e)
      showToast('Failed to delete memory')
    }
  }

  const deleteDocument = async (documentId) => {
    if (!dbEnabled) return
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('document_id', documentId)
        .eq('owner_user_id', authUser.id)
      if (error) throw error
      setRagDocuments(prev => prev.filter(d => d.document_id !== documentId))
      showToast('Document deleted')
    } catch (e) {
      console.error('Failed to delete document:', e)
      showToast('Failed to delete document')
    }
  }

  // Project management functions (Supabase-backed)
  const loadProjectsFromDb = async () => {
    if (!dbEnabled) {
      setProjects([])
      return
    }
    setProjectsLoading(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('project_id,name,color,instructions,chat_ids,created_at,updated_at')
        .eq('owner_user_id', authUser.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      setProjects((data || []).map(p => ({
        id: p.project_id,
        name: p.name,
        color: p.color,
        instructions: p.instructions || '',
        chatIds: p.chat_ids || [],
        createdAt: p.created_at,
        updatedAt: p.updated_at
      })))
    } catch (e) {
      console.error('Failed to load projects:', e)
      showToast('Failed to load projects')
    } finally {
      setProjectsLoading(false)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) {
      showToast('Please enter a project name')
      return
    }
    
    const projectData = {
      name: newProjectName.trim(),
      color: newProjectColor,
      instructions: newProjectInstructions.trim(),
      chatIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // If DB enabled, persist to Supabase
    if (dbEnabled) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .insert({
            owner_user_id: authUser.id,
            name: projectData.name,
            color: projectData.color,
            instructions: projectData.instructions,
            chat_ids: []
          })
          .select('project_id,name,color,instructions,chat_ids,created_at,updated_at')
          .single()
        if (error) throw error
        
        const newProject = {
          id: data.project_id,
          name: data.name,
          color: data.color,
          instructions: data.instructions || '',
          chatIds: data.chat_ids || [],
          createdAt: data.created_at,
          updatedAt: data.updated_at
        }
        setProjects(prev => [newProject, ...prev])
        showToast(`Project "${newProject.name}" created!`)
      } catch (e) {
        console.error('Failed to create project:', e)
        showToast('Failed to create project')
        return
      }
    } else {
      // Fallback to local-only (no persistence)
      const newProject = {
        id: crypto.randomUUID(),
        ...projectData
      }
      setProjects(prev => [newProject, ...prev])
      showToast(`Project "${newProject.name}" created!`)
    }
    
    // Reset form
    setNewProjectName('')
    setNewProjectColor('#10b981')
    setNewProjectInstructions('')
    setShowCreateProjectModal(false)
  }

  const deleteProject = async (projectId) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    
    // Remove project assignment from all chats (UI state)
    if (project.chatIds && project.chatIds.length > 0) {
      setConversations(prev => prev.map(conv => ({
        ...conv,
        projectId: conv.projectId === projectId ? null : conv.projectId
      })))
    }
    
    // Delete from Supabase if enabled
    if (dbEnabled) {
      try {
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('project_id', projectId)
          .eq('owner_user_id', authUser.id)
        if (error) throw error
      } catch (e) {
        console.error('Failed to delete project:', e)
        showToast('Failed to delete project')
        return
      }
    }
    
    setProjects(prev => prev.filter(p => p.id !== projectId))
    
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null)
    }
    
    showToast(`Project "${project.name}" deleted`)
  }

  const addChatToProject = async (chatId, projectId) => {
    // Remove from any existing project first
    const updatedProjects = projects.map(p => ({
      ...p,
      chatIds: p.chatIds.filter(id => id !== chatId)
    }))
    
    // Add to new project
    const projectIndex = updatedProjects.findIndex(p => p.id === projectId)
    if (projectIndex !== -1) {
      updatedProjects[projectIndex].chatIds.push(chatId)
      updatedProjects[projectIndex].updatedAt = new Date().toISOString()
    }
    
    // Persist to Supabase
    if (dbEnabled) {
      try {
        // Update all affected projects
        for (const p of updatedProjects) {
          const original = projects.find(op => op.id === p.id)
          if (JSON.stringify(original?.chatIds) !== JSON.stringify(p.chatIds)) {
            await supabase
              .from('projects')
              .update({ chat_ids: p.chatIds })
              .eq('project_id', p.id)
              .eq('owner_user_id', authUser.id)
          }
        }
      } catch (e) {
        console.error('Failed to update project:', e)
        showToast('Failed to add chat to project')
        return
      }
    }
    
    setProjects(updatedProjects)
    
    // Update conversation's projectId
    setConversations(prev => prev.map(conv => 
      conv.id === chatId ? { ...conv, projectId } : conv
    ))
    
    const project = updatedProjects.find(p => p.id === projectId)
    showToast(`Chat added to "${project?.name}"`)
  }

  const removeChatFromProject = async (chatId) => {
    const updatedProjects = projects.map(p => ({
      ...p,
      chatIds: p.chatIds.filter(id => id !== chatId)
    }))
    
    // Persist to Supabase
    if (dbEnabled) {
      try {
        for (const p of updatedProjects) {
          const original = projects.find(op => op.id === p.id)
          if (JSON.stringify(original?.chatIds) !== JSON.stringify(p.chatIds)) {
            await supabase
              .from('projects')
              .update({ chat_ids: p.chatIds })
              .eq('project_id', p.id)
              .eq('owner_user_id', authUser.id)
          }
        }
      } catch (e) {
        console.error('Failed to remove chat from project:', e)
      }
    }
    
    setProjects(updatedProjects)
    
    setConversations(prev => prev.map(conv => 
      conv.id === chatId ? { ...conv, projectId: null } : conv
    ))
  }

  const getProjectForChat = (chatId) => {
    return projects.find(p => p.chatIds?.includes(chatId))
  }

  const getChatsInProject = (projectId) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return []
    return conversations.filter(conv => project.chatIds?.includes(conv.id))
  }

  // Extract memories from conversation using AI
  const extractMemoriesFromConversation = async (userMessage, assistantResponse) => {
    if (!dbEnabled || !openAiApiKey) return
    
    try {
      const extractionPrompt = `Analyze this conversation and extract any personal facts, preferences, or details about the user that would be worth remembering for future conversations.

User message: "${userMessage}"
Assistant response: "${assistantResponse}"

If you find memorable information, respond with a JSON array of objects with these fields:
- memory_type: one of "preference", "personal_detail", "project_context", or "fact"
- content: a concise statement about the user (e.g., "User prefers dark mode" or "User is a software engineer")
- confidence: a number between 0 and 1 indicating how confident you are this is a real fact

Only extract clear, useful facts. If no memorable information is found, respond with an empty array [].
Respond ONLY with valid JSON, no other text.`

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: extractionPrompt }],
          temperature: 0.3,
          max_tokens: 500
        })
      })

      if (!response.ok) return

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content?.trim()
      
      if (!content) return

      // Parse the JSON response
      let memories = []
      try {
        // Handle potential markdown code blocks
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        memories = JSON.parse(jsonStr)
      } catch (e) {
        console.log('Could not parse memory extraction response:', content)
        return
      }

      if (!Array.isArray(memories) || memories.length === 0) return

      // Save each memory to the database
      for (const mem of memories) {
        if (!mem.content || !mem.memory_type) continue
        
        // Check for duplicate content
        const isDuplicate = userMemories.some(existing => 
          existing.content.toLowerCase().includes(mem.content.toLowerCase().substring(0, 30)) ||
          mem.content.toLowerCase().includes(existing.content.toLowerCase().substring(0, 30))
        )
        
        if (isDuplicate) continue

        const { error } = await supabase
          .from('user_memories')
          .insert({
            owner_user_id: authUser.id,
            memory_type: mem.memory_type,
            content: mem.content,
            confidence: mem.confidence || 0.7,
            is_active: true
          })
        
        if (!error) {
          // Refresh memories list
          loadUserMemories()
          console.log('Memory saved:', mem.content)
        }
      }
    } catch (e) {
      console.error('Memory extraction error:', e)
    }
  }

  useEffect(() => {
    if (!dbEnabled) {
      setProfileRow(null)
      setProfileDraft({ display_name: '', role: '', timezone: '', about: '' })
      setProfileSaveState('idle')
      setProfileSaveError('')
      setGeneratedImages([])
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id,display_name,avatar_url,settings')
          .eq('user_id', authUser.id)
          .single()
        if (error) throw error
        if (cancelled) return

        const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {}
        setProfileRow(data)
        setProfileDraft({
          display_name: data?.display_name || '',
          role: settings.role || '',
          timezone: settings.timezone || '',
          about: settings.about || '',
        })
      } catch (e) {
        console.error('Failed to load profile:', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [dbEnabled, authUser?.id])

  useEffect(() => {
    if (!dbEnabled) return
    loadGeneratedImages().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEnabled, authUser?.id])

  // Refresh gallery when opening the gallery page
  useEffect(() => {
    if (showGalleryPage && dbEnabled) {
      if (libraryTab === 'images') {
        loadGeneratedImages().catch(() => {})
      } else if (libraryTab === 'artifacts') {
        loadCodeArtifacts().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGalleryPage, libraryTab])

  // Load knowledge base data when opening the KB page
  useEffect(() => {
    if (showKnowledgeBasePage && dbEnabled) {
      loadKnowledgeBaseData().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKnowledgeBasePage])

  const saveUserProfile = async () => {
    if (!dbEnabled) {
      showToast('Sign in (Supabase) to save your profile')
      return
    }
    setProfileSaveError('')
    setProfileSaveState('saving')
    try {
      const nextSettings = {
        ...(profileRow?.settings && typeof profileRow.settings === 'object' ? profileRow.settings : {}),
        role: profileDraft.role || '',
        timezone: profileDraft.timezone || '',
        about: profileDraft.about || '',
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: profileDraft.display_name || '',
          settings: nextSettings,
        })
        .eq('user_id', authUser.id)
        .select('user_id,display_name,avatar_url,settings')
        .single()

      if (error) throw error
      setProfileRow(data)
      setProfileSaveState('idle')
      showToast('Profile saved')
    } catch (e) {
      console.error(e)
      setProfileSaveState('error')
      setProfileSaveError(e.message || 'Failed to save profile')
      showToast('Failed to save profile')
    }
  }

  const dataUrlToPngBlob = (dataUrl) => {
    const [meta, b64] = String(dataUrl || '').split(',')
    if (!b64) throw new Error('Invalid image data')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const mime = meta?.match(/data:([^;]+);base64/)?.[1] || 'image/png'
    return new Blob([bytes], { type: mime })
  }

  const urlToBlob = async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch image from URL')
    return await response.blob()
  }

  const persistGeneratedImage = async ({ prompt, model, dataUrl }) => {
    // Best-effort: store permanently in Supabase if enabled, otherwise local-only
    if (!dbEnabled) return { ok: false, reason: 'db_disabled' }
    
    let blob
    const isDataUrl = String(dataUrl || '').startsWith('data:')
    
    if (isDataUrl) {
      blob = dataUrlToPngBlob(dataUrl)
    } else {
      // It's a regular URL - fetch it and convert to blob
      blob = await urlToBlob(dataUrl)
    }
    
    const bucket = 'generated-images'
    const path = `${authUser.id}/${crypto.randomUUID()}.png`

    // Upload to Storage
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || 'image/png',
      upsert: false,
    })
    if (upErr) throw upErr

    // Insert DB row
    const { data, error } = await supabase
      .from('generated_images')
      .insert({
        owner_user_id: authUser.id,
        prompt: String(prompt || '').trim(),
        model: model || imageGenModel || 'dall-e-3',
        parameters: { source: 'chat' },
        storage_bucket: bucket,
        storage_path: path,
      })
      .select('image_id,prompt,model,storage_bucket,storage_path,created_at')
      .single()
    if (error) throw error

    // Refresh gallery list
    loadGeneratedImages().catch(() => {})
    return { ok: true, row: data }
  }

  const deleteGeneratedImage = async (imageId, storageBucket, storagePath) => {
    if (!dbEnabled) return
    try {
      // Delete from storage first
      if (storagePath) {
        const bucket = storageBucket || 'generated-images'
        await supabase.storage.from(bucket).remove([storagePath])
      }
      // Delete from database
      const { error } = await supabase
        .from('generated_images')
        .delete()
        .eq('image_id', imageId)
        .eq('owner_user_id', authUser.id)
      if (error) throw error
      
      // Update local state
      setGeneratedImages(prev => prev.filter(img => img.image_id !== imageId))
      showToast('Image deleted')
    } catch (e) {
      console.error('Failed to delete image:', e)
      showToast('Failed to delete image: ' + (e.message || 'Unknown error'))
    }
  }

  const downloadImage = async (imageUrl, prompt) => {
    // Create a filename from the prompt or use a default
    const filename = (prompt || 'generated-image')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50) + '.png'

    // Use canvas approach to bypass CORS and force download
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(blobUrl)
            showToast('Image downloaded!')
          } else {
            throw new Error('Failed to create blob')
          }
        }, 'image/png')
      } catch (e) {
        console.error('Canvas download failed:', e)
        // Fallback: open in new tab
        window.open(imageUrl, '_blank')
        showToast('Image opened in new tab - right-click to save')
      }
    }
    
    img.onerror = () => {
      console.error('Image load failed, opening in new tab')
      window.open(imageUrl, '_blank')
      showToast('Image opened in new tab - right-click to save')
    }
    
    // Add cache buster to avoid CORS caching issues
    const separator = imageUrl.includes('?') ? '&' : '?'
    img.src = imageUrl + separator + 't=' + Date.now()
  }

  const buildUserProfileBlock = () => {
    if (!authUser) return ''
    const name = profileDraft.display_name?.trim() || profileRow?.display_name || authUser.email?.split('@')?.[0] || 'User'
    const parts = []
    parts.push(`- name: ${name}`)
    if (profileDraft.role?.trim()) parts.push(`- role: ${profileDraft.role.trim()}`)
    if (profileDraft.timezone?.trim()) parts.push(`- timezone: ${profileDraft.timezone.trim()}`)
    if (profileDraft.about?.trim()) parts.push(`- about: ${profileDraft.about.trim()}`)
    return parts.length ? `User profile:\n${parts.join('\n')}` : ''
  }

  const formatNumber = (value) => {
    if (value == null || Number.isNaN(value)) return '0'
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
  }

  const getEffectiveRatesForUser = (userId) => {
    const userRates = adminUserRates[userId] || {}
    const inputCost =
      userRates.inputCost !== '' && userRates.inputCost != null
        ? Number(userRates.inputCost || 0)
        : Number(adminRates.inputCost || 0)
    const outputCost =
      userRates.outputCost !== '' && userRates.outputCost != null
        ? Number(userRates.outputCost || 0)
        : Number(adminRates.outputCost || 0)
    return { inputCost, outputCost }
  }

  const calculateCost = (inputTokens, outputTokens, userId) => {
    const rates = getEffectiveRatesForUser(userId)
    const inputCost = (Number(inputTokens || 0) / 1_000_000) * Number(rates.inputCost || 0)
    const outputCost = (Number(outputTokens || 0) / 1_000_000) * Number(rates.outputCost || 0)
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    }
  }

  const getUserRateValue = (userId, field) => {
    const value = adminUserRates[userId]?.[field]
    if (value == null) return ''
    return String(value)
  }

  const loadAdminData = async () => {
    if (!dbEnabled || !isAdmin) return
    setAdminLoading(true)
    setAdminError('')
    try {
      const [
        { data: profilesData, error: profilesError },
        { data: usageData, error: usageError },
        { data: modelUsageData, error: modelUsageError },
        { data: pricingData, error: pricingError },
        { data: settingsData, error: settingsError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id,display_name,email,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('user_usage')
          .select('user_id,input_tokens,output_tokens,updated_at'),
        supabase
          .from('user_usage_models')
          .select('user_id,model,input_tokens,output_tokens,updated_at'),
        supabase
          .from('user_pricing')
          .select('user_id,input_cost_per_million,output_cost_per_million,updated_at'),
        supabase
          .from('admin_settings')
          .select('input_cost_per_million,output_cost_per_million')
          .eq('id', 1)
          .maybeSingle()
      ])

      if (profilesError) throw profilesError
      if (usageError) throw usageError
      if (modelUsageError) throw modelUsageError
      if (pricingError) throw pricingError
      if (settingsError) throw settingsError

      setAdminUsers(profilesData || [])
      setAdminUsage(usageData || [])
      setAdminUsageModels(modelUsageData || [])
      const pricingMap = {}
      ;(pricingData || []).forEach((row) => {
        pricingMap[row.user_id] = {
          inputCost: row.input_cost_per_million ?? '',
          outputCost: row.output_cost_per_million ?? '',
        }
      })
      setAdminUserRates(pricingMap)
      if (settingsData) {
        setAdminRates({
          inputCost: Number(settingsData.input_cost_per_million || 0),
          outputCost: Number(settingsData.output_cost_per_million || 0),
        })
      }
    } catch (err) {
      console.error('Admin load failed:', err)
      setAdminError(err.message || 'Failed to load admin data')
    } finally {
      setAdminLoading(false)
    }
  }

  const saveAdminRates = async () => {
    if (!dbEnabled || !isAdmin) return
    setAdminSavingRates(true)
    setAdminError('')
    try {
      const payload = {
        id: 1,
        input_cost_per_million: Number(adminRates.inputCost || 0),
        output_cost_per_million: Number(adminRates.outputCost || 0),
      }
      const { error } = await supabase.from('admin_settings').upsert(payload)
      if (error) throw error
      showToast('Rates updated')
      await loadAdminData()
    } catch (err) {
      console.error('Failed to save rates:', err)
      setAdminError(err.message || 'Failed to save rates')
    } finally {
      setAdminSavingRates(false)
    }
  }

  const saveUserRates = async (userId) => {
    if (!dbEnabled || !isAdmin || !userId) return
    setAdminSavingUsers((prev) => ({ ...prev, [userId]: true }))
    setAdminError('')
    try {
      const rates = adminUserRates[userId] || {}
      const payload = {
        user_id: userId,
        input_cost_per_million: rates.inputCost === '' ? null : Number(rates.inputCost || 0),
        output_cost_per_million: rates.outputCost === '' ? null : Number(rates.outputCost || 0),
      }
      const { error } = await supabase.from('user_pricing').upsert(payload)
      if (error) throw error
      showToast('User rates updated')
      await loadAdminData()
    } catch (err) {
      console.error('Failed to save user rates:', err)
      setAdminError(err.message || 'Failed to save user rates')
    } finally {
      setAdminSavingUsers((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const recordUsage = async (usage, modelId) => {
    if (!dbEnabled || !authUser?.id) return
    const { inputTokens, outputTokens } = normalizeTokenUsage(usage)
    if (!inputTokens && !outputTokens) return
    try {
      const { error } = await supabase.rpc('increment_user_usage_model', {
        p_user_id: authUser.id,
        p_model: String(modelId || 'unknown'),
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      })
      if (error) throw error
    } catch (err) {
      console.error('Failed to record usage:', err)
    }
  }

  const loadChatsFromDb = async () => {
    const { data, error } = await supabase
      .from('chats')
      .select('chat_id,title,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data || []).map((c) => ({ id: c.chat_id, title: c.title, messages: [] }))
  }

  const loadMessagesFromDb = async (chatId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('message_id,role,content,metadata,created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map((m) => {
      if (m.metadata?.content_type === 'search' && m.metadata?.search_html) {
        return {
          id: m.message_id,
          role: m.role,
          content: { type: 'search', html: m.metadata.search_html, query: m.metadata.search_query || '' },
        }
      }
      return { id: m.message_id, role: m.role, content: m.content }
    })
  }

  const createChatInDb = async () => {
    const { data, error } = await supabase
      .from('chats')
      .insert({ owner_user_id: authUser.id, title: 'New chat' })
      .select('chat_id,title')
      .single()
    if (error) throw error
    return { id: data.chat_id, title: data.title, messages: [] }
  }

  const deleteChatInDb = async (chatId) => {
    const { error } = await supabase.from('chats').delete().eq('chat_id', chatId)
    if (error) throw error
  }

  const insertMessageInDb = async (chatId, role, content) => {
    const isSearch = content?.type === 'search'
    const payload = {
      chat_id: chatId,
      role,
      content: isSearch ? (content.query || '') : String(content ?? ''),
      metadata: isSearch
        ? { content_type: 'search', search_html: content.html, search_query: content.query }
        : {},
    }
    const { data, error } = await supabase.from('messages').insert(payload).select('message_id').single()
    if (error) throw error
    return data.message_id
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [currentConversation?.messages, isTyping])

  useEffect(() => {
    if (!showCodeChat) return
    if (!codeChatAutoScroll) return
    const raf = requestAnimationFrame(() => {
      codeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [codeMessages, codeGenerating, showCodeChat, codeChatAutoScroll])

  // Always follow new messages and typing indicator in coder chat
  useEffect(() => {
    setCodeChatAutoScroll(true)
  }, [codeMessages.length, codeGenerating])

  // DB mode: load chats once authenticated
  useEffect(() => {
    if (!dbEnabled) return
    ;(async () => {
      try {
        const chats = await loadChatsFromDb()
        if (chats.length === 0) {
          // No chats - just show welcome screen, don't auto-create
          setConversations([])
          setActiveConversation(null)
          return
        }
        setConversations(chats)
        // Keep current selection if it exists in loaded chats, otherwise show welcome screen
        setActiveConversation((prev) => (prev && chats.some(c => c.id === prev) ? prev : null))
      } catch (e) {
        console.error(e)
        showToast('Failed to load chats')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEnabled, authUser?.id])

  // DB mode: load messages for active chat
  useEffect(() => {
    if (!dbEnabled || !activeConversation) return
    ;(async () => {
      try {
        const msgs = await loadMessagesFromDb(activeConversation)
        setConversations(prev =>
          prev.map(c => (c.id === activeConversation ? { ...c, messages: msgs } : c))
        )
      } catch (e) {
        console.error(e)
        showToast('Failed to load messages')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEnabled, activeConversation])

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem('n8nWebhookUrl', n8nWebhookUrl)
  }, [n8nWebhookUrl])

  // Load projects when user changes (stored in Supabase)
  useEffect(() => {
    if (!authUser?.id) {
      setProjects([])
      setSelectedProjectId(null)
      return
    }
    // Only load from DB if Supabase is configured
    if (dbEnabled) {
      loadProjectsFromDb()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, dbEnabled])

  const loadAgentsFromDb = async () => {
    if (!dbEnabled || !authUser?.id) return
    try {
      const { data, error } = await supabase
        .from('user_agents')
        .select('agent_id,provider,name,model,config')
        .eq('owner_user_id', authUser.id)
        .order('created_at', { ascending: true })
      if (error) throw error

      const n8n = []
      const or = []
      const lm = []
      let legacySelectedId = profileRow?.settings?.selected_agent_id || null
      let legacyMatch = null
      ;(data || []).forEach((row) => {
        const config = row.config && typeof row.config === 'object' ? row.config : {}
        if (row.provider === 'n8n') {
          const agent = {
            id: row.agent_id,
            legacyId: config.legacy_id || null,
            name: row.name,
            description: config.description || 'No description',
            tags: Array.isArray(config.tags) ? config.tags : [],
            webhookUrl: config.webhookUrl || '',
            systemPrompt: config.systemPrompt || ''
          }
          n8n.push(agent)
          if (!legacyMatch && legacySelectedId && agent.legacyId === legacySelectedId) legacyMatch = agent
        } else if (row.provider === 'openrouter') {
          const agent = {
            id: row.agent_id,
            provider: 'openrouter',
            legacyId: config.legacy_id || null,
            name: row.name,
            model: row.model || '',
            systemPrompt: config.systemPrompt || 'You are a helpful assistant.',
            temperature: Number(config.temperature ?? 0.7),
          }
          or.push(agent)
          if (!legacyMatch && legacySelectedId && agent.legacyId === legacySelectedId) legacyMatch = agent
        } else if (row.provider === 'lmstudio') {
          const agent = {
            id: row.agent_id,
            provider: 'lmstudio',
            legacyId: config.legacy_id || null,
            name: row.name,
            model: row.model || '',
            baseUrl: config.baseUrl || '',
            apiKey: config.apiKey || '',
            systemPrompt: config.systemPrompt || 'You are a helpful assistant.',
            temperature: Number(config.temperature ?? 0.7),
          }
          lm.push(agent)
          if (!legacyMatch && legacySelectedId && agent.legacyId === legacySelectedId) legacyMatch = agent
        }
      })

      // If no rows and localStorage exists, migrate once
      if ((data || []).length === 0) {
        const userAgentsKey = `agents_${authUser.id}`
        const userSelectedKey = `selectedAgent_${authUser.id}`
        const localAgents = localStorage.getItem(userAgentsKey)
        const localSelected = localStorage.getItem(userSelectedKey)
        const localOpenRouter = localStorage.getItem(`openRouterAgents_${authUser.id}`)
        const localLmStudio = localStorage.getItem(`lmStudioAgents_${authUser.id}`)

        if (localAgents || localOpenRouter || localLmStudio) {
          const migratedAgents = localAgents ? JSON.parse(localAgents) : []
          const migratedOR = localOpenRouter ? JSON.parse(localOpenRouter) : []
          const migratedLM = localLmStudio ? JSON.parse(localLmStudio) : []
          setAgents(migratedAgents)
          setOpenRouterAgents(migratedOR)
          setLmStudioAgents(migratedLM)
          if (localSelected) setSelectedAgent(JSON.parse(localSelected))
          agentsLoadedRef.current = true
          await syncAgentsToDb(migratedAgents, migratedOR, migratedLM)
          return
        }
      }

      setAgents(n8n)
      setOpenRouterAgents(or)
      setLmStudioAgents(lm)
      if (legacyMatch) {
        setSelectedAgent(legacyMatch)
        const nextSettings = {
          ...(profileRow?.settings && typeof profileRow.settings === 'object' ? profileRow.settings : {}),
          selected_agent_id: legacyMatch.id
        }
        await supabase
          .from('profiles')
          .update({ settings: nextSettings })
          .eq('user_id', authUser.id)
      }
      agentsLoadedRef.current = true
    } catch (e) {
      console.error('Failed to load agents:', e)
      showToast('Failed to load agents')
    }
  }

  const syncAgentsToDb = async (n8nAgents, openRouterList, lmStudioList) => {
    if (!dbEnabled || !authUser?.id) return
    const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val || '')
    const rows = []
    ;(n8nAgents || []).forEach((a) => {
      const legacyId = a.id && !isUuid(a.id) ? a.id : null
      rows.push({
        agent_id: isUuid(a.id) ? a.id : crypto.randomUUID(),
        owner_user_id: authUser.id,
        provider: 'n8n',
        name: a.name || 'Agent',
        model: null,
        config: {
          description: a.description || '',
          tags: Array.isArray(a.tags) ? a.tags : [],
          webhookUrl: a.webhookUrl || '',
          systemPrompt: a.systemPrompt || '',
          legacy_id: legacyId
        }
      })
    })
    ;(openRouterList || []).forEach((a) => {
      const legacyId = a.id && !isUuid(a.id) ? a.id : null
      rows.push({
        agent_id: isUuid(a.id) ? a.id : crypto.randomUUID(),
        owner_user_id: authUser.id,
        provider: 'openrouter',
        name: a.name || 'OpenRouter Agent',
        model: a.model || '',
        config: {
          systemPrompt: a.systemPrompt || '',
          temperature: Number(a.temperature ?? 0.7),
          legacy_id: legacyId
        }
      })
    })
    ;(lmStudioList || []).forEach((a) => {
      const legacyId = a.id && !isUuid(a.id) ? a.id : null
      rows.push({
        agent_id: isUuid(a.id) ? a.id : crypto.randomUUID(),
        owner_user_id: authUser.id,
        provider: 'lmstudio',
        name: a.name || 'LM Studio Agent',
        model: a.model || '',
        config: {
          baseUrl: a.baseUrl || '',
          apiKey: a.apiKey || '',
          systemPrompt: a.systemPrompt || '',
          temperature: Number(a.temperature ?? 0.7),
          legacy_id: legacyId
        }
      })
    })

    await supabase.from('user_agents').delete().eq('owner_user_id', authUser.id)
    if (rows.length > 0) {
      const { error } = await supabase.from('user_agents').insert(rows)
      if (error) throw error
    }
  }

  // Load agents when user changes (Supabase-backed)
  useEffect(() => {
    if (!authUser?.id) {
      setAgents([])
      setOpenRouterAgents([])
      setLmStudioAgents([])
      setSelectedAgent(null)
      agentsLoadedRef.current = false
      return
    }
    if (dbEnabled) {
      loadAgentsFromDb()
    } else {
      const userAgentsKey = `agents_${authUser.id}`
      const userSelectedKey = `selectedAgent_${authUser.id}`
      const savedAgents = localStorage.getItem(userAgentsKey)
      const savedSelected = localStorage.getItem(userSelectedKey)
      setAgents(savedAgents ? JSON.parse(savedAgents) : [])
      setSelectedAgent(savedSelected ? JSON.parse(savedSelected) : null)
      const savedOR = localStorage.getItem(`openRouterAgents_${authUser.id}`)
      const savedLM = localStorage.getItem(`lmStudioAgents_${authUser.id}`)
      setOpenRouterAgents(savedOR ? JSON.parse(savedOR) : [])
      setLmStudioAgents(savedLM ? JSON.parse(savedLM) : [])
      agentsLoadedRef.current = true
    }
  }, [authUser?.id, dbEnabled])

  // Persist agents to Supabase
  useEffect(() => {
    if (!dbEnabled || !authUser?.id) return
    if (!agentsLoadedRef.current) return
    if (agentsSyncTimeoutRef.current) clearTimeout(agentsSyncTimeoutRef.current)
    agentsSyncTimeoutRef.current = setTimeout(() => {
      syncAgentsToDb(agents, openRouterAgents, lmStudioAgents).catch((e) => {
        console.error('Failed to sync agents:', e)
      })
    }, 500)
    return () => {
      if (agentsSyncTimeoutRef.current) clearTimeout(agentsSyncTimeoutRef.current)
    }
  }, [agents, openRouterAgents, lmStudioAgents, dbEnabled, authUser?.id])

  // Save selected agent to profile settings (Supabase)
  useEffect(() => {
    if (!dbEnabled || !authUser?.id || !profileRow) return
    const current = profileRow.settings?.selected_agent_id || null
    const next = selectedAgent?.id || null
    if (current === next) return
    const nextSettings = {
      ...(profileRow.settings && typeof profileRow.settings === 'object' ? profileRow.settings : {}),
      selected_agent_id: next
    }
    supabase
      .from('profiles')
      .update({ settings: nextSettings })
      .eq('user_id', authUser.id)
      .select('user_id,display_name,avatar_url,settings')
      .single()
      .then(({ data }) => {
        if (data) setProfileRow(data)
      })
      .catch((e) => console.error('Failed to save selected agent:', e))
  }, [selectedAgent?.id, dbEnabled, authUser?.id, profileRow])


  useEffect(() => {
    localStorage.setItem('searchUrl', searchUrl)
  }, [searchUrl])

  useEffect(() => {
    if (!showDeepResearchPage) return
    deepResearchEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [deepResearchMessages, deepResearchTyping, showDeepResearchPage])

  // Persist deep research conversations
  useEffect(() => {
    localStorage.setItem('deepResearchConversations', JSON.stringify(deepResearchConversations))
  }, [deepResearchConversations])

  // Persist deep research page state for refresh
  useEffect(() => {
    sessionStorage.setItem('showDeepResearchPage', showDeepResearchPage ? 'true' : 'false')
  }, [showDeepResearchPage])

  useEffect(() => {
    sessionStorage.setItem('activeDeepResearchId', activeDeepResearchId || '')
  }, [activeDeepResearchId])


  useEffect(() => {
    localStorage.setItem('openRouterApiKey', openRouterApiKey)
  }, [openRouterApiKey])

  // Load openRouterAgents from localStorage only when DB disabled
  useEffect(() => {
    if (dbEnabled) return
    if (!authUser?.id) {
      setOpenRouterAgents([])
      return
    }
    const key = `openRouterAgents_${authUser.id}`
    const saved = localStorage.getItem(key)
    setOpenRouterAgents(saved ? JSON.parse(saved) : [])
  }, [authUser?.id, dbEnabled])

  // Save openRouterAgents to localStorage only when DB disabled
  useEffect(() => {
    if (dbEnabled) return
    if (!authUser?.id) return
    localStorage.setItem(`openRouterAgents_${authUser.id}`, JSON.stringify(openRouterAgents))
  }, [openRouterAgents, authUser?.id, dbEnabled])

  // Persist LM Studio settings to localStorage
  useEffect(() => {
    localStorage.setItem('lmStudioBaseUrl', lmStudioBaseUrl)
  }, [lmStudioBaseUrl])

  useEffect(() => {
    localStorage.setItem('lmStudioApiKey', lmStudioApiKey)
  }, [lmStudioApiKey])

  useEffect(() => {
    localStorage.setItem('lmStudioConnectState', lmStudioConnectState)
  }, [lmStudioConnectState])

  useEffect(() => {
    localStorage.setItem('lmStudioModels', JSON.stringify(lmStudioModels))
  }, [lmStudioModels])

  // Load lmStudioAgents from localStorage only when DB disabled
  useEffect(() => {
    if (dbEnabled) return
    if (!authUser?.id) {
      setLmStudioAgents([])
      return
    }
    const key = `lmStudioAgents_${authUser.id}`
    const saved = localStorage.getItem(key)
    setLmStudioAgents(saved ? JSON.parse(saved) : [])
  }, [authUser?.id, dbEnabled])

  // Save lmStudioAgents to localStorage only when DB disabled
  useEffect(() => {
    if (dbEnabled) return
    if (!authUser?.id) return
    localStorage.setItem(`lmStudioAgents_${authUser.id}`, JSON.stringify(lmStudioAgents))
  }, [lmStudioAgents, authUser?.id, dbEnabled])

  useEffect(() => {
    localStorage.setItem('openRouterModels', JSON.stringify(openRouterModels))
  }, [openRouterModels])

  useEffect(() => {
    localStorage.setItem('openRouterConnectState', openRouterConnectState)
  }, [openRouterConnectState])

  useEffect(() => {
    localStorage.setItem('openAiApiKey', openAiApiKey)
  }, [openAiApiKey])

  useEffect(() => {
    localStorage.setItem('mcpServers', JSON.stringify(mcpServers))
  }, [mcpServers])

  useEffect(() => {
    localStorage.setItem('ocrModel', ocrModel)
  }, [ocrModel])

  useEffect(() => {
    localStorage.setItem('ocrAutoProcessChatUploads', ocrAutoProcessChatUploads.toString())
  }, [ocrAutoProcessChatUploads])

  useEffect(() => {
    localStorage.setItem('ocrAutoIngestToRag', ocrAutoIngestToRag.toString())
  }, [ocrAutoIngestToRag])

  useEffect(() => {
    localStorage.setItem('ocrAutoPostSummaryToChat', ocrAutoPostSummaryToChat.toString())
  }, [ocrAutoPostSummaryToChat])

  useEffect(() => {
    localStorage.setItem('imageGenModel', imageGenModel)
  }, [imageGenModel])

  useEffect(() => {
    localStorage.setItem('autoImageGenFromChat', autoImageGenFromChat.toString())
  }, [autoImageGenFromChat])

  const filteredOpenRouterModels = useMemo(() => {
    const q = openRouterModelFilter.trim() // case-sensitive search
    const sorted = [...(openRouterModels || [])].sort((a, b) => {
      const aid = a?.id || ''
      const bid = b?.id || ''
      return aid.localeCompare(bid, undefined, { numeric: true })
    })

    if (!q) return sorted

    return sorted.filter((m) => {
      const id = m?.id || ''
      const name = m?.name || ''
      const desc = m?.description || ''
      return id.includes(q) || name.includes(q) || desc.includes(q)
    })
  }, [openRouterModels, openRouterModelFilter])

  const normalizeOpenAiCompatibleBaseUrl = (raw) => {
    const v = String(raw || '').trim()
    if (!v) return ''
    // Ensure it ends with /v1 for OpenAI-compatible servers (LM Studio, etc.)
    if (/\/v1\/?$/.test(v)) return v.replace(/\/+$/, '')
    return v.replace(/\/+$/, '') + '/v1'
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

  const buildSearchApiUrl = (rawBase, query) => {
    const base = normalizeSearchBaseUrl(rawBase)
    if (!base) return ''
    const url = new URL(`${base}/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    return url.toString()
  }

  const buildSearchProxyUrl = (rawBase, query) => {
    const base = normalizeSearchBaseUrl(rawBase)
    const url = new URL('/api/search', window.location.origin)
    if (base) url.searchParams.set('base', base)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    return url.toString()
  }

  const filteredLmStudioModels = useMemo(() => {
    const q = (lmStudioModelFilter || '').trim().toLowerCase()
    const sorted = [...(lmStudioModels || [])].sort((a, b) => {
      const aid = a?.id || ''
      const bid = b?.id || ''
      return aid.localeCompare(bid, undefined, { numeric: true })
    })
    if (!q) return sorted
    return sorted.filter((m) => {
      const id = (m?.id || '').toLowerCase()
      const name = (m?.name || '').toLowerCase()
      return id.includes(q) || name.includes(q)
    })
  }, [lmStudioModels, lmStudioModelFilter])

  const allAgents = useMemo(() => {
    const n8nAgents = (agents || []).map(a => ({ ...a, provider: a.provider || 'n8n' }))
    const orAgents = (openRouterAgents || []).map(a => ({ ...a, provider: 'openrouter' }))
    const lmAgents = (lmStudioAgents || []).map(a => ({ ...a, provider: 'lmstudio' }))
    return [...orAgents, ...lmAgents, ...n8nAgents]
  }, [agents, openRouterAgents, lmStudioAgents])

  useEffect(() => {
    if (!dbEnabled || !profileRow?.settings) return
    if (selectedAgent?.id) return
    const selectedId = profileRow.settings.selected_agent_id
    if (!selectedId) return
    const match = allAgents.find(a => a.id === selectedId)
    if (match) setSelectedAgent(match)
  }, [dbEnabled, profileRow?.settings, allAgents, selectedAgent?.id])

  // Function to handle opening file in code editor - called by event handler
  const openFileInCodeEditor = useRef((filename, code, language, conversationId, conversationTitle) => {
    // This ref will be updated with the actual function after component definitions
  })

  // Function to add code to canvas - called by event handler
  const addCodeToCanvas = useRef((code, language) => {
    const l = (language || '').toLowerCase()
    const target =
      ['css', 'scss'].includes(l) ? 'css'
        : ['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript'].includes(l) ? 'js'
          : 'html'

    const separator =
      target === 'html'
        ? '\n<!-- --- Added code block --- -->\n'
        : target === 'css'
          ? '\n\n/* --- Added code block --- */\n'
          : '\n\n// --- Added code block ---\n'

    setCanvasFiles(prev => {
      const existing = prev[target] || ''
      const next = existing.trim() ? existing + separator + code : code
      return { ...prev, [target]: next }
    })

    setCanvasActiveTab(target)
    setCanvasOpen(true)
  })

  // Set up click handlers for code blocks and file cards using event delegation
  useEffect(() => {
    const handleCodeBlockClick = (e) => {
      // Handle copy button click (code block) - plain text only
      const copyBtn = e.target.closest('.code-block-copy')
      if (copyBtn) {
        const wrapper = copyBtn.closest('.code-block-wrapper')
        const codeElement = wrapper?.querySelector('code')
        if (codeElement) {
          const text = codeElement.textContent
          // Use ClipboardItem for plain text (no formatting/background)
          if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
            const blob = new Blob([text], { type: 'text/plain' })
            const item = new ClipboardItem({ 'text/plain': blob })
            navigator.clipboard.write([item]).then(() => {
              copyBtn.classList.add('copied')
              setTimeout(() => copyBtn.classList.remove('copied'), 2000)
            })
          } else {
            navigator.clipboard.writeText(text).then(() => {
              copyBtn.classList.add('copied')
              setTimeout(() => copyBtn.classList.remove('copied'), 2000)
            })
          }
        }
        return
      }

      // Handle save to library button click
      const saveBtn = e.target.closest('.code-block-save')
      if (saveBtn) {
        const wrapper = saveBtn.closest('.code-block-wrapper')
        const codeElement = wrapper?.querySelector('code')
        const langElement = wrapper?.querySelector('.code-block-lang')
        if (codeElement) {
          const rawB64 = codeElement.dataset.raw
          const code = rawB64 ? safeAtob(rawB64) : codeElement.textContent
          const language = codeElement.dataset.lang || 'text'
          const displayLang = langElement?.textContent || language

          // Trigger save via ref to get latest function
          if (saveCodeArtifactRef.current) {
            saveCodeArtifactRef.current(code, language, displayLang)
          }

          // Visual feedback
          saveBtn.classList.add('saved')
          setTimeout(() => saveBtn.classList.remove('saved'), 1500)
        }
        return
      }

      // Handle add to canvas button click
      const canvasBtn = e.target.closest('.code-block-canvas')
      if (canvasBtn) {
        const wrapper = canvasBtn.closest('.code-block-wrapper')
        const codeElement = wrapper?.querySelector('code')
        if (codeElement) {
          const rawB64 = codeElement.dataset.raw
          const code = rawB64 ? safeAtob(rawB64) : codeElement.textContent
          const language = codeElement.dataset.lang || 'html'

          console.log('Canvas button clicked, adding:', language)
          addCodeToCanvas.current(code, language)

          // Visual feedback
          canvasBtn.classList.add('added')
          setTimeout(() => canvasBtn.classList.remove('added'), 1500)
        }
        return
      }

      // Handle "Open" button click on file card
      const openBtn = e.target.closest('.code-file-open')
      if (openBtn) {
        const card = openBtn.closest('.code-file-card')
        if (card) {
          const filename = card.dataset.filename
          const rawB64 = card.dataset.raw
          const lang = card.dataset.lang
          const code = rawB64 ? safeAtob(rawB64) : ''

          // Find conversation context from the message element
          const messageEl = card.closest('.message')
          const conversationId = messageEl?.dataset?.conversationId

          openFileInCodeEditor.current(filename, code, lang, conversationId, null)

          // Visual feedback
          openBtn.textContent = 'Opened!'
          setTimeout(() => { openBtn.textContent = 'Open' }, 1500)
        }
        return
      }

      // Handle "Copy" button click on file card - plain text only
      const fileCopyBtn = e.target.closest('.code-file-copy')
      if (fileCopyBtn) {
        const card = fileCopyBtn.closest('.code-file-card')
        if (card) {
          const rawB64 = card.dataset.raw
          const code = rawB64 ? safeAtob(rawB64) : ''
          // Use ClipboardItem for plain text (no formatting/background)
          if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
            const blob = new Blob([code], { type: 'text/plain' })
            const item = new ClipboardItem({ 'text/plain': blob })
            navigator.clipboard.write([item]).then(() => {
              fileCopyBtn.textContent = 'Copied!'
              setTimeout(() => { fileCopyBtn.textContent = 'Copy' }, 2000)
            })
          } else {
            navigator.clipboard.writeText(code).then(() => {
              fileCopyBtn.textContent = 'Copied!'
              setTimeout(() => { fileCopyBtn.textContent = 'Copy' }, 2000)
            })
          }
        }
        return
      }
    }

    document.addEventListener('click', handleCodeBlockClick)
    return () => {
      document.removeEventListener('click', handleCodeBlockClick)
    }
  }, [])

  const activeCanvasCode = canvasFiles[canvasActiveTab] || ''

  const highlightedCanvasHtml = useMemo(() => {
    const escaped = escapeHtmlText(activeCanvasCode)
    const highlighted = highlightCode(escaped, canvasActiveTab)
    // Keep the highlight layer aligned with textarea line wrapping
    return highlighted
  }, [activeCanvasCode, canvasActiveTab])

  const getLanguageFromFilename = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase()
    const map = {
      js: 'javascript', jsx: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      html: 'html', htm: 'html',
      css: 'css', scss: 'scss', sass: 'scss',
      json: 'json', md: 'markdown', py: 'python',
      sh: 'bash', yaml: 'yaml', yml: 'yaml'
    }
    return map[ext] || ext || 'text'
  }

  const activeLocalTab = useMemo(
    () => openTabs.find(t => t.id === activeTabId) || null,
    [openTabs, activeTabId]
  )
  const activeLocalLang = useMemo(
    () => getLanguageFromFilename(activeLocalTab?.name),
    [activeLocalTab]
  )
  const highlightedEditorHtml = useMemo(() => {
    const escaped = escapeHtmlText(editorContent || '')
    return highlightCode(escaped, activeLocalLang)
  }, [editorContent, activeLocalLang])

  const activeGithubTab = useMemo(
    () => githubOpenTabs.find(t => t.id === githubActiveTabId) || null,
    [githubOpenTabs, githubActiveTabId]
  )
  const activeGithubLang = useMemo(
    () => getLanguageFromFilename(activeGithubTab?.name || selectedFile?.name),
    [activeGithubTab, selectedFile]
  )
  const highlightedGithubEditHtml = useMemo(() => {
    const escaped = escapeHtmlText(githubEditContent || '')
    return highlightCode(escaped, activeGithubLang)
  }, [githubEditContent, activeGithubLang])

  const syncCanvasScroll = () => {
    const ta = canvasEditorRef.current
    const pre = canvasHighlightRef.current
    if (!ta || !pre) return
    pre.scrollTop = ta.scrollTop
    pre.scrollLeft = ta.scrollLeft
  }

  // Run code in canvas iframe (opens preview modal)
  const runCanvasCode = () => {
    setPreviewOpen(true)
    // Wait for modal to render, then write to iframe
    setTimeout(() => {
      if (!canvasIframeRef.current) return
      
      const iframe = canvasIframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow.document

      const html = canvasFiles.html || ''
      const css = canvasFiles.css || ''
      const js = (canvasFiles.js || '').replace(/<\/script>/gi, '<\\/script>')

      const looksLikeFullDoc =
        /<!doctype/i.test(html) || /<html[\s>]/i.test(html) || /<head[\s>]/i.test(html) || /<body[\s>]/i.test(html)

      const errorWrapperStart = `try {\n`
      const errorWrapperEnd = `\n} catch(e) {\n  document.body.innerHTML = '<pre style="color:#dc2626;padding:20px;">Error: ' + e.message + '</pre>';\n}\n`

      let htmlContent = ''

      if (looksLikeFullDoc) {
        // Start from the provided full HTML document
        htmlContent = html

        // Remove common external placeholders so the combined inline CSS/JS wins
        htmlContent = htmlContent.replace(/<link[^>]*href=["']style\.css["'][^>]*>\s*/gi, '')
        htmlContent = htmlContent.replace(/<script[^>]*src=["']script\.js["'][^>]*>\s*<\/script>\s*/gi, '')

        // Inject CSS before </head>
        if (css.trim()) {
          if (/<\/head>/i.test(htmlContent)) {
            htmlContent = htmlContent.replace(/<\/head>/i, `<style>${css}</style></head>`)
          } else {
            htmlContent = `<style>${css}</style>\n` + htmlContent
          }
        }

        // Inject JS before </body> (wrapped with try/catch)
        if (js.trim()) {
          const scriptTag = `<script>\n${errorWrapperStart}${js}${errorWrapperEnd}</script>`
          if (/<\/body>/i.test(htmlContent)) {
            htmlContent = htmlContent.replace(/<\/body>/i, `${scriptTag}</body>`)
          } else {
            htmlContent = htmlContent + `\n${scriptTag}\n`
          }
        }
      } else {
        // Treat as fragment: wrap it
        const htmlBody = html.trim() ? html : '<div id="root"></div>'
        htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui;margin:0;padding:20px;background:#fff;color:#111;}
  </style>
  <style>${css}</style>
</head>
<body>
${htmlBody}
<script>
${errorWrapperStart}${js}${errorWrapperEnd}
</script>
</body>
</html>`
      }
      
      doc.open()
      doc.write(htmlContent)
      doc.close()
    }, 100)
  }

  const clearCanvas = () => {
    setCanvasFiles({ html: '', css: '', js: '' })
    setCanvasOpen(false)
    if (canvasIframeRef.current) {
      const doc = canvasIframeRef.current.contentDocument
      doc.open()
      doc.write('')
      doc.close()
    }
  }

  const createNewChat = () => {
    setShowDeepResearchPage(false)
    if (dbEnabled) {
      ;(async () => {
        try {
          const chat = await createChatInDb()
          setConversations(prev => [chat, ...prev])
          setActiveConversation(chat.id)
        } catch (e) {
          console.error(e)
          showToast('Failed to create chat')
        }
      })()
      return
    }

    const newId = crypto.randomUUID()
    setConversations(prev => [...prev, { id: newId, title: 'New chat', messages: [] }])
    setActiveConversation(newId)
  }

  const deleteConversation = (id) => {
    if (dbEnabled) {
      ;(async () => {
        try {
          await deleteChatInDb(id)
          startTransition(() => {
          setConversations(prev => {
            const next = prev.filter(c => c.id !== id)
              // If we deleted the active chat, switch to another or clear
            if (activeConversation === id) {
              const fallback = next[0]?.id ?? null
                startTransition(() => setActiveConversation(fallback)) // null if no chats left
            }
            return next
            })
          })
        } catch (e) {
          console.error(e)
          showToast('Failed to delete chat')
        }
      })()
      return
    }

    startTransition(() => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
        if (activeConversation === id) {
          startTransition(() => setActiveConversation(next[0]?.id ?? null)) // null if no chats left
        }
      return next
      })
    })
  }

  // Rename a chat
  const renameChat = async (chatId, newTitle) => {
    if (!newTitle.trim()) return
    
    if (dbEnabled) {
      try {
        await supabase
          .from('chats')
          .update({ title: newTitle.trim() })
          .eq('chat_id', chatId)
      } catch (e) {
        console.error('Failed to rename chat in DB:', e)
        showToast('Failed to rename chat')
        return
      }
    }
    
    setConversations(prev => prev.map(c => 
      c.id === chatId ? { ...c, title: newTitle.trim() } : c
    ))
    setRenamingChatId(null)
    setRenameChatTitle('')
    showToast('Chat renamed')
  }

  // Generate dynamic chat title using AI
  const generateChatTitle = async (chatId, firstMessage) => {
    if (!firstMessage) return
    
    // Try OpenRouter first if available, then OpenAI
    const hasOpenRouter = openRouterApiKey?.trim()
    const hasOpenAI = openAiApiKey?.trim()
    
    if (!hasOpenRouter && !hasOpenAI) {
      // Fallback: Generate simple title from first message
      const words = firstMessage.trim().split(/\s+/).slice(0, 5)
      const simpleTitle = words.join(' ') + (firstMessage.split(/\s+/).length > 5 ? '...' : '')
      if (simpleTitle && simpleTitle !== 'New chat') {
        setConversations(prev => prev.map(c => 
          c.id === chatId ? { ...c, title: simpleTitle.slice(0, 50) } : c
        ))
        if (dbEnabled) {
          supabase.from('chats').update({ title: simpleTitle.slice(0, 50) }).eq('chat_id', chatId).catch(() => {})
        }
      }
      return
    }
    
    try {
      const titlePrompt = 'Generate a short, concise title (3-6 words) for this chat. No quotes, no punctuation, no em dashes. Just the title.'
      
      let response
      if (hasOpenRouter) {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey.trim()}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Agent Me'
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
              { role: 'system', content: titlePrompt },
              { role: 'user', content: firstMessage.slice(0, 500) }
            ],
            max_tokens: 20,
            temperature: 0.7
          })
        })
      } else {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: titlePrompt },
              { role: 'user', content: firstMessage.slice(0, 500) }
            ],
            max_tokens: 20,
            temperature: 0.7
          })
        })
      }
      
      if (!response.ok) return
      
      const data = await response.json()
      let generatedTitle = data.choices?.[0]?.message?.content?.trim()
      
      // Clean up the title - remove quotes, em dashes
      if (generatedTitle) {
        generatedTitle = generatedTitle
          .replace(/^["']|["']$/g, '') // Remove surrounding quotes
          .replace(/—/g, '-') // Replace em dashes with hyphens
          .replace(/–/g, '-') // Replace en dashes with hyphens
          .slice(0, 50)
        
        // Update in DB if enabled
        if (dbEnabled) {
          await supabase
            .from('chats')
            .update({ title: generatedTitle })
            .eq('chat_id', chatId)
        }
        
        setConversations(prev => prev.map(c => 
          c.id === chatId ? { ...c, title: generatedTitle } : c
        ))
      }
    } catch (e) {
      console.error('Failed to generate chat title:', e)
    }
  }

  const simulateResponse = (userMessage) => {
    const responses = [
      "That's an interesting question! Let me think about that for a moment. Based on what you've shared, I can provide some helpful insights that might guide you in the right direction.",
      "I understand what you're asking. Here's my perspective on that topic. There are multiple angles to consider, and I'll try to cover the most important aspects for you.",
      "Great question! There are several ways to approach this. Let me break it down into manageable parts so you can better understand the concepts involved.",
      "I'd be happy to help you with that. Let me explain in detail. This is a topic that many people find interesting, and there's quite a bit to unpack here.",
      "That's a thoughtful observation. Here's what I think about it. The key considerations include both practical and theoretical aspects that we should explore.",
    ]
    return responses[Math.floor(Math.random() * responses.length)]
  }

  // Copy message to clipboard (plain text only, no formatting)
  const handleCopy = async (content, messageId) => {
    try {
      const text = typeof content === 'string' ? stripMarkdown(content) : String(content ?? '')
      // Use ClipboardItem API if available to ensure plain text only
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const blob = new Blob([text], { type: 'text/plain' })
        const item = new ClipboardItem({ 'text/plain': blob })
        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopiedMessageId(messageId)
      showToast('Copied to clipboard!')
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      // Fallback to execCommand for older browsers
      try {
        const textArea = document.createElement('textarea')
        textArea.value = typeof content === 'string' ? stripMarkdown(content) : String(content ?? '')
        textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setCopiedMessageId(messageId)
        showToast('Copied to clipboard!')
        setTimeout(() => setCopiedMessageId(null), 2000)
      } catch {
        showToast('Failed to copy')
      }
    }
  }

  // Intercept browser's native copy to force plain text (no background colors)
  useEffect(() => {
    const handleNativeCopy = (e) => {
      // Only intercept if copying from chat messages area
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return
      
      // Check if selection is within a message content area or chat container
      const anchorNode = selection.anchorNode
      const focusNode = selection.focusNode
      const isInMessage = (node) => {
        let el = node?.nodeType === 3 ? node.parentElement : node
        while (el) {
          if (el.classList?.contains('formatted-response') || 
              el.classList?.contains('message-content') ||
              el.classList?.contains('message-text') ||
              el.classList?.contains('code-block-wrapper') ||
              el.classList?.contains('chat-container') ||
              el.classList?.contains('message')) {
            return true
          }
          el = el.parentElement
        }
        return false
      }
      
      if (isInMessage(anchorNode) || isInMessage(focusNode)) {
        e.preventDefault()
        // Get plain text only and clear all other formats
        const plainText = selection.toString()
        // Clear clipboard and set only plain text (no HTML = no formatting/background)
        e.clipboardData.clearData()
        e.clipboardData.setData('text/plain', plainText)
        // Explicitly set empty HTML to prevent any styled content
        e.clipboardData.setData('text/html', plainText)
      }
    }
    
    document.addEventListener('copy', handleNativeCopy, true) // Use capture phase
    return () => document.removeEventListener('copy', handleNativeCopy, true)
  }, [])

  // Handle thumbs up/down reactions
  const handleReaction = (messageId, type) => {
    // Keep this super fast: avoid toasts (extra renders) and run as a transition.
    startTransition(() => {
    setReactions(prev => {
      const current = prev[messageId]
      if (current === type) {
          const next = { ...prev }
          delete next[messageId]
          return next
        }
      return { ...prev, [messageId]: type }
      })
    })
  }

  // Share/Export message
  const handleShare = async (content) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ChatGPT Response',
          text: content,
        })
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Fallback to copy
          await navigator.clipboard.writeText(content)
          showToast('Copied to clipboard!')
        }
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(content)
      showToast('Copied to clipboard!')
    }
  }

  // Regenerate response
  const handleRegenerate = (messageId) => {
    if (isTyping) return
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === activeConversation) {
        // Find the message index and get the user message before it
        const messageIndex = conv.messages.findIndex(m => m.id === messageId)
        if (messageIndex === -1) return conv
        
        // Remove the assistant message
        const newMessages = conv.messages.slice(0, messageIndex)
        return { ...conv, messages: newMessages }
      }
      return conv
    }))

    // Find the last user message
    const conv = conversations.find(c => c.id === activeConversation)
    const messageIndex = conv.messages.findIndex(m => m.id === messageId)
    const userMessage = conv.messages[messageIndex - 1]

    if (userMessage && userMessage.role === 'user') {
      setIsTyping(true)
      setTimeout(() => {
        const assistantMessage = {
          id: Date.now(),
          role: 'assistant',
          content: simulateResponse(userMessage.content)
        }

        setConversations(prev => prev.map(conv => {
          if (conv.id === activeConversation) {
            return {
              ...conv,
              messages: [...conv.messages, assistantMessage]
            }
          }
          return conv
        }))
        setIsTyping(false)
        setTypingStatus('')
        showToast('Response regenerated')
      }, 1000 + Math.random() * 1000)
    }
  }

  const handleSubmit = async (e, messageContent = null) => {
    if (e) e.preventDefault()
    // Get message content from parameter or from ref
    const inputText = messageContent || chatInputRef.current?.getValue() || ''
    if (!inputText.trim() || isTyping) return
 
    // New generation run (used to ignore late responses)
    const runId = ++generationRunIdRef.current
    // Cancel any previous run
    if (generationAbortRef.current) {
      try { generationAbortRef.current.abort() } catch {}
    }
    const abortController = new AbortController()
    generationAbortRef.current = abortController

    // If we're in DB mode and the user is on the welcome screen (no active chat),
    // create a chat first so message inserts pass RLS.
    let chatIdForThisTurn = activeConversation
    if (dbEnabled) {
      if (!authUser?.id) {
        showToast('Please sign in again')
        return
      }
      if (!chatIdForThisTurn) {
        try {
          const chat = await createChatInDb()
          setConversations((prev) => [chat, ...(Array.isArray(prev) ? prev : [])])
          setActiveConversation(chat.id)
          chatIdForThisTurn = chat.id
        } catch (err) {
          console.error(err)
          showToast('Failed to create chat')
          return
        }
      }
    }
 
    // Start building user message with potential attachments
    const userMessageBase = {
      id: Date.now(),
      role: 'user',
      content: inputText.trim()
    }

    let attachments = []
    
    // Helper to convert file to base64 data URL for persistence
    const fileToDataUrl = (file) => new Promise((resolve) => {
      if (!file.type?.startsWith('image/')) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
    
    // Handle file uploads - skip mock upload when using n8n agent
    if (attachedFiles.length > 0) {
      if (selectedAgent) {
        // When using n8n agent, convert images to base64 for persistence
        setAttachmentProgress({})
        attachments = await Promise.all(attachedFiles.map(async (a) => {
          const dataUrl = await fileToDataUrl(a.file)
          return {
          id: a.id,
          name: a.name,
          size: a.size,
          type: a.type,
            url: dataUrl || a.preview || null
          }
        }))
      } else {
        // For default model, try mock upload
        try {
          const mod = await (async () => {
            try {
              const m = await import('./utils/uploadMock.js')
              return m
            } catch (importErr) {
              console.error('Failed to import uploadMock:', importErr)
              throw new Error('File upload not available for default model')
            }
          })()
          
          const uploads = await Promise.all(
            attachedFiles.map(a => {
              if (a.size > 10 * 1024 * 1024) {
                throw new Error('One or more files exceed 10MB')
              }
              
              return new Promise(async (resolve) => {
                const total = 50 + Math.random() * 350
                let elapsed = 0
                const step = 20
                // Pre-convert to base64 for images
                const dataUrl = await fileToDataUrl(a.file)
                const tick = () => {
                  elapsed += step
                  const p = Math.min(100, Math.round((elapsed / total) * 100))
                  setAttachmentProgress(prev => ({ ...prev, [a.id]: p }))
                  if (p < 100) {
                    setTimeout(tick, 20)
                  } else {
                    // Create mock upload result with persistent data URL
                    resolve({
                      name: a.name,
                      size: a.size,
                      type: a.type,
                      url: dataUrl || a.preview || null
                    })
                  }
                }
                tick()
              })
            })
          )
          
          attachments = uploads.map((u, idx) => ({
            id: attachedFiles[idx].id,
            name: u.name,
            size: u.size,
            type: u.type,
            url: u.url
          }))
          
          setAttachmentProgress({})
        } catch (err) {
          console.error('Upload error:', err)
          showToast(err.message || 'File upload not available. Select an n8n agent to use file attachments.')
          return
        }
      }
    }
  
    // Use pre-processed OCR results (processed on file attach)
    const ocrContextForThisTurn = preProcessedOcr.ocrContext || ''
    
    // Clear pre-processed OCR for next message
    setPreProcessedOcr({ ocrContext: '', postedMessage: '' })

    // Determine title (first message)
    const currentConv = conversations.find(c => c.id === (chatIdForThisTurn || activeConversation))
    const computedTitle =
      currentConv && currentConv.messages.length === 0
        ? inputText.slice(0, 30) + (inputText.length > 30 ? '...' : '')
        : currentConv?.title || 'New chat'

    // In DB mode, persist title + user message first (so refresh keeps it)
    let userMessageId = Date.now()
    if (dbEnabled) {
      try {
        if (currentConv?.messages.length === 0) {
          await supabase.from('chats').update({ title: computedTitle }).eq('chat_id', chatIdForThisTurn)
        }
        userMessageId = await insertMessageInDb(chatIdForThisTurn, 'user', inputText.trim())
      } catch (e) {
        console.error(e)
        showToast('Failed to save message')
      }
    }

    const userMessage = {
      ...userMessageBase,
      id: userMessageId,
      attachments,
      // Inline render flag for bubble rendering
      _attachmentsInline: true
    }

    setConversations(prev =>
      prev.map(conv => {
        if (conv.id === (chatIdForThisTurn || activeConversation)) {
          return {
            ...conv,
            title: computedTitle,
            messages: [...conv.messages, userMessage],
          }
        }
        return conv
      })
    )
    chatInputRef.current?.clear()
    setAttachedFiles([])
    // Revoke any previews if exist
    attachedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
    setIsTyping(true)

    try {
      // OCR context is passed to the AI so it can give one comprehensive response
      // (No longer posting OCR as a separate message - AI will include analysis in its response)

      let responseContent
      console.log('Message routing check:', { searchUrl, hasSelectedAgent: !!selectedAgent })
      
        const imgReq = isImageGenRequest(userMessage.content)
        const shouldAuto =
          imgReq.isRequest &&
          (imgReq.explicit || autoImageGenFromChat) &&
          openAiApiKey.trim()

        if (shouldAuto) {
        setTypingStatus('image')
          const prompt = imgReq.prompt || ''
          if (!prompt.trim()) {
            throw new Error('Use `/image your prompt here` to generate an image.')
          }
        const url = await openAiGenerateImage(prompt, abortController.signal)
        // Permanent storage in Supabase (Gallery)
        let savedToGallery = false
          if (dbEnabled) {
            try {
            await persistGeneratedImage({ prompt, model: imageGenModel || 'dall-e-3', dataUrl: url })
            savedToGallery = true
            showToast('Image saved to gallery!')
            } catch (e) {
              console.error('Failed to persist generated image:', e)
            showToast('Image generated but failed to save to gallery: ' + (e.message || 'Unknown error'))
            }
          }
          responseContent =
          `**Image generated** (model: \`${imageGenModel || 'dall-e-3'}\`)${savedToGallery ? ' ✓ Saved to gallery' : ''}\n\n` +
            `Prompt: ${prompt}\n\n` +
            `![Generated image](${url})`
        } else if (selectedAgent) {
        setTypingStatus('generating')
        const agentResult = await sendMessageToAgent(userMessage.content, attachments, ocrContextForThisTurn, abortController.signal)
        const normalized = normalizeAssistantResult(agentResult)
        responseContent = normalized.text
        if (normalized.usage) {
          const modelId = selectedAgent?.model || selectedAgent?.name || selectedAgent?.provider || 'unknown'
          await recordUsage(normalized.usage, modelId)
        }
        } else {
        setTypingStatus('generating')
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000))
          responseContent = simulateResponse(userMessage.content)
        }

      // If a newer run started or we were cancelled, stop here.
      if (runId !== generationRunIdRef.current || abortController.signal.aborted) return
      let assistantMessageId = Date.now() + 1
      if (dbEnabled) {
        try {
          assistantMessageId = await insertMessageInDb(chatIdForThisTurn, 'assistant', responseContent)
        } catch (e) {
          console.error(e)
        }
      }

      const assistantMessage = { id: assistantMessageId, role: 'assistant', content: responseContent }

      // Add message to conversation (render fully formatted immediately; no simulated streaming)
      setConversations(prev => prev.map(conv => {
        if (conv.id === (chatIdForThisTurn || activeConversation)) {
          return {
            ...conv,
            messages: [...conv.messages, assistantMessage]
          }
        }
        return conv
      }))
      
      // Trigger typing animation for code blocks
      setNewlyGeneratedMessageId(assistantMessageId)
      // Clear after animation completes (2s for typing + fade)
      setTimeout(() => setNewlyGeneratedMessageId(null), 2500)

      // Auto-create code files in editor when AI generates them with filename syntax
      const codeFileRegex = /```(\w+)?:([^\n]+)\n([\s\S]*?)```/g
      let fileMatch
      const filesToCreate = []
      while ((fileMatch = codeFileRegex.exec(responseContent)) !== null) {
        const [, lang, filename, code] = fileMatch
        if (filename && filename.trim()) {
          filesToCreate.push({ filename: filename.trim(), code: code.trim(), lang: lang || '' })
        }
      }
      if (false && filesToCreate.length > 0) {
        // Create project and files
        const convTitle = currentConversation?.title || 'AI Code'
        const project = getOrCreateChatProject(chatIdForThisTurn || activeConversation, convTitle)
        filesToCreate.forEach(({ filename, code, lang }) => {
          addFileToProject(project.id, filename, code, lang)
        })
        showToast(`Created ${filesToCreate.length} file${filesToCreate.length > 1 ? 's' : ''} in Code Editor`)
      }

      // Extract memories from this conversation turn (non-blocking)
      if (dbEnabled && selectedAgent && !responseContent.startsWith('**Image generated**')) {
        extractMemoriesFromConversation(userMessage.content, responseContent).catch(console.error)
      }
      
      // Generate dynamic chat title for first message (non-blocking)
      if (currentConv && currentConv.messages.length <= 1) {
        generateChatTitle(chatIdForThisTurn || activeConversation, userMessage.content).catch(console.error)
      }
    } catch (err) {
      // Ignore aborts (Stop generating)
      if (err?.name === 'AbortError' || /aborted|abort/i.test(String(err?.message || ''))) {
        return
      }
      showToast(err.message || 'Failed to get response')
      if (dbEnabled) {
        try {
          await insertMessageInDb(chatIdForThisTurn, 'assistant', `Error: ${err.message || 'Failed to get response'}`)
        } catch (e) {
          console.error(e)
        }
      }
      setConversations(prev => prev.map(conv => {
        if (conv.id === (chatIdForThisTurn || activeConversation)) {
          return {
            ...conv,
            messages: [...conv.messages, {
              id: Date.now() + 1,
              role: 'assistant',
              content: `Error: ${err.message || 'Failed to get response'}`
            }]
          }
        }
        return conv
      }))
    } finally {
      setIsTyping(false)
      setTypingStatus('')
    }
  }

  const stopGenerating = () => {
    // Invalidate current run so late responses are ignored
    generationRunIdRef.current += 1
    if (generationAbortRef.current) {
      try { generationAbortRef.current.abort() } catch {}
    }
    setIsTyping(false)
    setTypingStatus('')
    showToast('Stopped')
  }

  // Memoized user messages for history navigation (passed to ChatTextarea)
  const userMessagesForHistory = useMemo(() => {
    return currentConversation?.messages
      ?.filter(m => m.role === 'user')
      ?.map(m => typeof m.content === 'string' ? m.content : '')
      ?.filter(Boolean)
      ?.reverse() || [] // Most recent first
  }, [currentConversation?.messages])

  const codeUserMessagesForHistory = useMemo(() => {
    return codeMessages
      ?.filter(m => m.role === 'user')
      ?.map(m => typeof m.content === 'string' ? m.content : '')
      ?.filter(Boolean)
      ?.reverse() || []
  }, [codeMessages])

  const adminUsageMap = useMemo(() => {
    const map = new Map()
    adminUsage.forEach((row) => {
      if (row?.user_id) map.set(row.user_id, row)
    })
    return map
  }, [adminUsage])

  const adminRows = useMemo(() => {
    return adminUsers.map((user) => {
      const usage = adminUsageMap.get(user.user_id) || {}
      const inputTokens = Number(usage.input_tokens || 0)
      const outputTokens = Number(usage.output_tokens || 0)
      const costs = calculateCost(inputTokens, outputTokens, user.user_id)
      return {
        ...user,
        inputTokens,
        outputTokens,
        ...costs,
      }
    })
  }, [adminUsers, adminUsageMap, adminRates, adminUserRates])

  const adminUsageModelsMap = useMemo(() => {
    const map = new Map()
    adminUsageModels.forEach((row) => {
      if (!row?.user_id) return
      if (!map.has(row.user_id)) map.set(row.user_id, [])
      map.get(row.user_id).push(row)
    })
    return map
  }, [adminUsageModels])

  // Close attach menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close tools menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target)) {
        setShowToolsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close agent selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check both main chat selector and code chat selector
      if (!e.target.closest('.model-selector-container') &&
          !e.target.closest('.model-selector-mini') &&
          !e.target.closest('.model-dropdown')) {
        setShowAgentSelector(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Process files for OCR immediately on attach
  const processFilesForOcr = async (fileObjs) => {
    if (!ocrAutoProcessChatUploads || fileObjs.length === 0 || !openAiApiKey.trim()) {
      return
    }
    
    try {
      const ocrRes = await processChatUploadsForOcrAndRag(fileObjs)
      setPreProcessedOcr({
        ocrContext: ocrRes.ocrContext || '',
        postedMessage: ocrRes.postedMessage || ''
      })
    } catch (e) {
      console.error('OCR pre-processing failed:', e)
    }
  }

  const captureScreenshotForChat = async () => {
    if (isCapturingScreenshot) return
    try {
      setIsCapturingScreenshot(true)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      const imageCapture = new ImageCapture(track)
      const bitmap = await imageCapture.grabFrame()
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      track.stop()
      if (!blob) throw new Error('Failed to capture screenshot')
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
      const newFile = {
        id: Date.now() + Math.random(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        preview: URL.createObjectURL(file),
      }
      setAttachedFiles((prev) => {
        const updated = [...prev, newFile]
        processFilesForOcr(updated)
        return updated
      })
      showToast('Screenshot attached')
    } catch (err) {
      console.error('Screenshot capture failed:', err)
      showToast(err.message || 'Screenshot capture failed')
    } finally {
      setIsCapturingScreenshot(false)
      setShowToolsMenu(false)
    }
  }

  // Handle file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    console.log('Files selected:', files.map(f => ({ name: f.name, type: f.type, size: f.size })))
    console.log('Upload target:', uploadModalTarget)
 
    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }))

    if (uploadModalTarget === 'deepResearch') {
      setDeepResearchFiles(prev => [...prev, ...newFiles])
      showToast(`${files.length} file${files.length > 1 ? 's' : ''} attached to research`)
    } else {
      setAttachedFiles(prev => {
        const updated = [...prev, ...newFiles]
        // Trigger OCR processing immediately with all files
        processFilesForOcr(updated)
        return updated
      })
      showToast(`${files.length} file${files.length > 1 ? 's' : ''} attached`)
    }
    setShowAttachMenu(false)
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Remove attached file
  const removeAttachedFile = (fileId) => {
    setAttachedFiles(prev => {
      const file = prev.find(f => f.id === fileId)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      const remaining = prev.filter(f => f.id !== fileId)
      // Re-process OCR with remaining files, or clear if none left
      if (remaining.length > 0) {
        processFilesForOcr(remaining)
      } else {
        setPreProcessedOcr({ ocrContext: '', postedMessage: '' })
      }
      return remaining
    })
  }

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Get file icon based on type
  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return 'image'
    if (type.startsWith('video/')) return 'video'
    if (type.startsWith('audio/')) return 'audio'
    if (type.includes('pdf')) return 'pdf'
    if (type.includes('word') || type.includes('document')) return 'doc'
    if (type.includes('sheet') || type.includes('excel')) return 'sheet'
    if (type.includes('presentation') || type.includes('powerpoint')) return 'presentation'
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return 'archive'
    if (type.includes('text') || type.includes('code')) return 'code'
    return 'file'
  }

  // Handle drag events for upload modal
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)

    if (files.length === 0) {
      showToast('No files dropped')
      return
    }

    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }))

    setAttachedFiles(prev => {
      const updated = [...prev, ...newFiles]
      // Trigger OCR processing immediately
      processFilesForOcr(updated)
      return updated
    })
    setShowUploadModal(false)
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} attached`)
  }

  // Chat input drag and drop handlers
  const handleInputDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOnInput(true)
  }

  const handleInputDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if we're leaving the input area entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDraggingOnInput(false)
    }
  }

  const handleInputDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOnInput(false)

    const files = Array.from(e.dataTransfer.files)

    if (files.length === 0) return

    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }))

    setAttachedFiles(prev => {
      const updated = [...prev, ...newFiles]
      // Trigger OCR processing immediately
      processFilesForOcr(updated)
      return updated
    })
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} attached`)
  }

  // Handle PDF file selection from modal
  const handlePdfSelect = (e) => {
    const files = Array.from(e.target.files).filter(file => 
      file.type === 'application/pdf'
    )
    
    if (files.length === 0) return

    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: null
    }))

    setAttachedFiles(prev => {
      const updated = [...prev, ...newFiles]
      // Trigger OCR processing immediately
      processFilesForOcr(updated)
      return updated
    })
    setShowUploadModal(false)
    showToast(`${files.length} PDF${files.length > 1 ? 's' : ''} attached`)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImportAgents = async () => {
    if (!n8nWebhookUrl.trim()) {
      setWebhookError('Please enter a webhook URL')
      return
    }

    setWebhookError('')
    setImportingAgents(true)
    try {
      console.log('Fetching agents from:', n8nWebhookUrl)
      
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_agents',
          timestamp: new Date().toISOString()
        })
      })

      console.log('Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        throw new Error(`Server error: ${response.status} - ${errorText || response.statusText}`)
      }

      const text = await response.text()
      console.log('Raw response:', text)

      let data
      try {
        data = JSON.parse(text)
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr)
        throw new Error(`Invalid JSON response: ${text.substring(0, 200)}...`)
      }

      console.log('Parsed data:', data)

      let agentsArray = null
      
      if (Array.isArray(data)) {
        agentsArray = data
      } else if (data.agents && Array.isArray(data.agents)) {
        agentsArray = data.agents
      }

      if (agentsArray) {
        setAgents(agentsArray)
        showToast(`Imported ${agentsArray.length} agent${agentsArray.length > 1 ? 's' : ''}`)
        setWebhookError('')
      } else {
        console.error('Invalid data format:', data)
        throw new Error('Response must be an array of agents or { "agents": [...] }')
      }
    } catch (err) {
      console.error('Import error:', err)
      
      if (err.message && err.message.includes('Invalid JSON response')) {
        setWebhookError(err.message)
        showToast('Webhook returned text instead of JSON. Use "Manually Add Agent" instead.')
      } else {
        const errorMsg = err.message || 'Failed to import agents'
        setWebhookError(errorMsg)
        showToast(errorMsg)
      }
    } finally {
      setImportingAgents(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!n8nWebhookUrl.trim()) {
      setWebhookError('Please enter a webhook URL')
      return
    }

    setWebhookError('')
    setTestingWebhook(true)
    try {
      console.log('Testing webhook:', n8nWebhookUrl)

      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ping',
          timestamp: new Date().toISOString()
        })
      })

      if (response.ok) {
        const text = await response.text()
        console.log('Webhook response:', text)
        showToast('Webhook is connected! ✓')
        setWebhookError('')
      } else {
        const errorText = await response.text()
        throw new Error(`Server error: ${response.status} - ${errorText || response.statusText}`)
      }
    } catch (err) {
      console.error('Webhook test error:', err)
      const errorMsg = err.message || 'Webhook connection failed'
      setWebhookError(errorMsg)
      showToast(errorMsg)
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleAddAgent = () => {
    if (!newAgent.name.trim()) {
      showToast('Please enter an agent name')
      return
    }

    const agent = {
      id: crypto.randomUUID(),
      provider: 'n8n',
      name: newAgent.name.trim(),
      description: newAgent.description.trim() || 'No description',
      tags: newAgent.tags ? newAgent.tags.split(',').map(t => t.trim()).filter(t => t) : [],
      webhookUrl: newAgent.webhookUrl.trim() || '',
      systemPrompt: newAgent.systemPrompt.trim() || ''
    }

    setAgents(prev => [...prev, agent])
    setNewAgent({ name: '', description: '', tags: '', webhookUrl: '', systemPrompt: '' })
    setShowAddAgentForm(false)
    showToast(`Added "${agent.name}"`)
  }

  const handleClearWebhookError = () => {
    setWebhookError('')
  }

  const handleDeleteAgent = (agentId) => {
    setAgents(prev => prev.filter(agent => agent.id !== agentId))
    showToast('Agent deleted')
  }

  const handleEditAgent = (agent) => {
    setEditingAgent(agent)
    setNewAgent({
      name: agent.name || '',
      description: agent.description || '',
      tags: agent.tags?.join(', ') || '',
      webhookUrl: agent.webhookUrl || '',
      systemPrompt: agent.systemPrompt || ''
    })
    setShowAddAgentForm(true)
  }

  const handleUpdateAgent = () => {
    if (!editingAgent) return
    if (!newAgent.name.trim()) {
      showToast('Please enter an agent name')
      return
    }

    setAgents(prev => prev.map(agent => 
      agent.id === editingAgent.id 
        ? {
            ...agent,
            name: newAgent.name.trim(),
            description: newAgent.description.trim() || 'No description',
            tags: newAgent.tags ? newAgent.tags.split(',').map(t => t.trim()).filter(t => t) : [],
            webhookUrl: newAgent.webhookUrl.trim() || '',
            systemPrompt: newAgent.systemPrompt.trim() || ''
          }
        : agent
    ))
    setNewAgent({ name: '', description: '', tags: '', webhookUrl: '', systemPrompt: '' })
    setShowAddAgentForm(false)
    setEditingAgent(null)
    showToast(`Updated "${newAgent.name.trim()}"`)
  }

  const handleAddOpenRouterAgent = () => {
    if (!newOpenRouterAgent.name.trim()) {
      showToast('Please enter an agent name')
      return
    }
    if (!newOpenRouterAgent.model.trim()) {
      showToast('Please enter a model id')
      return
    }

    const modelId = newOpenRouterAgent.model.trim()

    const agent = {
      id: crypto.randomUUID(),
      provider: 'openrouter',
      name: newOpenRouterAgent.name.trim(),
      model: modelId,
      systemPrompt: newOpenRouterAgent.systemPrompt || 'You are a helpful assistant.',
      temperature: Number(newOpenRouterAgent.temperature ?? 0.7),
    }

    // Persist any manually-entered model ids so they show up in the dropdown later
    setOpenRouterModels((prev) => {
      const list = Array.isArray(prev) ? prev : []
      if (list.some((m) => (m?.id || '') === modelId)) return list
      return [{ id: modelId, name: modelId, description: '' }, ...list]
    })

    setOpenRouterAgents(prev => [agent, ...prev])
    setNewOpenRouterAgent({
      name: '',
      model: newOpenRouterAgent.model,
      systemPrompt: newOpenRouterAgent.systemPrompt,
      temperature: newOpenRouterAgent.temperature,
    })
    showToast(`Added "${agent.name}"`)
  }

  const handleDeleteOpenRouterAgent = (agentId) => {
    setOpenRouterAgents(prev => prev.filter(a => a.id !== agentId))
    if (selectedAgent?.id === agentId) setSelectedAgent(null)
    showToast('Agent deleted')
  }

  const handleEditOpenRouterAgent = (agent) => {
    setEditingOpenRouterAgent(agent)
    setNewOpenRouterAgent({
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt || '',
      temperature: agent.temperature ?? 0.7,
    })
  }

  const handleUpdateOpenRouterAgent = () => {
    if (!editingOpenRouterAgent) return
    if (!newOpenRouterAgent.name.trim()) {
      showToast('Please enter an agent name')
      return
    }
    
    const updatedAgent = {
      ...editingOpenRouterAgent,
      name: newOpenRouterAgent.name.trim(),
      model: newOpenRouterAgent.model,
      systemPrompt: newOpenRouterAgent.systemPrompt,
      temperature: newOpenRouterAgent.temperature,
    }
    
    setOpenRouterAgents(prev => prev.map(a => 
      a.id === editingOpenRouterAgent.id ? updatedAgent : a
    ))
    
    // Update selected agent if it's the one being edited
    if (selectedAgent?.id === editingOpenRouterAgent.id) {
      setSelectedAgent(updatedAgent)
    }
    
    setEditingOpenRouterAgent(null)
    setNewOpenRouterAgent({
      name: '',
      model: 'openai/gpt-4o-mini',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
    })
    showToast(`Agent "${updatedAgent.name}" updated`)
  }

  const handleCancelEditOpenRouterAgent = () => {
    setEditingOpenRouterAgent(null)
    setNewOpenRouterAgent({
      name: '',
      model: 'openai/gpt-4o-mini',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
    })
  }

  const handleDeleteLmStudioAgent = (agentId) => {
    setLmStudioAgents(prev => prev.filter(a => a.id !== agentId))
    if (selectedAgent?.id === agentId) setSelectedAgent(null)
    showToast('Agent deleted')
  }

  const normalizeOpenRouterModel = (model) => {
    const rawId = String(model?.id || '')
    const rawName = String(model?.name || rawId)
    if (!rawId) return null

    let id = rawId
    let name = rawName
    if (id.includes('glm-4.5')) id = id.replace(/glm-4\.5/g, 'glm-4.7')
    if (name.includes('glm-4.5')) name = name.replace(/glm-4\.5/g, 'glm-4.7')
    if (name.includes('GLM 4.5')) name = name.replace(/GLM 4\.5/g, 'GLM 4.7')

    return {
      id,
      name,
      description: model?.description || '',
      context_length: model?.context_length,
      pricing: model?.pricing,
    }
  }

  const connectOpenRouter = async () => {
    if (!openRouterApiKey.trim()) {
      showToast('Add your OpenRouter API key first')
      return
    }
    setOpenRouterConnectError('')
    setOpenRouterConnectState('connecting')
    try {
      // 1) Load models (may be public on some setups, so not sufficient alone)
      const resp = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${openRouterApiKey.trim()}`,
          'Content-Type': 'application/json',
          // Optional but recommended by OpenRouter:
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Agent Me',
        },
      })
      if (!resp.ok) {
        const t = await resp.text()
        throw new Error(`${resp.status} ${t}`)
      }
      const data = await resp.json()
      const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
      setOpenRouterModels((prev) => {
        const prevList = Array.isArray(prev) ? prev : []
        const prevById = new Map(prevList.map((m) => [m?.id, m]))

        for (const m of models) {
          const normalized = normalizeOpenRouterModel(m)
          if (!normalized?.id) continue
          const isLegacyGlm = String(m?.id || '').includes('glm-4.5')
          if (isLegacyGlm && prevById.has(normalized.id)) continue
          prevById.set(normalized.id, normalized)
        }

        return Array.from(prevById.values()).filter((m) => m?.id)
      })

      // 2) Validate key against an auth-required endpoint.
      // Prefer a metadata endpoint if available; otherwise do a tiny completion.
      let keyValidated = false
      try {
        const keyResp = await fetch('https://openrouter.ai/api/v1/auth/key', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${openRouterApiKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Agent Me',
          },
        })
        if (keyResp.ok) {
          keyValidated = true
        }
      } catch {
        // ignore and fall back
      }

      if (!keyValidated) {
        // Tiny completion: minimal tokens, just to confirm the key works for chat.
        const testModel =
          (newOpenRouterAgent?.model && String(newOpenRouterAgent.model)) ||
          'openai/gpt-4o-mini'
        const testResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterApiKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Agent Me',
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            temperature: 0,
          }),
        })
        if (!testResp.ok) {
          const t = await testResp.text()
          // Mark as error but keep models cached
          throw new Error(`OpenRouter auth check failed: ${testResp.status} ${t}`)
        }
      }

      setOpenRouterConnectState('connected')
      showToast(`Connected. Loaded ${models.length} models.`)
    } catch (e) {
      console.error(e)
      setOpenRouterConnectState('error')
      setOpenRouterConnectError(e.message || 'Failed to connect')
      showToast('OpenRouter connection failed')
    }
  }

  const disconnectOpenRouter = () => {
    setOpenRouterConnectState('disconnected')
    setOpenRouterConnectError('')
    // keep models cached unless user clears key
  }

  const connectLmStudio = async () => {
    const base = normalizeOpenAiCompatibleBaseUrl(lmStudioBaseUrl)
    if (!base) {
      showToast('Set your LM Studio base URL first (e.g. http://localhost:1234/v1)')
      return
    }
    setLmStudioConnectError('')
    setLmStudioConnectState('connecting')
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (lmStudioApiKey?.trim()) headers.Authorization = `Bearer ${lmStudioApiKey.trim()}`

      const modelsResp = await fetch(`${base}/models`, { method: 'GET', headers })
      const modelsText = await modelsResp.text()
      if (!modelsResp.ok) {
        throw new Error(
          `Failed to load models from LM Studio (${modelsResp.status}). ` +
            `If you see a CORS error, enable CORS in LM Studio or run the app from the same origin.\n\n` +
            modelsText
        )
      }
      let modelsJson
      try {
        modelsJson = JSON.parse(modelsText)
      } catch {
        throw new Error(`LM Studio /models did not return JSON: ${modelsText.slice(0, 200)}`)
      }
      const models = Array.isArray(modelsJson?.data) ? modelsJson.data : Array.isArray(modelsJson) ? modelsJson : []
      const normalizedModels = models
        .map((m) => ({
          id: m?.id || m?.name || '',
          name: m?.name || m?.id || '',
          object: m?.object,
        }))
        .filter((m) => m.id)
      setLmStudioModels(normalizedModels)

      // Tiny completion test (auth + compatibility check)
      const testModel = normalizedModels?.[0]?.id
      if (!testModel) {
        setLmStudioConnectState('connected')
        showToast('Connected, but no models were returned by /models')
        return
      }
      const testResp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
      })
      const testText = await testResp.text()
      if (!testResp.ok) {
        throw new Error(`LM Studio chat test failed (${testResp.status}): ${testText}`)
      }

      setLmStudioConnectState('connected')
      showToast(`Connected. Loaded ${normalizedModels.length} model(s).`)
    } catch (e) {
      console.error(e)
      setLmStudioConnectState('error')
      setLmStudioConnectError(e.message || 'Failed to connect')
      showToast('LM Studio connection failed')
    }
  }

  const disconnectLmStudio = () => {
    setLmStudioConnectState('disconnected')
    setLmStudioConnectError('')
    // keep models cached
  }

  const addLmStudioModelAsAgent = (modelId) => {
    const base = normalizeOpenAiCompatibleBaseUrl(lmStudioBaseUrl)
    if (!base) {
      showToast('Set your LM Studio base URL first')
      return
    }
    if (!modelId) {
      showToast('Select a model first')
      return
    }
    const model = (lmStudioModels || []).find((m) => m.id === modelId)
    const friendly = model?.name || modelId
    const name = (newLmStudioAgent?.name || '').trim() || `LM Studio • ${friendly}`
    const agent = {
      id: crypto.randomUUID(),
      name,
      model: modelId,
      baseUrl: base,
      apiKey: lmStudioApiKey || '',
      systemPrompt: newLmStudioAgent.systemPrompt || 'You are a helpful assistant.',
      uncensored: !!newLmStudioAgent.uncensored,
      temperature: Number(newLmStudioAgent.temperature ?? 0.7),
      provider: 'lmstudio',
    }
    setLmStudioAgents((prev) => [...(Array.isArray(prev) ? prev : []), agent])
    setNewLmStudioAgent((prev) => ({ ...prev, name: '', model: modelId }))
    showToast(`Added agent: ${name}`)
  }

  const mcpRequest = async ({ url, token, method, params }) => {
    const id = mcpRpcIdRef.current++
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`

    // Use proxy for known MCP servers to avoid CORS
    let fetchUrl = url
    try {
      const parsed = new URL(url)
      if (parsed.hostname === 'n8nv2.brainstormnodes.org') {
        fetchUrl = `/api/mcp/n8nv2${parsed.pathname}`
      }
      // Add more proxy mappings here as needed
    } catch {}

    const resp = await fetch(fetchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: params || {},
      }),
    })
    const text = await resp.text()
    if (!resp.ok) throw new Error(`${resp.status} ${text}`)
    
    let data
    // Check if response is SSE format (starts with "event:" or "data:")
    if (text.trim().startsWith('event:') || text.trim().startsWith('data:')) {
      // Parse SSE: extract JSON from "data:" lines
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim()
          if (jsonStr) {
            try {
              data = JSON.parse(jsonStr)
              break
            } catch {}
          }
        }
      }
      if (!data) {
        throw new Error(`Could not parse SSE response: ${text.slice(0, 200)}`)
      }
    } else {
      // Plain JSON response
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Invalid MCP JSON response: ${text.slice(0, 200)}`)
      }
    }
    
    if (data?.error) {
      throw new Error(data.error?.message || 'MCP error')
    }
    return data?.result
  }

  // ============ GitHub API Functions ============
  
  const githubApi = async (endpoint, options = {}) => {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${githubToken}`,
      ...options.headers
    }
    // Use direct GitHub API URL (works in both dev and production)
    const resp = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.message || `GitHub API error: ${resp.status}`)
    }
    if (resp.status === 204) return null
    return resp.json()
  }

  const connectGitHub = async () => {
    if (!githubToken.trim()) {
      showToast('Please enter a GitHub token')
      return
    }
    try {
      const user = await githubApi('/user')
      setGithubUser(user)
      setGithubConnected(true)
      localStorage.setItem('githubToken', githubToken)
      showToast(`Connected as ${user.login}`)
      loadGitHubRepos()
    } catch (err) {
      showToast(`GitHub connection failed: ${err.message}`)
      setGithubConnected(false)
    }
  }

  const disconnectGitHub = () => {
    setGithubConnected(false)
    setGithubUser(null)
    setGithubRepos([])
    setSelectedRepo(null)
    setRepoFiles([])
    setSelectedFile(null)
    setFileContent('')
    setGithubOpenTabs([])
    setGithubActiveTabId(null)
    setGithubTabContents({})
    setRepoBranches([])
    setRepoBranch('main')
    setExpandedFolders({})
    setPendingFileChanges({})
    localStorage.removeItem('githubToken')
    showToast('Disconnected from GitHub')
  }

  const exitRepo = () => {
    setSelectedRepo(null)
    setRepoFiles([])
    setSelectedFile(null)
    setFileContent('')
    setGithubOpenTabs([])
    setGithubActiveTabId(null)
    setGithubTabContents({})
    setRepoBranches([])
    setRepoBranch('main')
    setExpandedFolders({})
    setPendingFileChanges({})
    showToast('Back to repositories')
  }

  const loadGitHubRepos = async () => {
    setGithubReposLoading(true)
    try {
      const repos = await githubApi('/user/repos?sort=updated&per_page=100')
      setGithubRepos(repos)
    } catch (err) {
      showToast(`Failed to load repos: ${err.message}`)
    } finally {
      setGithubReposLoading(false)
    }
  }

  const loadRepoBranches = async (owner, repo) => {
    try {
      const branches = await githubApi(`/repos/${owner}/${repo}/branches`)
      setRepoBranches(branches.map(b => b.name))
      // Try to find default branch
      const repoInfo = await githubApi(`/repos/${owner}/${repo}`)
      setRepoBranch(repoInfo.default_branch || 'main')
    } catch (err) {
      console.error('Failed to load branches:', err)
      setRepoBranches(['main', 'master'])
    }
  }

  const loadRepoFiles = async (owner, repo, path = '', branch = repoBranch) => {
    setRepoFilesLoading(true)
    try {
      const contents = await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
      // Sort: folders first, then files
      const sorted = Array.isArray(contents) 
        ? contents.sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1
            if (a.type !== 'dir' && b.type === 'dir') return 1
            return a.name.localeCompare(b.name)
          })
        : [contents]
      if (!path) {
        setRepoFiles(sorted)
      }
      return sorted
    } catch (err) {
      showToast(`Failed to load files: ${err.message}`)
      return []
    } finally {
      setRepoFilesLoading(false)
    }
  }

  const removeRepoFileFromTree = (items, targetPath) => {
    if (!Array.isArray(items)) return items
    return items
      .filter(item => item.path !== targetPath)
      .map(item => {
        if (item.type !== 'dir') return item
        return item
      })
  }

  const removeRepoFileFromExpanded = (expanded, targetPath) => {
    const next = { ...expanded }
    Object.keys(next).forEach((key) => {
      const list = next[key]
      if (Array.isArray(list)) {
        next[key] = removeRepoFileFromTree(list, targetPath)
      }
    })
    return next
  }

  const loadFileContent = async (owner, repo, path, branch = repoBranch) => {
    setFileContentLoading(true)
    try {
      const file = await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
      if (file.content) {
        const content = atob(file.content)
        setFileContent(content)
        setSelectedFile({ ...file, decodedContent: content })
        return content
      }
    } catch (err) {
      showToast(`Failed to load file: ${err.message}`)
    } finally {
      setFileContentLoading(false)
    }
    return ''
  }

  const createOrUpdateFile = async (owner, repo, path, content, message, sha = null) => {
    const body = {
      message: message || `Update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: repoBranch
    }
    if (sha) body.sha = sha
    
    try {
      await githubApi(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      showToast(`File ${sha ? 'updated' : 'created'}: ${path}`)
      return true
    } catch (err) {
      showToast(`Failed to save file: ${err.message}`)
      return false
    }
  }

  const deleteFile = async (owner, repo, path, sha, message) => {
    try {
      await githubApi(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message || `Delete ${path}`,
          sha,
          branch: repoBranch
        })
      })
      showToast(`File deleted: ${path}`)
      return true
    } catch (err) {
      showToast(`Failed to delete file: ${err.message}`)
      return false
    }
  }

  // Start editing a GitHub file
  const startGithubEdit = () => {
    if (!selectedFile || !fileContent) return
    setGithubEditContent(fileContent)
    setGithubFileEditing(true)
  }

  // Cancel GitHub file editing
  const cancelGithubEdit = () => {
    setGithubFileEditing(false)
    setGithubEditContent('')
  }

  // Save GitHub file changes
  const saveGithubFile = async () => {
    if (!selectedRepo || !selectedFile || !githubEditContent) return

    setGithubFileSaving(true)
    try {
      const success = await createOrUpdateFile(
        selectedRepo.owner.login,
        selectedRepo.name,
        selectedFile.path,
        githubEditContent,
        `Update ${selectedFile.path}`,
        selectedFile.sha
      )

      if (success) {
        setFileContent(githubEditContent)
        setGithubFileEditing(false)
        setGithubEditContent('')
        setGithubTabContents(prev => ({ ...prev, [selectedFile.path]: githubEditContent }))
        // Reload file to get new SHA
        await loadFileContent(selectedRepo.owner.login, selectedRepo.name, selectedFile.path)
      }
    } catch (err) {
      showToast(`Failed to save: ${err.message}`)
    } finally {
      setGithubFileSaving(false)
    }
  }

  // Create a new file in GitHub repo
  const createGithubFile = async () => {
    if (!selectedRepo || !githubNewFileName.trim()) {
      showToast('Please enter a file name')
      return
    }

    setCreatingGithubFile(true)
    try {
      const success = await createOrUpdateFile(
        selectedRepo.owner.login,
        selectedRepo.name,
        githubNewFileName.trim(),
        githubNewFileContent || '// New file\n',
        `Create ${githubNewFileName.trim()}`
      )

      if (success) {
        setShowGithubNewFileModal(false)
        setGithubNewFileName('')
        setGithubNewFileContent('')
        // Reload files
        await loadRepoFiles(selectedRepo.owner.login, selectedRepo.name)
        showToast(`Created ${githubNewFileName.trim()}`)
      }
    } catch (err) {
      showToast(`Failed to create file: ${err.message}`)
    } finally {
      setCreatingGithubFile(false)
    }
  }

  // Delete a GitHub file
  const deleteGithubFile = async () => {
    if (!selectedRepo || !deleteFileTarget) return
    setDeletingFile(true)
    setDeleteFileError('')

    const targetPath = deleteFileTarget.path
    let targetSha = deleteFileTarget.sha

    // Optimistic UI update
    setRepoFiles(prev => removeRepoFileFromTree(prev, targetPath))
    setExpandedFolders(prev => removeRepoFileFromExpanded(prev, targetPath))
    if (targetPath) closeGithubTab(targetPath)
    setSelectedFile(null)
    setFileContent('')
    setGithubFileEditing(false)

    try {
      if (!targetSha) {
        try {
          const fileData = await githubApi(`/repos/${selectedRepo.owner.login}/${selectedRepo.name}/contents/${targetPath}?ref=${repoBranch}`)
          targetSha = fileData.sha
        } catch {
          // keep null, delete will fail and be handled below
        }
      }
      const success = await deleteFile(
        selectedRepo.owner.login,
        selectedRepo.name,
        targetPath,
        targetSha,
        `Delete ${targetPath}`
      )

      if (!success) {
        await loadRepoFiles(selectedRepo.owner.login, selectedRepo.name)
        setDeleteFileError('Failed to delete file. Please check permissions.')
        return
      }

      setShowDeleteFileModal(false)
      setDeleteFileTarget(null)
      showToast(`Deleted ${targetPath}`)
    } catch (err) {
      await loadRepoFiles(selectedRepo.owner.login, selectedRepo.name)
      setDeleteFileError(err.message || 'Failed to delete file')
    } finally {
      setDeletingFile(false)
    }
  }

  const selectRepo = async (repo) => {
    setSelectedRepo(repo)
    setSelectedFile(null)
    setFileContent('')
    setGithubOpenTabs([])
    setGithubActiveTabId(null)
    setGithubTabContents({})
    setExpandedFolders({})
    setPendingFileChanges({})
    setCodeEditorMode('github') // Auto-switch to GitHub mode when repo selected
    await loadRepoBranches(repo.owner.login, repo.name)
    await loadRepoFiles(repo.owner.login, repo.name)
  }

  const createRepo = async () => {
    const name = String(createRepoForm.name || '').trim()
    const description = String(createRepoForm.description || '').trim()
    const isPrivate = !!createRepoForm.private
    if (!name) {
      setCreateRepoError('Repository name is required')
      return
    }
    // basic validation (GitHub will enforce the real rules)
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      setCreateRepoError('Use only letters, numbers, dot, underscore, and hyphen')
      return
    }

    setCreateRepoError('')
    setCreatingRepo(true)
    try {
      const repo = await githubApi('/user/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          private: isPrivate,
          auto_init: true,
        }),
      })
      setShowCreateRepoModal(false)
      setCreateRepoForm({ name: '', description: '', private: true })
      showToast(`Created repo: ${repo?.full_name || name}`)
      await loadGitHubRepos()
      if (repo?.id) {
        // auto-select the newly created repo
        await selectRepo(repo)
      }
    } catch (e) {
      console.error(e)
      setCreateRepoError(e.message || 'Failed to create repository')
    } finally {
      setCreatingRepo(false)
    }
  }

  const deleteSelectedRepo = async () => {
    if (!selectedRepo) return
    const full = selectedRepo.full_name || `${selectedRepo.owner?.login}/${selectedRepo.name}`
    if (deleteRepoConfirm.trim() !== full) {
      setDeleteRepoError(`Type "${full}" to confirm deletion`)
      return
    }
    setDeleteRepoError('')
    setDeletingRepo(true)
    // Optimistic UI update
    setGithubRepos(prev => prev.filter(r => r.id !== selectedRepo.id))
    try {
      await githubApi(`/repos/${selectedRepo.owner.login}/${selectedRepo.name}`, { method: 'DELETE' })
      setShowDeleteRepoModal(false)
      setDeleteRepoConfirm('')
      showToast(`Deleted repo: ${full}`)
      exitRepo()
    } catch (e) {
      console.error(e)
      await loadGitHubRepos()
      setDeleteRepoError(e.message || 'Failed to delete repository')
    } finally {
      setDeletingRepo(false)
    }
  }

  // Handle folder expansion in file tree
  const toggleFolder = async (path) => {
    if (expandedFolders[path]) {
      setExpandedFolders(prev => ({ ...prev, [path]: null }))
    } else {
      const contents = await loadRepoFiles(
        selectedRepo.owner.login,
        selectedRepo.name,
        path
      )
      setExpandedFolders(prev => ({ ...prev, [path]: contents }))
    }
  }

  const codeLangToExt = {
    'javascript': 'js', 'js': 'js', 'jsx': 'jsx',
    'typescript': 'ts', 'ts': 'ts', 'tsx': 'tsx',
    'html': 'html', 'htm': 'html',
    'css': 'css', 'scss': 'scss', 'sass': 'scss',
    'python': 'py', 'py': 'py',
    'json': 'json',
    'sql': 'sql',
    'bash': 'sh', 'shell': 'sh', 'sh': 'sh',
    'markdown': 'md', 'md': 'md',
    'yaml': 'yaml', 'yml': 'yaml',
    'xml': 'xml',
    'java': 'java',
    'c': 'c', 'cpp': 'cpp', 'csharp': 'cs', 'cs': 'cs',
    'go': 'go', 'rust': 'rs', 'ruby': 'rb', 'php': 'php',
    'swift': 'swift', 'kotlin': 'kt',
  }

  const codeExtToDefaultName = {
    'js': 'script.js', 'jsx': 'App.jsx', 'ts': 'script.ts', 'tsx': 'App.tsx',
    'html': 'index.html', 'css': 'styles.css', 'scss': 'styles.scss',
    'py': 'main.py', 'json': 'data.json', 'sql': 'query.sql',
    'sh': 'script.sh', 'md': 'README.md', 'yaml': 'config.yaml',
    'xml': 'data.xml', 'java': 'Main.java',
    'c': 'main.c', 'cpp': 'main.cpp', 'cs': 'Program.cs',
    'go': 'main.go', 'rs': 'main.rs', 'rb': 'main.rb', 'php': 'index.php',
    'swift': 'main.swift', 'kt': 'Main.kt',
  }

  const flattenRepoFiles = (items = [], expanded = {}) => {
    const files = []
    items.forEach((item) => {
      if (item.type === 'file') {
        files.push(item.path)
      } else if (item.type === 'dir') {
        const children = expanded[item.path]
        if (Array.isArray(children)) {
          files.push(...flattenRepoFiles(children, expanded))
        }
      }
    })
    return files
  }

  const getCurrentFileList = () => {
    if (codeEditorMode === 'local' && activeLocalProject) {
      const projectData = localProjectFiles[activeLocalProject.id]
      return (projectData?.files || []).filter(f => f.type === 'file').map(f => f.path)
    }
    if (codeEditorMode === 'github' && selectedRepo) {
      return flattenRepoFiles(repoFiles, expandedFolders)
    }
    return []
  }

  // Code chat handler - sends message to selected agent with GitHub context
  const handleCodeChat = async (messageOverride) => {
    const draftMessage = typeof messageOverride === 'string' ? messageOverride : codeInput
    if (!draftMessage?.trim() || codeGenerating) return
    if (!selectedAgent) {
      showToast('Please select an agent first')
      return
    }
    if (codeEditorMode === 'local' && !activeLocalProject) {
      showToast('Select or create a project to generate files')
      setShowNewProjectModal(true)
      return
    }
    if (codeEditorMode === 'github' && !selectedRepo) {
      showToast('Select a GitHub repo to apply code')
      return
    }

    const userMessage = draftMessage.trim()
    setCodeInput('')
    setCodeChatAutoScroll(true)
    setCodeMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setCodeGenerating(true)

    try {
      // Build context about current GitHub state
      let githubContext = ''
      if (selectedRepo) {
        githubContext += `\n[Connected Repository: ${selectedRepo.full_name}]`
        githubContext += `\n[Current Branch: ${repoBranch}]`
        if (selectedFile) {
          githubContext += `\n[Selected File: ${selectedFile.path}]`
          githubContext += `\n[File Content:\n\`\`\`\n${fileContent}\n\`\`\`]`
        }
      }

      const fileList = getCurrentFileList()
      const fileListContext = fileList.length
        ? `\n[Project Files]\n- ${fileList.join('\n- ')}`
        : '\n[Project Files]\n- (no files loaded yet)'

      const targetContext = codeEditorMode === 'github'
        ? `\n[Target: GitHub]\n${githubContext || 'No repository selected'}${fileListContext}`
        : `\n[Target: Local Project]\n[Project: ${activeLocalProject?.name || 'No project selected'}]${fileListContext}`

      // System prompt for code assistance
      const systemPrompt = `You are a code assistant helping users create and modify code files.

IMPORTANT: When creating or modifying files, use this format for EACH file:
\`\`\`language:filename.ext
// complete file content
\`\`\`

Examples:
\`\`\`javascript:game.js
// game code here
\`\`\`

\`\`\`html:index.html
<!DOCTYPE html>...
\`\`\`

\`\`\`css:styles.css
/* styles here */
\`\`\`

RULES:
1. Always use the \`\`\`language:filename format for code files
2. Create separate code blocks for each file
3. Keep explanations brief - just describe what each file does
4. Do NOT repeat or explain the code line by line
5. The files will be automatically created in the editor
6. If the user asks for a change without naming a file, choose the most likely file from the Project Files list and edit it

Target Context:${targetContext}

Respond with the code files first, then a brief summary of what was created.`

      // Build messages array
      const messagesForApi = [
        { role: 'system', content: systemPrompt },
        ...codeMessages.slice(-10), // Last 10 messages for context
        { role: 'user', content: userMessage }
      ]

      let response
      if (selectedAgent?.provider === 'openrouter') {
        const openRouterKey = (openRouterApiKey || '').trim()
        if (!openRouterKey) throw new Error('OpenRouter API key not set (Settings → OpenRouter)')
        // Use direct OpenRouter API (works in both dev and production)
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey.trim()}`,
            'HTTP-Referer': window.location.origin,
          },
          body: JSON.stringify({
            model: selectedAgent.model || 'openai/gpt-4o',
            messages: messagesForApi,
            max_tokens: 4096,
            temperature: Number(selectedAgent.temperature ?? 0.7),
          })
        })
        const text = await resp.text()
        if (!resp.ok) {
          try {
            const errData = JSON.parse(text)
            throw new Error(errData.error?.message || `OpenRouter error: ${resp.status}`)
          } catch (e) {
            if (e.message.includes('OpenRouter error')) throw e
            throw new Error(`OpenRouter API error (${resp.status}): ${text.slice(0, 150)}`)
          }
        }
        let data
        try {
          data = JSON.parse(text)
        } catch {
          throw new Error(`OpenRouter returned invalid JSON: ${text.slice(0, 150)}`)
        }
        if (data.error) throw new Error(data.error.message)
        response = data.choices?.[0]?.message?.content || ''
      } else if (selectedAgent?.provider === 'lmstudio') {
        const base = normalizeOpenAiCompatibleBaseUrl(selectedAgent?.baseUrl || lmStudioBaseUrl)
        if (!base) throw new Error('LM Studio base URL not set (Settings → LM Studio)')
        if (!selectedAgent?.model) throw new Error('LM Studio agent missing model')
        const headers = { 'Content-Type': 'application/json' }
        const key = (selectedAgent?.apiKey || lmStudioApiKey || '').trim()
        if (key) headers.Authorization = `Bearer ${key}`
        const resp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: selectedAgent.model,
            messages: messagesForApi,
            max_tokens: 4096,
            temperature: Number(selectedAgent.temperature ?? 0.7),
          })
        })
        const text = await resp.text()
        if (!resp.ok) throw new Error(`LM Studio error: ${resp.status} ${text}`)
        let data
        try { data = JSON.parse(text) } catch { throw new Error(`LM Studio returned non-JSON response: ${text.slice(0, 200)}`) }
        response = data.choices?.[0]?.message?.content || ''
      } else if ((openAiApiKey || '').trim()) {
        // Use direct OpenAI API (works in both dev and production)
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(openAiApiKey || '').trim()}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: messagesForApi,
            max_tokens: 4096,
          })
        })
        const text = await resp.text()
        if (!resp.ok) {
          // Try to parse as JSON error, otherwise show raw text
          try {
            const errData = JSON.parse(text)
            throw new Error(errData.error?.message || `OpenAI error: ${resp.status}`)
          } catch (e) {
            if (e.message.includes('OpenAI error')) throw e
            throw new Error(`OpenAI API error (${resp.status}): ${text.slice(0, 150)}`)
          }
        }
        let data
        try {
          data = JSON.parse(text)
        } catch {
          throw new Error(`OpenAI returned invalid JSON: ${text.slice(0, 150)}`)
        }
        if (data.error) throw new Error(data.error.message)
        response = data.choices?.[0]?.message?.content || ''
      } else {
        // Fall back to the agent router (n8n/mcp)
        response = normalizeAssistantResult(
          await sendMessageToAgent(userMessage, [], systemPrompt, undefined)
        ).text
      }

      // If the agent returned only a summary with no code blocks, retry once with strict output
      const hasCodeBlocks = /```/.test(response || '')
      const mentionsFiles = /(files created|files updated|created .*files|updated .*files|files:)/i.test(response || '')
      if (!hasCodeBlocks && mentionsFiles) {
        const strictSystemPrompt = `${systemPrompt}\n\nIMPORTANT: Return ONLY code blocks for files. No explanations or summaries.`
        if (selectedAgent?.provider === 'openrouter') {
          const strictMessages = [
            { role: 'system', content: strictSystemPrompt },
            ...codeMessages.slice(-6),
            { role: 'user', content: userMessage }
          ]
          const strictResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openRouterApiKey.trim()}`,
              'HTTP-Referer': window.location.origin,
            },
            body: JSON.stringify({
              model: selectedAgent.model || 'openai/gpt-4o',
              messages: strictMessages,
              max_tokens: 4096,
              temperature: Number(selectedAgent.temperature ?? 0.7),
            })
          })
          const strictText = await strictResp.text()
          if (strictResp.ok) {
            try {
              const strictData = JSON.parse(strictText)
              response = strictData?.choices?.[0]?.message?.content || response
            } catch {}
          }
        } else {
          response = normalizeAssistantResult(
            await sendMessageToAgent(userMessage, [], strictSystemPrompt, undefined)
          ).text
        }
      }

      // Parse response for file changes - supports multiple formats
      const newPendingChanges = { ...pendingFileChanges }
      let didChangePending = false
      const generatedFiles = {}
      const fileTypeCounters = {}
      
      // Parse ALL code blocks and extract files
      const allBlocksRegex = /```([^\n]*)\n([\s\S]*?)```/g
      let match
      
      while ((match = allBlocksRegex.exec(response)) !== null) {
        const header = match[1].trim()
        const content = match[2]
        
        if (!content.trim()) continue
        
        let filePath = null
        let lang = null
        
        // Check for language:filename format (e.g., html:index.html, javascript:game.js)
        if (header.includes(':')) {
          const parts = header.split(':')
          const part1 = parts[0].trim().toLowerCase()
          const part2 = parts.slice(1).join(':').trim()
          
          if (part1 === 'filename') {
            // Format: filename:path/to/file.js
            filePath = part2
          } else if (codeLangToExt[part1]) {
            // Format: javascript:filename.js
            lang = part1
            filePath = part2
          } else {
            // Unknown format, treat as language
            lang = part1
          }
        } else {
          // Standard format: just language (e.g., ```html)
          lang = header.toLowerCase()
        }
        
        // If we got a filename, use it
        if (filePath) {
          generatedFiles[filePath] = content
          newPendingChanges[filePath] = { content, action: 'update' }
          didChangePending = true
        } else if (lang && codeLangToExt[lang]) {
          // Assign default filename based on language
          const ext = codeLangToExt[lang]
          fileTypeCounters[ext] = (fileTypeCounters[ext] || 0) + 1
          const count = fileTypeCounters[ext]
          const defaultName = codeExtToDefaultName[ext] || `file.${ext}`
          
          if (count === 1) {
            filePath = defaultName
          } else {
            const baseName = defaultName.replace(`.${ext}`, '')
            filePath = `${baseName}_${count}.${ext}`
          }
          
          generatedFiles[filePath] = content
          newPendingChanges[filePath] = { content, action: 'update' }
          didChangePending = true
        }
      }

      if (Object.keys(generatedFiles).length === 0) {
        showToast('No code blocks returned. Ask for code changes or try again.')
      }
      
      // For local projects: Create files in the project
      if (codeEditorMode === 'local' && activeLocalProject) {
        const projectData = localProjectFiles[activeLocalProject.id] || { files: [], fileContents: {}, expandedFolders: {} }
        const existingFiles = projectData.files || []
        const existingContents = projectData.fileContents || {}
        
        // Update local project files with generated code
        if (Object.keys(generatedFiles).length > 0) {
          const updatedFiles = [...existingFiles]
          const updatedContents = { ...existingContents }
          const filesToOpen = []
          
          Object.entries(generatedFiles).forEach(([filePath, content]) => {
            const existingFileIndex = updatedFiles.findIndex(f => f.path === filePath)
            
            if (existingFileIndex === -1) {
              // Create new file
              const newFile = {
                id: generateId(),
                name: filePath.split('/').pop(),
                path: filePath,
                type: 'file'
              }
              updatedFiles.push(newFile)
            }
            
            updatedContents[filePath] = content
            filesToOpen.push({ name: filePath.split('/').pop(), path: filePath, type: 'file' })
          })
          
          // Save to local project files
          setLocalProjectFiles(prev => {
            const updated = { ...prev }
            updated[activeLocalProject.id] = {
              ...projectData,
              files: updatedFiles,
              fileContents: updatedContents
            }
            localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
            return updated
          })
          
          // Update project's updatedAt
          setLocalProjects(prev => prev.map(p =>
            p.id === activeLocalProject.id ? { ...p, updatedAt: new Date().toISOString() } : p
          ))
          
          // Open generated files in tabs
          filesToOpen.forEach((file, index) => {
            setTimeout(() => {
              openFileInTab(file, activeLocalProject.id)
            }, index * 100) // Stagger to avoid race conditions
          })
          
          showToast(`Generated ${Object.keys(generatedFiles).length} file(s)`)
        }
      }
      
      // For GitHub mode, auto-apply the changes to create files in the repo
      if (codeEditorMode === 'github' && selectedRepo && didChangePending) {
        setPendingFileChanges(newPendingChanges)

        // Auto-apply all pending changes to GitHub
        const filePaths = Object.keys(newPendingChanges)
        const failedPaths = []
        for (const filePath of filePaths) {
          try {
            const change = newPendingChanges[filePath]
            const owner = selectedRepo.owner.login
            const repo = selectedRepo.name

            // Check if file exists to get SHA
            let sha = null
            try {
              const existing = await githubApi(`/repos/${owner}/${repo}/contents/${filePath}?ref=${repoBranch}`)
              sha = existing.sha
            } catch {
              // File doesn't exist, that's fine
            }

            // Create or update file
            await githubApi(`/repos/${owner}/${repo}/contents/${filePath}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: sha ? `Update ${filePath}` : `Create ${filePath}`,
                content: btoa(unescape(encodeURIComponent(change.content))),
                branch: repoBranch,
                ...(sha && { sha })
              })
            })

            // Update current view immediately if this file is open/selected
            if (selectedFile?.path === filePath) {
              setFileContent(change.content)
              setSelectedFile((prev) => prev ? { ...prev, decodedContent: change.content } : prev)
            }
            setGithubTabContents((prev) => ({ ...prev, [filePath]: change.content }))
          } catch (e) {
            console.error(`Failed to create/update ${filePath}:`, e)
            failedPaths.push(filePath)
          }
        }

        if (failedPaths.length === 0) {
          // Clear pending changes and refresh file tree
          setPendingFileChanges({})
          await loadRepoFiles(selectedRepo.owner.login, selectedRepo.name)
          showToast(`Created ${filePaths.length} file(s) in ${selectedRepo.name}`)
        } else {
          // Keep failed paths in pending changes for manual retry
          const remaining = {}
          failedPaths.forEach(path => {
            if (newPendingChanges[path]) remaining[path] = newPendingChanges[path]
          })
          setPendingFileChanges(remaining)
          showToast(`Failed to write ${failedPaths.length} file(s). Check GitHub token permissions.`)
        }
      }

      // Extract explanation text (remove code blocks) for chat display
      let explanationText = response
      const createdFiles = Object.keys(generatedFiles)
      
      // Remove code blocks from explanation text
      explanationText = response.replace(/```[\s\S]*?```/g, '').trim()
      
      // If no explanation left, create a summary
      if (!explanationText || explanationText.length < 20) {
        if (createdFiles.length > 0) {
          explanationText = `I've created/updated the following files:\n${createdFiles.map(f => `• ${f}`).join('\n')}\n\nYou can view and edit them in the code editor.`
        } else {
          explanationText = 'Done! Check the code editor for the generated files.'
        }
      } else if (createdFiles.length > 0) {
        // Add file summary to explanation
        explanationText += `\n\n**Files created/updated:**\n${createdFiles.map(f => `• ${f}`).join('\n')}`
      }

      setCodeMessages(prev => [...prev, { role: 'assistant', content: explanationText, files: createdFiles }])
    } catch (err) {
      showToast(`Error: ${err.message}`)
      setCodeMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${err.message}` 
      }])
    } finally {
      setCodeGenerating(false)
    }
  }

  // Apply pending file changes to GitHub
  const applyPendingChange = async (path) => {
    if (!selectedRepo || !pendingFileChanges[path]) return
    
    const change = pendingFileChanges[path]
    const owner = selectedRepo.owner.login
    const repo = selectedRepo.name

    // Check if file exists to get SHA
    let sha = null
    try {
      const existing = await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${repoBranch}`)
      sha = existing.sha
    } catch {
      // File doesn't exist, will create
    }

    const success = await createOrUpdateFile(
      owner,
      repo,
      path,
      change.content,
      `Update ${path} via Code Assistant`,
      sha
    )

    if (success) {
      setPendingFileChanges(prev => {
        const next = { ...prev }
        delete next[path]
        return next
      })
      // Refresh file tree
      await loadRepoFiles(owner, repo)
    }
  }

  const applyAllPendingChanges = async () => {
    if (!selectedRepo) return
    const paths = Object.keys(pendingFileChanges)
    for (const path of paths) {
      await applyPendingChange(path)
    }
  }

  // =============== LOCAL CODE EDITOR FUNCTIONS ===============

  // Save local projects to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('codeEditorProjects', JSON.stringify(localProjects))
  }, [localProjects])

  // Generate unique ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // Get project templates
  const getProjectTemplate = (type) => {
    const templates = {
      html: [
        { name: 'index.html', path: 'index.html', type: 'file', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My Project</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <h1>Hello World</h1>\n  <script src="script.js"></script>\n</body>\n</html>' },
        { name: 'styles.css', path: 'styles.css', type: 'file', content: '* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n  padding: 20px;\n}\n\nh1 {\n  color: #333;\n}' },
        { name: 'script.js', path: 'script.js', type: 'file', content: '// Your JavaScript code here\nconsole.log("Hello from script.js!");' }
      ],
      react: [
        { name: 'index.html', path: 'index.html', type: 'file', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>React App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="main.jsx"></script>\n</body>\n</html>' },
        { name: 'main.jsx', path: 'main.jsx', type: 'file', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);' },
        { name: 'App.jsx', path: 'App.jsx', type: 'file', content: 'import React, { useState } from "react";\n\nfunction App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div className="app">\n      <h1>React App</h1>\n      <button onClick={() => setCount(c => c + 1)}>\n        Count: {count}\n      </button>\n    </div>\n  );\n}\n\nexport default App;' }
      ],
      node: [
        { name: 'index.js', path: 'index.js', type: 'file', content: 'const http = require("http");\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { "Content-Type": "text/plain" });\n  res.end("Hello from Node.js!");\n});\n\nserver.listen(3000, () => {\n  console.log("Server running at http://localhost:3000/");\n});' },
        { name: 'package.json', path: 'package.json', type: 'file', content: '{\n  "name": "node-project",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js"\n  }\n}' }
      ],
      python: [
        { name: 'main.py', path: 'main.py', type: 'file', content: '# Python Project\n\ndef main():\n    print("Hello from Python!")\n\nif __name__ == "__main__":\n    main()' },
        { name: 'requirements.txt', path: 'requirements.txt', type: 'file', content: '# Add your dependencies here\n# requests==2.28.0' }
      ],
      blank: []
    }
    return templates[type] || []
  }

  // Create a new local project
  const createLocalProject = () => {
    const name = newLocalProjectName.trim()
    if (!name) {
      showToast('Please enter a project name')
      return
    }

    const projectId = generateId()
    const template = getProjectTemplate(newLocalProjectType)

    // Convert template to file structure
    const files = template.map(f => ({
      ...f,
      id: generateId()
    }))

    const newProject = {
      id: projectId,
      name,
      type: newLocalProjectType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Save files separately
    const projectFiles = { ...localProjectFiles }
    projectFiles[projectId] = {
      files,
      fileContents: template.reduce((acc, f) => {
        acc[f.path] = f.content
        return acc
      }, {}),
      expandedFolders: {}
    }
    setLocalProjectFiles(projectFiles)
    localStorage.setItem('codeEditorProjectFiles', JSON.stringify(projectFiles))

    setLocalProjects(prev => [...prev, newProject])
    setActiveLocalProject(newProject)
    setShowNewProjectModal(false)
    setNewLocalProjectName('')
    setNewLocalProjectType('html')
    showToast(`Created project: ${name}`)

    // Open first file if available
    if (files.length > 0) {
      const firstFile = files.find(f => f.type === 'file')
      if (firstFile) {
        openFileInTab(firstFile, projectId)
      }
    }
  }

  // Load project files from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('codeEditorProjectFiles')
    if (saved) {
      setLocalProjectFiles(JSON.parse(saved))
    }
  }, [])

  // Select a local project
  const selectLocalProject = (project) => {
    setActiveLocalProject(project)
    setOpenTabs([])
    setActiveTabId(null)
    setEditorContent('')

    // Load first file if available
    const projectData = localProjectFiles[project.id]
    if (projectData?.files?.length > 0) {
      const firstFile = projectData.files.find(f => f.type === 'file')
      if (firstFile) {
        openFileInTab(firstFile, project.id)
      }
    }
  }

  // Open file in a new tab
  const openFileInTab = (file, projectId) => {
    const tabId = `${projectId}-${file.path}`

    // Check if tab already exists
    const existingTab = openTabs.find(t => t.id === tabId)
    if (existingTab) {
      setActiveTabId(tabId)
      const projectData = localProjectFiles[projectId]
      setEditorContent(projectData?.fileContents?.[file.path] || '')
      return
    }

    // Add new tab
    const newTab = {
      id: tabId,
      path: file.path,
      name: file.name,
      projectId
    }
    setOpenTabs(prev => [...prev, newTab])
    setActiveTabId(tabId)

    // Load file content
    const projectData = localProjectFiles[projectId]
    setEditorContent(projectData?.fileContents?.[file.path] || '')
  }

  // Open a GitHub file in a new tab
  const openGithubTab = async (file) => {
    if (!selectedRepo || !file || file.type !== 'file') return
    const tabId = file.path

    const existingTab = githubOpenTabs.find(t => t.id === tabId)
    if (!existingTab) {
      setGithubOpenTabs(prev => [...prev, { id: tabId, path: file.path, name: file.name, file }])
    }
    setGithubActiveTabId(tabId)
    setGithubFileEditing(false)
    setGithubEditContent('')
    const content = await loadFileContent(selectedRepo.owner.login, selectedRepo.name, file.path)
    setGithubTabContents(prev => ({ ...prev, [file.path]: content }))
  }

  const switchGithubTab = async (tab) => {
    if (!selectedRepo || !tab) return
    setGithubActiveTabId(tab.id)
    setGithubFileEditing(false)
    setGithubEditContent('')
    setSelectedFile(tab.file || { path: tab.path, name: tab.name })

    const cached = githubTabContents[tab.path]
    if (cached != null) {
      setFileContent(cached)
      return
    }
    const content = await loadFileContent(selectedRepo.owner.login, selectedRepo.name, tab.path)
    setGithubTabContents(prev => ({ ...prev, [tab.path]: content }))
  }

  const closeGithubTab = (tabId) => {
    setGithubOpenTabs(prev => prev.filter(t => t.id !== tabId))
    setGithubTabContents(prev => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })

    if (githubActiveTabId === tabId) {
      const remaining = githubOpenTabs.filter(t => t.id !== tabId)
      if (remaining.length > 0) {
        const nextTab = remaining[remaining.length - 1]
        setGithubActiveTabId(nextTab.id)
        setSelectedFile(nextTab.file || { path: nextTab.path, name: nextTab.name })
        const cached = githubTabContents[nextTab.path]
        setFileContent(cached || '')
      } else {
        setGithubActiveTabId(null)
        setSelectedFile(null)
        setFileContent('')
      }
    }
  }

  // Get or create a project for a chat conversation (for AI-generated code files)
  const getOrCreateChatProject = (conversationId, conversationTitle) => {
    const projectId = `chat-${conversationId}`
    const existing = localProjects.find(p => p.id === projectId)
    if (existing) return existing

    const newProject = {
      id: projectId,
      name: conversationTitle || 'AI Generated Code',
      type: 'blank',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Initialize project files synchronously in localStorage first
    const currentFiles = JSON.parse(localStorage.getItem('codeEditorProjectFiles') || '{}')
    if (!currentFiles[projectId]) {
      currentFiles[projectId] = { files: [], fileContents: {}, expandedFolders: {} }
      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(currentFiles))
    }

    // Then update state
    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      if (!updated[projectId]) {
        updated[projectId] = { files: [], fileContents: {}, expandedFolders: {} }
      }
      return updated
    })

    setLocalProjects(prev => {
      // Check if already added (in case of rapid calls)
      if (prev.find(p => p.id === projectId)) return prev
      return [...prev, newProject]
    })

    return newProject
  }

  // Add a file to a project and open it in editor (for AI-generated code)
  const addFileToProject = (projectId, filename, content, language) => {
    const filePath = filename
    const tabId = `${projectId}-${filePath}`

    // Update project files state
    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      const projectData = updated[projectId] || { files: [], fileContents: {}, expandedFolders: {} }

      // Check if file exists, update or create
      const existingFile = projectData.files.find(f => f.path === filePath)
      if (existingFile) {
        // Update existing file content
        updated[projectId] = {
          ...projectData,
          fileContents: { ...projectData.fileContents, [filePath]: content }
        }
      } else {
        // Create new file
        const newFile = { id: generateId(), name: filename, path: filePath, type: 'file' }
        updated[projectId] = {
          ...projectData,
          files: [...projectData.files, newFile],
          fileContents: { ...projectData.fileContents, [filePath]: content }
        }
      }

      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    // Set active project
    setLocalProjects(prev => {
      const project = prev.find(p => p.id === projectId)
      if (project) {
        setActiveLocalProject(project)
      }
      return prev
    })

    // Add tab and set content directly (don't rely on state which may not be updated yet)
    const existingTab = openTabs.find(t => t.id === tabId)
    if (!existingTab) {
      const newTab = { id: tabId, path: filePath, name: filename, projectId }
      setOpenTabs(prev => [...prev, newTab])
    }
    setActiveTabId(tabId)
    setEditorContent(content) // Set content directly since state may not be updated
  }

  // Update ref for opening files in code editor (used by click handler)
  useEffect(() => {
    openFileInCodeEditor.current = (filename, code, language, conversationId, conversationTitle) => {
      // Fall back to active conversation if no ID provided
      const convId = conversationId || activeConversation
      const convTitle = conversationTitle || currentConversation?.title
      const project = getOrCreateChatProject(convId, convTitle)
      addFileToProject(project.id, filename, code, language)
      setShowCodePage(true)
      setCodeEditorMode('local')
    }
  }, [localProjects, activeConversation, currentConversation?.title])

  // Close a tab
  const closeTab = (tabId, e) => {
    e?.stopPropagation()

    // Check for unsaved changes
    if (unsavedChanges[tabId]) {
      if (!confirm('You have unsaved changes. Close anyway?')) return
    }

    setOpenTabs(prev => prev.filter(t => t.id !== tabId))
    setUnsavedChanges(prev => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })

    // If closing active tab, switch to another
    if (activeTabId === tabId) {
      const remaining = openTabs.filter(t => t.id !== tabId)
      if (remaining.length > 0) {
        const newActive = remaining[remaining.length - 1]
        setActiveTabId(newActive.id)
        const projectData = localProjectFiles[newActive.projectId]
        setEditorContent(projectData?.fileContents?.[newActive.path] || '')
      } else {
        setActiveTabId(null)
        setEditorContent('')
      }
    }
  }

  // Switch to a tab
  const switchToTab = (tab) => {
    // Save current content before switching
    if (activeTabId && unsavedChanges[activeTabId]) {
      const currentTab = openTabs.find(t => t.id === activeTabId)
      if (currentTab) {
        saveFileContent(currentTab.projectId, currentTab.path, editorContent)
      }
    }

    setActiveTabId(tab.id)
    const projectData = localProjectFiles[tab.projectId]
    setEditorContent(projectData?.fileContents?.[tab.path] || '')
  }

  // Handle editor content change
  const handleEditorChange = (e) => {
    const newContent = e.target.value
    setEditorContent(newContent)
    if (activeTabId) {
      setUnsavedChanges(prev => ({ ...prev, [activeTabId]: true }))
    }
  }

  // Save file content
  const saveFileContent = (projectId, path, content) => {
    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      if (!updated[projectId]) {
        updated[projectId] = { files: [], fileContents: {}, expandedFolders: {} }
      }
      updated[projectId] = {
        ...updated[projectId],
        fileContents: {
          ...updated[projectId].fileContents,
          [path]: content
        }
      }
      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    // Update project's updatedAt
    setLocalProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, updatedAt: new Date().toISOString() } : p
    ))

    syncWebContainerFile(projectId, path, content)
  }

  // Save current file (Cmd+S handler)
  const saveCurrentFile = () => {
    if (!activeTabId) return
    const currentTab = openTabs.find(t => t.id === activeTabId)
    if (currentTab) {
      saveFileContent(currentTab.projectId, currentTab.path, editorContent)
      setUnsavedChanges(prev => ({ ...prev, [activeTabId]: false }))
      showToast(`Saved ${currentTab.name}`)
    }
  }

  // Create new file in project
  const createNewFile = () => {
    if (!activeLocalProject || !newItemName.trim()) {
      showToast('Please enter a file name')
      return
    }

    const fileName = newItemName.trim()
    const filePath = newItemParent ? `${newItemParent}/${fileName}` : fileName

    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      const projectData = updated[activeLocalProject.id] || { files: [], fileContents: {}, expandedFolders: {} }

      const newFile = {
        id: generateId(),
        name: fileName,
        path: filePath,
        type: 'file'
      }

      updated[activeLocalProject.id] = {
        ...projectData,
        files: [...projectData.files, newFile],
        fileContents: {
          ...projectData.fileContents,
          [filePath]: ''
        }
      }

      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    setShowNewFileModal(false)
    setNewItemName('')
    setNewItemParent('')
    showToast(`Created ${fileName}`)

    syncWebContainerFile(activeLocalProject.id, filePath, '')

    // Open the new file
    openFileInTab({ name: fileName, path: filePath, type: 'file' }, activeLocalProject.id)
  }

  // Create new folder in project
  const createNewFolder = () => {
    if (!activeLocalProject || !newItemName.trim()) {
      showToast('Please enter a folder name')
      return
    }

    const folderName = newItemName.trim()
    const folderPath = newItemParent ? `${newItemParent}/${folderName}` : folderName

    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      const projectData = updated[activeLocalProject.id] || { files: [], fileContents: {}, expandedFolders: {} }

      const newFolder = {
        id: generateId(),
        name: folderName,
        path: folderPath,
        type: 'dir'
      }

      updated[activeLocalProject.id] = {
        ...projectData,
        files: [...projectData.files, newFolder],
        expandedFolders: {
          ...projectData.expandedFolders,
          [folderPath]: true
        }
      }

      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    setShowNewFolderModal(false)
    setNewItemName('')
    setNewItemParent('')
    showToast(`Created folder ${folderName}`)

    syncWebContainerFolder(activeLocalProject.id, folderPath)
  }

  // Delete file or folder
  const deleteLocalFile = (file) => {
    if (!activeLocalProject) return
    if (!confirm(`Delete "${file.name}"?`)) return

    // Close tab if open
    const tabId = `${activeLocalProject.id}-${file.path}`
    if (openTabs.find(t => t.id === tabId)) {
      closeTab(tabId)
    }

    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      const projectData = updated[activeLocalProject.id]
      if (!projectData) return prev

      // Remove file and all children if folder
      const pathPrefix = file.path + '/'
      const newFiles = projectData.files.filter(f =>
        f.path !== file.path && !f.path.startsWith(pathPrefix)
      )

      const newContents = { ...projectData.fileContents }
      delete newContents[file.path]
      Object.keys(newContents).forEach(p => {
        if (p.startsWith(pathPrefix)) delete newContents[p]
      })

      updated[activeLocalProject.id] = {
        ...projectData,
        files: newFiles,
        fileContents: newContents
      }

      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    setContextMenuFile(null)
    showToast(`Deleted ${file.name}`)
  }

  // Rename file or folder
  const renameLocalFile = () => {
    if (!activeLocalProject || !contextMenuFile || !renameValue.trim()) return

    const oldPath = contextMenuFile.path
    const oldName = contextMenuFile.name
    const newName = renameValue.trim()
    const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : ''
    const newPath = parentPath ? `${parentPath}/${newName}` : newName

    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      const projectData = updated[activeLocalProject.id]
      if (!projectData) return prev

      // Update file path
      const newFiles = projectData.files.map(f => {
        if (f.path === oldPath) {
          return { ...f, name: newName, path: newPath }
        }
        // Update children paths if folder
        if (f.path.startsWith(oldPath + '/')) {
          const newChildPath = newPath + f.path.substring(oldPath.length)
          return { ...f, path: newChildPath }
        }
        return f
      })

      // Update file contents
      const newContents = {}
      Object.entries(projectData.fileContents).forEach(([p, content]) => {
        if (p === oldPath) {
          newContents[newPath] = content
        } else if (p.startsWith(oldPath + '/')) {
          const newChildPath = newPath + p.substring(oldPath.length)
          newContents[newChildPath] = content
        } else {
          newContents[p] = content
        }
      })

      updated[activeLocalProject.id] = {
        ...projectData,
        files: newFiles,
        fileContents: newContents
      }

      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    // Update open tabs
    setOpenTabs(prev => prev.map(t => {
      if (t.path === oldPath) {
        return { ...t, path: newPath, name: newName, id: `${t.projectId}-${newPath}` }
      }
      if (t.path.startsWith(oldPath + '/')) {
        const newTabPath = newPath + t.path.substring(oldPath.length)
        return { ...t, path: newTabPath, id: `${t.projectId}-${newTabPath}` }
      }
      return t
    }))

    if (activeTabId?.includes(oldPath)) {
      setActiveTabId(activeTabId.replace(oldPath, newPath))
    }

    setShowRenameModal(false)
    setContextMenuFile(null)
    setRenameValue('')
    showToast(`Renamed to ${newName}`)
  }

  // Delete local project
  const deleteLocalProject = (project) => {
    if (!confirm(`Delete project "${project.name}" and all its files?`)) return

    // Close all tabs from this project
    setOpenTabs(prev => prev.filter(t => t.projectId !== project.id))

    // Remove project files
    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      delete updated[project.id]
      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })

    // Remove project
    setLocalProjects(prev => prev.filter(p => p.id !== project.id))

    if (activeLocalProject?.id === project.id) {
      setActiveLocalProject(null)
      setActiveTabId(null)
      setEditorContent('')
    }

    showToast(`Deleted project: ${project.name}`)
  }

  // Toggle local folder expansion
  const toggleLocalFolder = (path) => {
    if (!activeLocalProject) return

    setLocalProjectFiles(prev => {
      const updated = { ...prev }
      const projectData = updated[activeLocalProject.id]
      if (!projectData) return prev

      updated[activeLocalProject.id] = {
        ...projectData,
        expandedFolders: {
          ...projectData.expandedFolders,
          [path]: !projectData.expandedFolders[path]
        }
      }

      localStorage.setItem('codeEditorProjectFiles', JSON.stringify(updated))
      return updated
    })
  }

  // Build file tree structure from flat files array
  const buildFileTree = (files) => {
    if (!files || !Array.isArray(files)) return []

    // Group files by parent directory
    const tree = []
    const dirs = {}

    files.forEach(file => {
      const parts = file.path.split('/')
      if (parts.length === 1) {
        // Root level file/folder
        tree.push(file)
      } else {
        // Nested - ensure parent directories exist
        const parentPath = parts.slice(0, -1).join('/')
        if (!dirs[parentPath]) {
          dirs[parentPath] = []
        }
        dirs[parentPath].push(file)
      }
    })

    // Sort: folders first, then alphabetically
    const sortItems = (items) => items.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (a.type !== 'dir' && b.type === 'dir') return 1
      return a.name.localeCompare(b.name)
    })

    return sortItems(tree)
  }

  // Run preview for HTML/CSS/JS projects
  const runLocalPreview = () => {
    if (!activeLocalProject) return

    const projectData = localProjectFiles[activeLocalProject.id]
    if (!projectData) return

    // Get HTML file
    const htmlContent = projectData.fileContents['index.html'] || ''
    const cssContent = projectData.fileContents['styles.css'] || projectData.fileContents['style.css'] || ''
    const jsContent = projectData.fileContents['script.js'] || projectData.fileContents['main.js'] || ''

    // Build preview HTML
    let previewHtml = htmlContent

    // Inject CSS if not already linked
    if (cssContent && !htmlContent.includes('<link') && !htmlContent.includes('<style>')) {
      previewHtml = previewHtml.replace('</head>', `<style>${cssContent}</style></head>`)
    } else if (cssContent) {
      // Replace external CSS link with inline
      previewHtml = previewHtml.replace(/<link[^>]*href=["']styles?\.css["'][^>]*>/gi, `<style>${cssContent}</style>`)
    }

    // Inject JS if not already linked
    if (jsContent && !htmlContent.includes('<script src')) {
      previewHtml = previewHtml.replace('</body>', `<script>${jsContent}</script></body>`)
    } else if (jsContent) {
      // Replace external JS link with inline
      previewHtml = previewHtml.replace(/<script[^>]*src=["'](script|main)\.js["'][^>]*><\/script>/gi, `<script>${jsContent}</script>`)
    }

    // Add console capture
    const consoleCapture = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;

          function sendToParent(type, args) {
            window.parent.postMessage({
              type: 'console',
              level: type,
              message: Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
            }, '*');
          }

          console.log = function() { sendToParent('log', arguments); originalLog.apply(console, arguments); };
          console.error = function() { sendToParent('error', arguments); originalError.apply(console, arguments); };
          console.warn = function() { sendToParent('warn', arguments); originalWarn.apply(console, arguments); };

          window.onerror = function(msg, url, line) {
            sendToParent('error', ['Error: ' + msg + ' (line ' + line + ')']);
          };
        })();
      </script>
    `
    previewHtml = previewHtml.replace('<head>', '<head>' + consoleCapture)

    setPreviewContent(previewHtml)
    setShowPreviewPanel(true)
    setConsoleOutput([{ level: 'info', message: 'Preview started...' }])
  }

  const openPreviewModal = async () => {
    let previewHtml = ''

    // Open modal immediately so first click always shows it
    setPreviewContent('')
    setShowPreviewModal(true)

    if (codeEditorMode === 'local') {
      if (!activeLocalProject) return
      const projectData = localProjectFiles[activeLocalProject.id]
      if (!projectData) return

      const htmlContent = projectData.fileContents['index.html'] || ''
      const cssContent = projectData.fileContents['styles.css'] || projectData.fileContents['style.css'] || ''
      const jsContent = projectData.fileContents['script.js'] || projectData.fileContents['main.js'] || ''

      previewHtml = htmlContent
      if (cssContent && !htmlContent.includes('<link') && !htmlContent.includes('<style>')) {
        previewHtml = previewHtml.replace('</head>', `<style>${cssContent}</style></head>`)
      } else if (cssContent) {
        previewHtml = previewHtml.replace(/<link[^>]*href=["']styles?\.css["'][^>]*>/gi, `<style>${cssContent}</style>`)
      }
      if (jsContent && !htmlContent.includes('<script src')) {
        previewHtml = previewHtml.replace('</body>', `<script>${jsContent}</script></body>`)
      } else if (jsContent) {
        previewHtml = previewHtml.replace(/<script[^>]*src=["'](script|main)\.js["'][^>]*><\/script>/gi, `<script>${jsContent}</script>`)
      }
    } else if (codeEditorMode === 'github' && selectedRepo) {
      const owner = selectedRepo.owner.login
      const repo = selectedRepo.name

      const getRepoFileContent = async (path) => {
        if (pendingFileChanges[path]?.content) return pendingFileChanges[path].content
        try {
          const file = await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${repoBranch}`)
          return file.content ? atob(file.content) : ''
        } catch {
          return ''
        }
      }

      const htmlContent = await getRepoFileContent('index.html')
      const cssContent = await getRepoFileContent('styles.css') || await getRepoFileContent('style.css')
      const jsContent = await getRepoFileContent('script.js') || await getRepoFileContent('main.js')
      if (!htmlContent) {
        showToast('No index.html found for preview')
        return
      }

      previewHtml = htmlContent
      if (cssContent && !htmlContent.includes('<link') && !htmlContent.includes('<style>')) {
        previewHtml = previewHtml.replace('</head>', `<style>${cssContent}</style></head>`)
      } else if (cssContent) {
        previewHtml = previewHtml.replace(/<link[^>]*href=["']styles?\.css["'][^>]*>/gi, `<style>${cssContent}</style>`)
      }
      if (jsContent && !htmlContent.includes('<script src')) {
        previewHtml = previewHtml.replace('</body>', `<script>${jsContent}</script></body>`)
      } else if (jsContent) {
        previewHtml = previewHtml.replace(/<script[^>]*src=["'](script|main)\.js["'][^>]*><\/script>/gi, `<script>${jsContent}</script>`)
      }
    }

    if (!previewHtml) {
      showToast('No preview content available')
      return
    }

    const consoleCapture = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;

          function sendToParent(type, args) {
            window.parent.postMessage({
              type: 'console',
              level: type,
              message: Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
            }, '*');
          }

          console.log = function() { sendToParent('log', arguments); originalLog.apply(console, arguments); };
          console.error = function() { sendToParent('error', arguments); originalError.apply(console, arguments); };
          console.warn = function() { sendToParent('warn', arguments); originalWarn.apply(console, arguments); };

          window.onerror = function(msg, url, line) {
            sendToParent('error', ['Error: ' + msg + ' (line ' + line + ')']);
          };
        })();
      </script>
    `
    previewHtml = previewHtml.replace('<head>', '<head>' + consoleCapture)

    setPreviewContent(previewHtml)
    setShowPreviewPanel(false)
    setConsoleOutput([{ level: 'info', message: 'Preview started...' }])
  }

  // Listen for console messages from preview iframe
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'console') {
        setConsoleOutput(prev => [...prev, { level: event.data.level, message: event.data.message }])
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const supportsWebContainer = () =>
    typeof window !== 'undefined' &&
    window.crossOriginIsolated &&
    typeof SharedArrayBuffer !== 'undefined'

  const appendTerminalOutput = useCallback((text, kind = 'output') => {
    if (!text) return
    setTerminalOutput(prev => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last && last.kind === kind && kind === 'output') {
        last.text += text
        return [...next]
      }
      next.push({ kind, text })
      return next
    })
  }, [])

  const normalizeTerminalPath = (path) => {
    const parts = path.split('/').filter(Boolean)
    const stack = []
    parts.forEach((part) => {
      if (part === '.' || part === '') return
      if (part === '..') {
        stack.pop()
        return
      }
      stack.push(part)
    })
    return `/${stack.join('/')}`
  }

  const resolveTerminalPath = (path) => {
    if (!path || path === '/') return '/'
    const base = path.startsWith('/') ? path : `${terminalCwd}/${path}`
    return normalizeTerminalPath(base)
  }

  const buildWebContainerTree = (projectData) => {
    const tree = {}
    const fileContents = projectData?.fileContents || {}
    const files = projectData?.files || []

    const ensureDir = (segments) => {
      let current = tree
      segments.forEach((segment) => {
        if (!current[segment]) {
          current[segment] = { directory: {} }
        }
        current = current[segment].directory
      })
    }

    const addFile = (filePath, content = '') => {
      const segments = filePath.split('/').filter(Boolean)
      if (segments.length === 0) return
      const dirs = segments.slice(0, -1)
      const filename = segments[segments.length - 1]
      if (dirs.length > 0) ensureDir(dirs)
      let current = tree
      dirs.forEach((dir) => {
        current = current[dir].directory
      })
      current[filename] = { file: { contents: content } }
    }

    files.filter(f => f.type === 'dir').forEach((dir) => {
      const segments = dir.path.split('/').filter(Boolean)
      if (segments.length > 0) ensureDir(segments)
    })

    Object.entries(fileContents).forEach(([path, content]) => {
      addFile(path, content)
    })

    return tree
  }

  const ensureWebContainerDir = async (container, filePath) => {
    const segments = filePath.split('/').filter(Boolean)
    if (segments.length <= 1) return
    let current = ''
    for (let i = 0; i < segments.length - 1; i += 1) {
      current += `/${segments[i]}`
      try {
        await container.fs.mkdir(current)
      } catch {
        // ignore if folder already exists
      }
    }
  }

  const ensureWebContainer = async () => {
    if (!activeLocalProject) {
      setTerminalError('Select or create a local project to use the terminal.')
      return null
    }
    if (!supportsWebContainer()) {
      setTerminalError('Terminal requires cross-origin isolation (COOP/COEP headers).')
      return null
    }
    setTerminalError('')

    let container = webcontainerRef.current
    if (!container) {
      setTerminalStatus('booting')
      container = await WebContainer.boot()
      webcontainerRef.current = container
    }

    if (webcontainerProjectIdRef.current !== activeLocalProject.id) {
      setTerminalStatus('mounting')
      const projectData = localProjectFiles[activeLocalProject.id]
      const tree = buildWebContainerTree(projectData)
      await container.mount(tree)
      webcontainerProjectIdRef.current = activeLocalProject.id
      setTerminalCwd('/')
      setTerminalOutput([
        { kind: 'info', text: `Mounted project: ${activeLocalProject.name}\n` }
      ])
    }

    setTerminalStatus('idle')
    return container
  }

  const syncWebContainerFile = async (projectId, path, content) => {
    const container = webcontainerRef.current
    if (!container || webcontainerProjectIdRef.current !== projectId) return
    try {
      await ensureWebContainerDir(container, path)
      await container.fs.writeFile(path, content ?? '')
    } catch (err) {
      console.error('Failed to sync file to terminal:', err)
    }
  }

  const syncWebContainerFolder = async (projectId, folderPath) => {
    const container = webcontainerRef.current
    if (!container || webcontainerProjectIdRef.current !== projectId) return
    const segments = folderPath.split('/').filter(Boolean)
    if (segments.length === 0) return
    let current = ''
    try {
      for (let i = 0; i < segments.length; i += 1) {
        current += `/${segments[i]}`
        try {
          await container.fs.mkdir(current)
        } catch {
          // ignore if folder already exists
        }
      }
    } catch (err) {
      console.error('Failed to sync folder to terminal:', err)
    }
  }

  const parseTerminalCommand = (input) => {
    const args = []
    let current = ''
    let quote = null
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i]
      if (quote) {
        if (char === quote) {
          quote = null
        } else if (char === '\\' && i + 1 < input.length) {
          current += input[i + 1]
          i += 1
        } else {
          current += char
        }
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === ' ') {
        if (current) {
          args.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }
    if (current) args.push(current)
    return { command: args[0], args: args.slice(1) }
  }

  const handleTerminalCommand = async (rawInput) => {
    const trimmed = rawInput.trim()
    if (!trimmed) return

    setConsoleTab('terminal')
    setTerminalInput('')
    setCommandHistory(prev => [...prev, trimmed])
    setTerminalHistoryIndex(-1)
    appendTerminalOutput(`$ ${trimmed}\n`, 'command')

    if (trimmed === 'clear') {
      setTerminalOutput([])
      return
    }

    const container = await ensureWebContainer()
    if (!container) return

    const { command, args } = parseTerminalCommand(trimmed)
    if (!command) return

    if (command === 'cd') {
      const target = args[0] || '/'
      const nextPath = resolveTerminalPath(target)
      try {
        await container.fs.readdir(nextPath)
        setTerminalCwd(nextPath)
      } catch {
        appendTerminalOutput(`cd: no such directory: ${target}\n`, 'error')
      }
      return
    }

    if (command === 'pwd') {
      appendTerminalOutput(`${terminalCwd}\n`, 'output')
      return
    }

    setTerminalStatus('running')
    try {
      const process = await container.spawn(command, args, { cwd: terminalCwd })
      const decoder = new TextDecoder()
      process.output.pipeTo(new WritableStream({
        write(data) {
          appendTerminalOutput(decoder.decode(data), 'output')
        }
      }))
      const exitCode = await process.exit
      appendTerminalOutput(`\n[exit code ${exitCode}]\n`, exitCode === 0 ? 'info' : 'error')
    } catch (err) {
      appendTerminalOutput(`${err.message || 'Command failed'}\n`, 'error')
    } finally {
      setTerminalStatus('idle')
    }
  }

  const handleTerminalKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleTerminalCommand(terminalInput)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (commandHistory.length === 0) return
      const nextIndex = terminalHistoryIndex < 0 ? commandHistory.length - 1 : Math.max(0, terminalHistoryIndex - 1)
      setTerminalHistoryIndex(nextIndex)
      setTerminalInput(commandHistory[nextIndex] || '')
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (commandHistory.length === 0) return
      const nextIndex = terminalHistoryIndex >= commandHistory.length - 1 ? -1 : terminalHistoryIndex + 1
      setTerminalHistoryIndex(nextIndex)
      setTerminalInput(nextIndex === -1 ? '' : (commandHistory[nextIndex] || ''))
    }
  }

  useEffect(() => {
    if (!terminalOutputRef.current) return
    terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight
  }, [terminalOutput, consoleTab, showConsole])

  useEffect(() => {
    webcontainerProjectIdRef.current = null
    setTerminalOutput([])
    setTerminalInput('')
    setTerminalError('')
    setTerminalStatus('idle')
    setTerminalCwd('/')
  }, [activeLocalProject?.id])

  // Export project as ZIP
  const exportProjectAsZip = async () => {
    if (!activeLocalProject) return

    const projectData = localProjectFiles[activeLocalProject.id]
    if (!projectData) return

    // Simple ZIP creation (without external library)
    // For now, just download files as a text bundle
    const files = Object.entries(projectData.fileContents)
    let content = `# ${activeLocalProject.name}\n# Exported from Code Editor\n\n`

    files.forEach(([path, fileContent]) => {
      content += `\n--- ${path} ---\n${fileContent}\n`
    })

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeLocalProject.name}-export.txt`
    a.click()
    URL.revokeObjectURL(url)

    showToast('Project exported')
    setShowDeployMenu(false)
  }

  // Keyboard shortcut handler for code editor
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showCodePage) return

      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveCurrentFile()
      }

      // Escape to close context menu
      if (e.key === 'Escape') {
        setContextMenuFile(null)
        setShowDeployMenu(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCodePage, activeTabId, editorContent])

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenuFile(null)
    if (contextMenuFile) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenuFile])

  // Close move-to-project dropdown on click outside
  useEffect(() => {
    const handleClick = () => setMoveToChatId(null)
    if (moveToChatId) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [moveToChatId])

  // Close coder agent selector on click outside
  useEffect(() => {
    const handleClick = () => setShowCoderAgentSelector(false)
    if (showCoderAgentSelector) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showCoderAgentSelector])

  // =============== END LOCAL CODE EDITOR FUNCTIONS ===============

  // ============ Vercel API Functions ============

  const vercelApi = async (endpoint, options = {}) => {
    const headers = {
      'Authorization': `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
    const resp = await fetch(`/api/vercel${endpoint}`, {
      ...options,
      headers
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Vercel API error: ${resp.status}`)
    }
    if (resp.status === 204) return null
    return resp.json()
  }

  const connectVercel = async () => {
    if (!vercelToken.trim()) {
      showToast('Please enter a Vercel token')
      return
    }
    setVercelLoading(true)
    try {
      const user = await vercelApi('/v2/user')
      setVercelUser(user.user)
      setVercelConnected(true)
      localStorage.setItem('vercelToken', vercelToken)
      showToast(`Connected as ${user.user.username || user.user.email}`)
      loadVercelProjects()
    } catch (err) {
      showToast(`Vercel connection failed: ${err.message}`)
      setVercelConnected(false)
    } finally {
      setVercelLoading(false)
    }
  }

  const disconnectVercel = () => {
    setVercelConnected(false)
    setVercelUser(null)
    setVercelProjects([])
    setVercelDeployments([])
    setVercelSelectedProject(null)
    localStorage.removeItem('vercelToken')
    showToast('Disconnected from Vercel')
  }

  const loadVercelProjects = async () => {
    setVercelLoading(true)
    try {
      const response = await vercelApi('/v9/projects')
      setVercelProjects(response.projects || [])
    } catch (err) {
      showToast(`Failed to load projects: ${err.message}`)
    } finally {
      setVercelLoading(false)
    }
  }

  const loadVercelDeployments = async (projectId = null) => {
    setVercelDeploymentsLoading(true)
    try {
      const endpoint = projectId
        ? `/v6/deployments?projectId=${projectId}&limit=20`
        : '/v6/deployments?limit=20'
      const response = await vercelApi(endpoint)
      setVercelDeployments(response.deployments || [])
    } catch (err) {
      showToast(`Failed to load deployments: ${err.message}`)
    } finally {
      setVercelDeploymentsLoading(false)
    }
  }

  const deployToVercel = async () => {
    if (!activeLocalProject) {
      showToast('No project selected')
      return
    }

    const projectData = localProjectFiles[activeLocalProject.id]
    if (!projectData || !projectData.fileContents) {
      showToast('No files to deploy')
      return
    }

    setVercelDeploying(true)
    try {
      // Prepare files for deployment
      const files = Object.entries(projectData.fileContents).map(([path, content]) => ({
        file: path.startsWith('/') ? path.slice(1) : path,
        data: content
      }))

      // Create deployment
      const deploymentName = vercelDeployName.trim() || activeLocalProject.name
      const deployment = await vercelApi('/v13/deployments', {
        method: 'POST',
        body: JSON.stringify({
          name: deploymentName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          files: files,
          projectSettings: {
            framework: null
          },
          target: 'production'
        })
      })

      showToast(`Deployed! URL: ${deployment.url}`)
      setShowVercelDeployModal(false)
      setVercelDeployName('')

      // Refresh deployments list
      if (showVercelDeployments) {
        loadVercelDeployments()
      }
    } catch (err) {
      showToast(`Deployment failed: ${err.message}`)
    } finally {
      setVercelDeploying(false)
    }
  }

  const deleteVercelDeployment = async (deploymentId) => {
    setDeletingDeployment(deploymentId)
    try {
      await vercelApi(`/v13/deployments/${deploymentId}`, {
        method: 'DELETE'
      })
      showToast('Deployment deleted')
      setVercelDeployments(prev => prev.filter(d => d.uid !== deploymentId))
    } catch (err) {
      showToast(`Failed to delete: ${err.message}`)
    } finally {
      setDeletingDeployment(null)
    }
  }

  const cancelVercelDeployment = async (deploymentId) => {
    try {
      await vercelApi(`/v12/deployments/${deploymentId}/cancel`, {
        method: 'PATCH'
      })
      showToast('Deployment cancelled')
      loadVercelDeployments()
    } catch (err) {
      showToast(`Failed to cancel: ${err.message}`)
    }
  }

  // Auto-connect Vercel on mount if token exists
  useEffect(() => {
    if (vercelToken && !vercelConnected) {
      vercelApi('/v2/user')
        .then(response => {
          setVercelUser(response.user)
          setVercelConnected(true)
          loadVercelProjects()
        })
        .catch(() => {
          localStorage.removeItem('vercelToken')
          setVercelToken('')
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // =============== END VERCEL FUNCTIONS ===============

  // ============ Supabase Functions ============

  const connectSupabase = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      showToast('Please enter Supabase URL and Anon Key')
      return
    }
    setSupabaseLoading(true)
    try {
      // Test connection by fetching tables
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      })
      if (!response.ok) throw new Error('Connection failed')

      localStorage.setItem('supabaseUrl', supabaseUrl)
      localStorage.setItem('supabaseAnonKey', supabaseAnonKey)
      if (supabaseServiceKey) {
        localStorage.setItem('supabaseServiceKey', supabaseServiceKey)
      }
      setSupabaseConnected(true)
      showToast('Connected to Supabase')
      loadSupabaseTables()
    } catch (err) {
      showToast(`Supabase connection failed: ${err.message}`)
    } finally {
      setSupabaseLoading(false)
    }
  }

  const disconnectSupabase = () => {
    setSupabaseConnected(false)
    setSupabaseTables([])
    setSupabaseSelectedTable(null)
    setSupabaseTableData([])
    localStorage.removeItem('supabaseUrl')
    localStorage.removeItem('supabaseAnonKey')
    localStorage.removeItem('supabaseServiceKey')
    showToast('Disconnected from Supabase')
  }

  const loadSupabaseTables = async () => {
    if (!supabaseUrl || !supabaseAnonKey) return
    setSupabaseLoading(true)
    try {
      // Use the OpenAPI endpoint to get table info
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        // Parse OpenAPI spec to get table names
        const paths = data.paths || {}
        const tables = Object.keys(paths)
          .filter(p => p.startsWith('/') && !p.includes('{'))
          .map(p => p.slice(1))
          .filter(t => t && !t.startsWith('rpc/'))
        setSupabaseTables(tables)
      }
    } catch (err) {
      console.error('Failed to load tables:', err)
    } finally {
      setSupabaseLoading(false)
    }
  }

  const loadSupabaseTableData = async (tableName) => {
    if (!supabaseUrl || !supabaseAnonKey) return
    setSupabaseLoading(true)
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?limit=100`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setSupabaseTableData(data)
        setSupabaseSelectedTable(tableName)
      }
    } catch (err) {
      showToast(`Failed to load table data: ${err.message}`)
    } finally {
      setSupabaseLoading(false)
    }
  }

  const generateSupabaseCode = (tableName, operation = 'select') => {
    const code = {
      select: `// Fetch data from ${tableName}
const { data, error } = await supabase
  .from('${tableName}')
  .select('*')

if (error) console.error('Error:', error)
else console.log('Data:', data)`,
      insert: `// Insert data into ${tableName}
const { data, error } = await supabase
  .from('${tableName}')
  .insert([
    { column1: 'value1', column2: 'value2' }
  ])
  .select()

if (error) console.error('Error:', error)
else console.log('Inserted:', data)`,
      update: `// Update data in ${tableName}
const { data, error } = await supabase
  .from('${tableName}')
  .update({ column1: 'new_value' })
  .eq('id', 1)
  .select()

if (error) console.error('Error:', error)
else console.log('Updated:', data)`,
      delete: `// Delete data from ${tableName}
const { error } = await supabase
  .from('${tableName}')
  .delete()
  .eq('id', 1)

if (error) console.error('Error:', error)
else console.log('Deleted successfully')`
    }
    return code[operation] || code.select
  }

  // Auto-connect Supabase on mount
  useEffect(() => {
    if (supabaseUrl && supabaseAnonKey && !supabaseConnected) {
      fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      })
        .then(response => {
          if (response.ok) {
            setSupabaseConnected(true)
            loadSupabaseTables()
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // =============== END SUPABASE FUNCTIONS ===============

  // ============ Local Git Functions ============

  const initGitRepo = () => {
    if (!activeLocalProject) {
      showToast('Select a project first')
      return
    }
    setGitInitialized(true)
    setGitRepoName(activeLocalProject.name)
    setGitCurrentBranch('main')
    setGitBranches(['main'])
    setGitCommits([{
      id: Date.now().toString(),
      message: 'Initial commit',
      date: new Date().toISOString(),
      files: Object.keys(localProjectFiles[activeLocalProject.id]?.fileContents || {})
    }])
    showToast('Git repository initialized')
  }

  const createGitBranch = (branchName) => {
    if (!branchName.trim()) return
    if (gitBranches.includes(branchName)) {
      showToast('Branch already exists')
      return
    }
    setGitBranches([...gitBranches, branchName])
    setGitCurrentBranch(branchName)
    showToast(`Created and switched to branch: ${branchName}`)
  }

  const switchGitBranch = (branchName) => {
    setGitCurrentBranch(branchName)
    showToast(`Switched to branch: ${branchName}`)
  }

  const stageFile = (filePath) => {
    if (gitStagedFiles.includes(filePath)) {
      setGitStagedFiles(gitStagedFiles.filter(f => f !== filePath))
    } else {
      setGitStagedFiles([...gitStagedFiles, filePath])
    }
  }

  const stageAllFiles = () => {
    if (!activeLocalProject) return
    const files = Object.keys(localProjectFiles[activeLocalProject.id]?.fileContents || {})
    setGitStagedFiles(files)
  }

  const commitChanges = () => {
    if (!gitCommitMessage.trim()) {
      showToast('Please enter a commit message')
      return
    }
    if (gitStagedFiles.length === 0) {
      showToast('No files staged for commit')
      return
    }
    const newCommit = {
      id: Date.now().toString(),
      message: gitCommitMessage,
      date: new Date().toISOString(),
      branch: gitCurrentBranch,
      files: [...gitStagedFiles]
    }
    setGitCommits([newCommit, ...gitCommits])
    setGitStagedFiles([])
    setGitCommitMessage('')
    showToast('Changes committed')
  }

  const deleteGitBranch = (branchName) => {
    if (branchName === 'main') {
      showToast('Cannot delete main branch')
      return
    }
    if (branchName === gitCurrentBranch) {
      showToast('Cannot delete current branch')
      return
    }
    setGitBranches(gitBranches.filter(b => b !== branchName))
    showToast(`Deleted branch: ${branchName}`)
  }

  const pushToGitHub = async () => {
    if (!githubConnected) {
      showToast('Connect GitHub first')
      setSidebarTab('code')
      setCodeEditorMode('github')
      return
    }
    showToast('Push to GitHub - Coming soon')
  }

  // =============== END GIT FUNCTIONS ===============

  // Auto-connect GitHub on mount if token exists
  useEffect(() => {
    if (githubToken && !githubConnected) {
      githubApi('/user')
        .then(user => {
          setGithubUser(user)
          setGithubConnected(true)
          loadGitHubRepos()
        })
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem('githubToken')
          setGithubToken('')
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Parse MCP JSON config and extract server info
  const parseMcpJsonConfig = (jsonStr) => {
    const config = JSON.parse(jsonStr)
    const servers = []
    
    const mcpServersObj = config?.mcpServers || config
    if (typeof mcpServersObj !== 'object') {
      throw new Error('Invalid MCP config format')
    }
    
    for (const [name, serverConfig] of Object.entries(mcpServersObj)) {
      if (!serverConfig || typeof serverConfig !== 'object') continue
      
      // Extract URL and auth from args array
      const args = serverConfig.args || []
      let url = ''
      let authHeader = ''
      
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--streamableHttp' && args[i + 1]) {
          url = args[i + 1]
        } else if (arg === '--header' && args[i + 1]) {
          authHeader = args[i + 1]
        } else if (typeof arg === 'string' && arg.startsWith('http')) {
          // Fallback: bare URL in args
          if (!url) url = arg
        }
      }
      
      // Also check for direct url property
      if (!url && serverConfig.url) {
        url = serverConfig.url
      }
      
      if (!url) continue
      
      // Parse auth header (format: "authorization:Bearer TOKEN" or "Authorization: Bearer TOKEN")
      let token = ''
      if (authHeader) {
        const match = authHeader.match(/^[Aa]uthorization:\s*Bearer\s+(.+)$/i)
        if (match) {
          token = match[1]
        } else if (authHeader.includes(':')) {
          token = authHeader.split(':').slice(1).join(':').trim()
        }
      }
      
      servers.push({
        id: `mcp-${crypto.randomUUID()}`,
        name,
        url,
        token,
        connectState: 'disconnected', // disconnected | connecting | connected | error
        connectError: '',
        flows: [],
      })
    }
    
    return servers
  }
  
  const importMcpServers = () => {
    if (!mcpImportJson.trim()) {
      setMcpImportError('Paste your MCP JSON config')
      return
    }
    
    try {
      const newServers = parseMcpJsonConfig(mcpImportJson)
      if (newServers.length === 0) {
        setMcpImportError('No valid MCP servers found in config')
        return
      }
      
      setMcpServers(prev => {
        // Merge: don't duplicate by URL
        const existingUrls = new Set(prev.map(s => s.url))
        const toAdd = newServers.filter(s => !existingUrls.has(s.url))
        return [...prev, ...toAdd]
      })
      
      setMcpImportJson('')
      setMcpImportError('')
      showToast(`Imported ${newServers.length} MCP server(s)`)
    } catch (e) {
      console.error(e)
      setMcpImportError(e.message || 'Invalid JSON')
    }
  }
  
  const connectMcpServer = async (serverId) => {
    const server = mcpServers.find(s => s.id === serverId)
    if (!server) return
    
    setMcpServers(prev => prev.map(s => 
      s.id === serverId ? { ...s, connectState: 'connecting', connectError: '' } : s
    ))

    try {
      // Some MCP servers expect initialize first. We'll try it but tolerate failure.
      try {
        await mcpRequest({
          url: server.url,
          token: server.token,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'brain-mate-ai', version: '1.0.0' },
          },
        })
      } catch {
        // ignore, continue to tools/list
      }

      const toolsResult = await mcpRequest({
        url: server.url,
        token: server.token,
        method: 'tools/list',
        params: {},
      })

      const tools = Array.isArray(toolsResult?.tools)
        ? toolsResult.tools
        : Array.isArray(toolsResult?.data)
          ? toolsResult.data
          : Array.isArray(toolsResult)
            ? toolsResult
            : []

      const flows = tools
        .map((t) => ({
          name: t?.name || t?.id || '',
          description: t?.description || '',
          inputSchema: t?.inputSchema || t?.input_schema || null,
        }))
        .filter((t) => t.name)

      setMcpServers(prev => prev.map(s => 
        s.id === serverId ? { ...s, connectState: 'connected', flows } : s
      ))
      showToast(`${server.name}: Loaded ${flows.length} flows`)
    } catch (e) {
      console.error(e)
      setMcpServers(prev => prev.map(s => 
        s.id === serverId ? { ...s, connectState: 'error', connectError: e.message || 'Failed to connect' } : s
      ))
      showToast(`${server.name}: Connection failed`)
    }
  }

  const disconnectMcpServer = (serverId) => {
    setMcpServers(prev => prev.map(s => 
      s.id === serverId ? { ...s, connectState: 'disconnected', connectError: '' } : s
    ))
  }
  
  const removeMcpServer = (serverId) => {
    setMcpServers(prev => prev.filter(s => s.id !== serverId))
    showToast('Server removed')
  }
  
  // Create an MCP Agent from a workflow
  const createMcpAgentFromWorkflow = (serverId, workflow) => {
    const server = mcpServers.find(s => s.id === serverId)
    if (!server) return
    
    const workflowId = workflow.id || workflow.workflow_id
    const workflowName = workflow.name || workflow.workflow_name || 'MCP Workflow'
    
    const agent = {
      id: `mcp-agent-${crypto.randomUUID()}`,
      provider: 'mcp',
      name: workflowName,
      description: workflow.description || `Execute ${workflowName} workflow`,
      mcpServerId: serverId,
      mcpServerUrl: server.url,
      mcpServerToken: server.token,
      workflowId: workflowId,
      workflowName: workflowName,
    }
    
    // Add to agents list (stored in localStorage via existing effect)
    setAgents(prev => {
      // Don't duplicate
      if (prev.some(a => a.workflowId === workflowId && a.mcpServerId === serverId)) {
        showToast('Agent already exists for this workflow')
        return prev
      }
      return [agent, ...prev]
    })
    
    showToast(`Created agent: ${workflowName}`)
  }
  
  // Send message to MCP workflow agent
  const sendMessageToMcpWorkflow = async (message, extraContext = '', signal) => {
    if (!selectedAgent?.mcpServerUrl || !selectedAgent?.workflowId) {
      throw new Error('MCP agent not properly configured (missing server URL or workflow ID)')
    }
    
    setTypingStatus('generating')
    
    try {
      // First, get workflow details to understand inputs (optional, for smarter execution)
      let workflowInputs = {}
      
      // Try to get workflow details first
      try {
        const detailsResult = await mcpRequest({
          url: selectedAgent.mcpServerUrl,
          token: selectedAgent.mcpServerToken,
          method: 'tools/call',
          params: {
            name: 'get_workflow_details',
            arguments: { workflowId: selectedAgent.workflowId }
          }
        })
        console.log('Workflow details:', detailsResult)
      } catch (e) {
        console.log('Could not get workflow details (non-fatal):', e.message)
      }
      
      // Execute the workflow with the user's message as input
      // n8n MCP execute_workflow expects: workflowId + input fields directly or as inputData
      const inputPayload = {
        message,
        query: message,
        input: message,
        text: message,
        extraContext: extraContext || '',
        userProfile: buildUserProfileBlock() || '',
        conversationId: activeConversation,
        timestamp: new Date().toISOString(),
      }

      // n8n-style items: many n8n executions expect `data: [{ json: ... }]`.
      // We'll provide multiple shapes to maximize compatibility.
      const webhookJson = {
        headers: {},
        query: {},
        body: inputPayload,
        // Common fallbacks some n8n AI templates use:
        prompt: message,
        guardrailsInput: message,
      }
      const httpItemLegacy = { headers: {}, query: {}, body: inputPayload }
      const httpItemJson = { json: webhookJson }

      const result = await mcpRequest({
        url: selectedAgent.mcpServerUrl,
        token: selectedAgent.mcpServerToken,
        method: 'tools/call',
        params: {
          name: 'execute_workflow',
          arguments: {
            workflowId: selectedAgent.workflowId,
            workflow_id: selectedAgent.workflowId, // some servers still use snake_case
            // Pass input both ways for compatibility
            message,
            query: message,
            input: message,
            text: message,
            context: extraContext || '',
            data: inputPayload,
            inputData: inputPayload,
            input_data: inputPayload,
            payload: inputPayload,
            body: inputPayload,
            // n8n workflows frequently consume the first item in an items/data array
            item: httpItemLegacy,
            items: [httpItemLegacy, httpItemJson],
            // The most common n8n execution input shape:
            data: [httpItemJson],
            // Extra fallbacks
            json: webhookJson,
            request: httpItemLegacy,
          }
        }
      })
      
      console.log('MCP workflow execution result:', result)
      
      // Parse the result
      let responseText = ''
      
      if (typeof result === 'string') {
        responseText = result
      } else if (result?.content) {
        // MCP format: { content: [{ type: 'text', text: '...' }] }
        for (const item of result.content) {
          if (item.type === 'text' && item.text) {
            responseText += item.text + '\n'
          }
        }
      } else if (result?.output || result?.result || result?.response || result?.data) {
        const data = result.output || result.result || result.response || result.data
        responseText = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      } else if (result) {
        responseText = JSON.stringify(result, null, 2)
      }
      
      if (!responseText.trim()) {
        responseText = 'Workflow executed successfully (no output returned)'
      }
      
      return responseText.trim()
    } catch (e) {
      console.error('MCP workflow error:', e)
      throw new Error(`Workflow execution failed: ${e.message}`)
    }
  }
  
  // Discover workflows from an MCP server (calls search_workflows tool)
  const discoverMcpWorkflows = async (serverId) => {
    const server = mcpServers.find(s => s.id === serverId)
    if (!server || server.connectState !== 'connected') {
      showToast('Server must be connected first')
      return
    }
    
    // Check if server has search_workflows tool
    const hasSearchTool = server.flows?.some(f => f.name === 'search_workflows')
    if (!hasSearchTool) {
      showToast('Server does not have search_workflows tool')
      return
    }
    
    setMcpServers(prev => prev.map(s => 
      s.id === serverId ? { ...s, discoveringWorkflows: true } : s
    ))
    
    try {
      const result = await mcpRequest({
        url: server.url,
        token: server.token,
        method: 'tools/call',
        params: {
          name: 'search_workflows',
          arguments: {}
        }
      })
      
      console.log('MCP search_workflows raw result:', result)
      
      // Parse workflows from result - try multiple formats
      let workflows = []
      
      // Helper to extract workflows from various structures
      const extractWorkflows = (data) => {
        if (!data) return []
        if (Array.isArray(data)) return data
        if (data.workflows) return data.workflows
        if (data.data) return extractWorkflows(data.data)
        if (data.result) return extractWorkflows(data.result)
        return []
      }
      
      // Result might be in different formats
      if (Array.isArray(result)) {
        workflows = result
      } else if (result?.content) {
        // MCP tool result format: { content: [{ type: 'text', text: '...' }] }
        for (const item of result.content) {
          if (item.type === 'text' && item.text) {
            try {
              const parsed = JSON.parse(item.text)
              console.log('Parsed content text:', parsed)
              workflows = extractWorkflows(parsed)
              if (workflows.length > 0) break
            } catch {
              // Not JSON, might be formatted text - show it as a single item
              console.log('Content is not JSON:', item.text)
            }
          }
        }
        // If still no workflows, show raw content
        if (workflows.length === 0 && result.content.length > 0) {
          const textContent = result.content.find(c => c.type === 'text')
          if (textContent?.text) {
            workflows = [{ name: 'Raw Response', description: textContent.text.slice(0, 500) }]
          }
        }
      } else if (result?.workflows) {
        workflows = result.workflows
      } else if (typeof result === 'object') {
        workflows = extractWorkflows(result)
      }
      
      console.log('Extracted workflows:', workflows)
      
      setMcpServers(prev => prev.map(s => 
        s.id === serverId ? { ...s, discoveringWorkflows: false, workflows } : s
      ))
      showToast(`Found ${workflows.length} workflow(s)`)
    } catch (e) {
      console.error('discoverMcpWorkflows error:', e)
      setMcpServers(prev => prev.map(s => 
        s.id === serverId ? { ...s, discoveringWorkflows: false } : s
      ))
      showToast(`Failed to discover workflows: ${e.message}`)
    }
  }
  
  // All flows from all connected servers
  const allMcpFlows = useMemo(() => {
    return mcpServers
      .filter(s => s.connectState === 'connected')
      .flatMap(s => s.flows.map(f => ({ ...f, serverName: s.name })))
  }, [mcpServers])

  const filteredMcpFlows = useMemo(() => {
    const q = (mcpFlowFilter || '').trim().toLowerCase()
    if (!q) return allMcpFlows
    return allMcpFlows.filter((f) => {
      const name = (f?.name || '').toLowerCase()
      const desc = (f?.description || '').toLowerCase()
      const server = (f?.serverName || '').toLowerCase()
      return name.includes(q) || desc.includes(q) || server.includes(q)
    })
  }, [allMcpFlows, mcpFlowFilter])

  const handleTestAgent = async (agentId) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    try {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'test_agent',
          agent_id: agentId,
          timestamp: new Date().toISOString()
        })
      })

      if (response.ok) {
        showToast(`${agent.name} is responding`)
      } else {
        throw new Error('Agent test failed')
      }
    } catch (err) {
      showToast(err.message || 'Failed to test agent')
    }
  }

  const sendMessageToAgent = async (message, files = [], extraContext = '', signal) => {
    if (selectedAgent?.provider === 'openrouter') {
      return await sendMessageToOpenRouter(message, extraContext, signal)
    }

    if (selectedAgent?.provider === 'lmstudio') {
      return await sendMessageToLmStudio(message, extraContext, signal)
    }
    
    // MCP Agent - execute workflow via MCP
    if (selectedAgent?.provider === 'mcp') {
      const text = await sendMessageToMcpWorkflow(message, extraContext, signal)
      return { text, usage: null }
    }

    // Use agent's own webhook URL if available, otherwise fall back to global webhook
    const webhookUrl = selectedAgent?.webhookUrl || n8nWebhookUrl
    
    if (!selectedAgent || !webhookUrl) {
      throw new Error('No agent selected or webhook URL not configured')
    }

    try {
      console.log('Sending message to agent:', selectedAgent.name)
      console.log('Using webhook URL:', webhookUrl)
      console.log('Files attached:', files.length)
      
      const payload = {
        action: 'chat',
        agent_id: selectedAgent.id,
        message: message,
        extra_context: extraContext || null,
        user_profile: buildUserProfileBlock() || null,
        files: files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
          url: f.url
        })),
        conversation_id: activeConversation,
        timestamp: new Date().toISOString(),
        // Search tool configuration
        search_enabled: !!searchUrl,
        search_url: searchUrl || null,
        search_api: searchUrl ? `${normalizeSearchBaseUrl(searchUrl)}/search?q=` : null
      }
      
      console.log('Request payload:', payload)
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Agent response error:', errorText)
        throw new Error(`Agent error: ${response.status} - ${errorText || 'Unknown error'}`)
      }

      const text = await response.text()
      console.log('Agent raw response:', text)
      
      let responseText = 'No response from agent'
      
      // Try to parse as JSON first
      try {
        const data = JSON.parse(text)
        console.log('Agent parsed JSON data:', data)
        
        if (Array.isArray(data)) {
          if (data.length > 0) {
            const firstItem = data[0]
            responseText = firstItem.output || firstItem.response || firstItem.message || firstItem.text || JSON.stringify(firstItem)
          }
        } else if (typeof data === 'object' && data !== null) {
          responseText = data.output || data.response || data.message || data.text || JSON.stringify(data)
        } else if (typeof data === 'string') {
          responseText = data
        }
      } catch (parseErr) {
        // Not valid JSON - treat as plain text response
        console.log('Response is plain text (not JSON)')
        if (text && text.trim()) {
          responseText = text.trim()
        }
      }
      
      console.log('Agent final response:', responseText)
      
      return { text: responseText, usage: null }
    } catch (err) {
      console.error('Send message error:', err)
      throw err
    }
  }

  const fetchRelevantMemories = async (query) => {
    if (!dbEnabled) return []
    
    // Fetch ALL active memories to ensure nothing important is missed
    // Priority types like personal_detail and preference should always be included
    const { data: allMemories, error } = await supabase
      .from('user_memories')
      .select('content,memory_type,confidence')
      .eq('owner_user_id', authUser.id)
      .eq('is_active', true)
      .order('confidence', { ascending: false })
    
    if (error) throw error
    if (!allMemories || !allMemories.length) return []
    
    // Priority memory types - always include these
    const priorityTypes = ['personal_detail', 'preference', 'fact']
    const priorityMemories = allMemories.filter(m => priorityTypes.includes(m.memory_type))
    const otherMemories = allMemories.filter(m => !priorityTypes.includes(m.memory_type))
    
    // Simple keyword relevance scoring for non-priority memories
    const queryLower = (query || '').toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
    
    const scoredOthers = otherMemories.map(m => {
      const contentLower = (m.content || '').toLowerCase()
      let score = 0
      queryWords.forEach(word => {
        if (contentLower.includes(word)) score += 1
      })
      return { ...m, relevanceScore: score }
    })
    
    // Sort by relevance, then take top ones
    scoredOthers.sort((a, b) => b.relevanceScore - a.relevanceScore)
    const relevantOthers = scoredOthers.slice(0, 20)
    
    // Combine: all priority memories + top relevant others
    // Limit total to 40 to avoid too much context
    const combined = [...priorityMemories, ...relevantOthers].slice(0, 40)
    
    return combined
  }

  const isTextLikeFile = (file) => {
    const name = (file?.name || '').toLowerCase()
    const type = (file?.type || '').toLowerCase()
    if (type.startsWith('text/')) return true
    return [
      '.md', '.txt', '.json', '.csv',
      '.js', '.jsx', '.ts', '.tsx',
      '.py', '.sql', '.html', '.css',
      '.yml', '.yaml',
    ].some((ext) => name.endsWith(ext))
  }

  const chunkText = (text, { chunkSize = 1400, overlap = 200 } = {}) => {
    const t = (text || '').replace(/\r\n/g, '\n')
    if (!t.trim()) return []
    const chunks = []
    let i = 0
    while (i < t.length) {
      const end = Math.min(i + chunkSize, t.length)
      const slice = t.slice(i, end).trim()
      if (slice) chunks.push(slice)
      if (end >= t.length) break
      i = Math.max(0, end - overlap)
    }
    return chunks
  }

  const extractPdfText = async (file, onProgress) => {
    try {
      const buf = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) })
      
      // Add timeout to PDF loading (30 seconds)
      const pdf = await withTimeout(
        loadingTask.promise,
        30000,
        'PDF loading timed out - file may be too large or corrupted'
      )
      
      const out = []
      const totalPages = pdf.numPages
      
      // Limit to 100 pages to prevent hanging on huge documents
      const maxPages = Math.min(totalPages, 100)
      
      for (let i = 1; i <= maxPages; i++) {
        try {
          const page = await pdf.getPage(i)
          const tc = await page.getTextContent()
          const text = (tc?.items || []).map((it) => it?.str || '').join(' ').trim()
          if (text) out.push(text)
          
          // Report progress if callback provided
          if (onProgress) {
            const progress = Math.round((i / maxPages) * 100)
            onProgress(progress)
          }
        } catch (pageErr) {
          console.warn(`Failed to extract page ${i}:`, pageErr)
          // Continue with other pages
        }
      }
      
      if (totalPages > maxPages) {
        out.push(`\n[Note: Document truncated - showing first ${maxPages} of ${totalPages} pages]`)
      }
      
      return out.join('\n\n').trim()
    } catch (e) {
      console.error('PDF extraction failed:', e)
      throw new Error(`PDF extraction failed: ${e.message}`)
    }
  }

  const extractDocxText = async (file) => {
    const buf = await file.arrayBuffer()
    const res = await mammoth.extractRawText({ arrayBuffer: buf })
    return (res?.value || '').trim()
  }

  // Helper to add timeout to any promise
  const withTimeout = (promise, ms, errorMessage = 'Operation timed out') => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(errorMessage)), ms)
      )
    ])
  }

  const openAiAnalyzeText = async ({ text, filename }) => {
    const key = openAiApiKey.trim()
    if (!key) {
      // Don't throw - just return empty if no key
      console.log('Skipping analysis: No OpenAI API key')
      return ''
    }
    const t = String(text || '').trim()
    if (!t) return ''
    const snippet = t.slice(0, 12000)
    
    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
    
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: ocrModel || 'gpt-4o',
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'You analyze documents. Respond with clean bullet points (•) only. Be concise.' },
            {
              role: 'user',
              content:
                `Analyze this ${filename || 'document'}:\n\n` +
                `${snippet}\n\n` +
                `Format your response as:\n` +
                `• Type: [document type]\n` +
                `• Summary: [one sentence]\n` +
                `• Key points: [2-3 important details]`,
            },
          ],
        }),
      })
      clearTimeout(timeoutId)
      
      if (!resp.ok) {
        const body = await resp.text()
        console.error(`OpenAI analysis error: ${resp.status}`, body)
        return `Analysis unavailable (API error: ${resp.status})`
      }
      const data = await resp.json()
      return String(data?.choices?.[0]?.message?.content || '').trim()
    } catch (e) {
      clearTimeout(timeoutId)
      if (e.name === 'AbortError') {
        console.error('OpenAI analysis timed out')
        return 'Analysis unavailable (timed out)'
      }
      console.error('OpenAI analysis failed:', e)
      return 'Analysis unavailable'
    }
  }

  const extractTextForRag = async ({ file, filename, mime }) => {
    const name = (filename || file?.name || '').toLowerCase()
    const type = (mime || file?.type || '').toLowerCase()

    if (type.startsWith('image/')) {
      const raw = await openAiOcrImage(file)
      const parsed = parseOcrResponse(raw)
      const extractedText = (parsed.extractedText || '').trim()
      const imageDescription = (parsed.imageDescription || '').trim()
      
      // Combine description and text for embedding
      if (imageDescription && extractedText) {
        return `[Image Description]\n${imageDescription}\n\n[Extracted Text]\n${extractedText}`
      } else if (imageDescription) {
        return `[Image Description]\n${imageDescription}`
      }
      return extractedText
    }

    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return await extractPdfText(file)
    }

    if (
      name.endsWith('.docx') ||
      type.includes('officedocument.wordprocessingml.document')
    ) {
      return await extractDocxText(file)
    }

    if (isTextLikeFile(file)) {
      return String(await file.text()).trim()
    }

    return ''
  }

  const openAiEmbed = async (inputs) => {
    const key = openAiEmbeddingsApiKey
    if (!key) throw new Error('OpenAI API key not set (set VITE_OPENAI_API_KEY in .env or Settings → Embeddings)')
    const arr = Array.isArray(inputs) ? inputs : [String(inputs || '')]
    // Use direct OpenAI API URL (works in both dev and production)
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDINGS_MODEL,
        input: arr,
      }),
    })
    if (!resp.ok) {
      const t = await resp.text()
      throw new Error(`OpenAI embeddings error: ${resp.status} ${t}`)
    }
    const data = await resp.json()
    const rows = Array.isArray(data?.data) ? data.data : []
    const embeddings = rows.map((r) => r?.embedding).filter(Boolean)
    if (embeddings.length !== arr.length) {
      throw new Error('OpenAI embeddings returned unexpected shape')
    }
    return embeddings
  }

  const fileToDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(file)
    })
  }

  const openAiOcrImage = async (file) => {
    const key = openAiApiKey.trim()
    if (!key) throw new Error('OpenAI API key not set (Settings → OCR)')
    if (!file?.type?.startsWith('image/')) throw new Error('OCR only supports image files right now')

    const dataUrl = await fileToDataUrl(file)
    const prompt =
      'You are an OCR + image analysis system. Return EXACTLY this format:\n\n' +
      'EXTRACTED_TEXT:\n' +
      '[All readable text from the image, preserve formatting. If no text is visible, write "No text detected"]\n\n' +
      'IMAGE_DESCRIPTION:\n' +
      '[Detailed description of what the image shows - describe the scene, objects, people, colors, composition, and any notable visual elements. This should be comprehensive enough to understand the image without seeing it. 2-4 sentences.]\n\n' +
      'ANALYSIS:\n' +
      '• Type: [One word - Screenshot/Photo/Document/Diagram/Chart/Artwork/Logo/etc]\n' +
      '• Content: [One sentence summary]\n' +
      '• Key details: [2-3 important specifics if any]\n\n' +
      'Always provide a detailed IMAGE_DESCRIPTION even if there is no text. Keep analysis brief and factual.'

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ocrModel || 'gpt-4o',
        temperature: 0,
        messages: [
          { role: 'system', content: 'You extract text faithfully, describe images in detail, and summarize documents.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
    if (!resp.ok) {
      const t = await resp.text()
      throw new Error(`OpenAI OCR error: ${resp.status} ${t}`)
    }
    const data = await resp.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI OCR returned no content')
    return text
  }

  const openAiGenerateImage = async (prompt, signal) => {
    const key = openAiApiKey.trim()
    if (!key) throw new Error('OpenAI API key not set (Settings → Image Generation)')
    const p = String(prompt || '').trim()
    if (!p) throw new Error('Missing image prompt')

    const model = imageGenModel || 'dall-e-3'
    // DALL-E models support response_format, GPT Image models don't
    const isDallE = model.toLowerCase().startsWith('dall-e')
    
    const requestBody = {
      model,
      prompt: p,
      size: '1024x1024',
      n: 1,
    }
    
    // Only add response_format for DALL-E models
    if (isDallE) {
      requestBody.response_format = 'b64_json'
    }

    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify(requestBody),
    })
    if (!resp.ok) {
      const t = await resp.text()
      throw new Error(`OpenAI image generation error: ${resp.status} ${t}`)
    }
    const data = await resp.json()
    
    // Handle response based on model type
    if (isDallE) {
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) throw new Error('OpenAI returned no image data')
      return `data:image/png;base64,${b64}`
    } else {
      // GPT Image models return base64 in b64_json field directly (no response_format needed)
      const b64 = data?.data?.[0]?.b64_json
      if (b64) {
    return `data:image/png;base64,${b64}`
      }
      // Fallback to URL if provided
      const url = data?.data?.[0]?.url
      if (!url) throw new Error('OpenAI returned no image data')
      return url
    }
  }

  const isImageGenRequest = (text) => {
    const t = String(text || '').trim()
    if (!t) return { isRequest: false, prompt: '' }
    if (t.toLowerCase().startsWith('/image ')) {
      return { isRequest: true, prompt: t.slice('/image '.length).trim(), explicit: true }
    }
    if (t.toLowerCase() === '/image') return { isRequest: true, prompt: '', explicit: true }

    // Lightweight heuristic for natural language
    const lc = t.toLowerCase()
    const wants =
      /\b(generate|create|make|render|draw)\b/.test(lc) &&
      /\b(image|iomage|imgae|imgage|imege|picture|photo|logo|illustration|art)\b/.test(lc)
    return { isRequest: !!wants, prompt: t, explicit: false }
  }

  const parseOcrResponse = (text) => {
    const t = String(text || '')
    const extractedMarker = 'EXTRACTED_TEXT:'
    const descriptionMarker = 'IMAGE_DESCRIPTION:'
    const analysisMarker = 'ANALYSIS:'
    
    const ei = t.indexOf(extractedMarker)
    const di = t.indexOf(descriptionMarker)
    const ai = t.indexOf(analysisMarker)
    
    if (ei === -1 && di === -1 && ai === -1) {
      return { extractedText: t.trim(), imageDescription: '', analysis: '' }
    }
    
    // Find the end position for each section
    const getEndPos = (startIdx, ...otherIndices) => {
      const nextPositions = otherIndices.filter(i => i > startIdx)
      return nextPositions.length > 0 ? Math.min(...nextPositions) : t.length
    }
    
    const extractedText = ei !== -1
      ? t.slice(ei + extractedMarker.length, getEndPos(ei, di, ai)).trim()
      : ''
    
    const imageDescription = di !== -1
      ? t.slice(di + descriptionMarker.length, getEndPos(di, ai)).trim()
      : ''
    
    const analysis = ai !== -1
      ? t.slice(ai + analysisMarker.length).trim()
      : ''
    
    // Clean up "No text detected" from extracted text
    const cleanExtractedText = extractedText.toLowerCase().includes('no text detected') 
      ? '' 
      : extractedText
    
    return { extractedText: cleanExtractedText, imageDescription, analysis }
  }

  const testOpenAiKey = async () => {
    if (!openAiEmbeddingsApiKey) {
      showToast('Set VITE_OPENAI_API_KEY in .env (or add your key in Settings → Embeddings)')
      return
    }
    setOpenAiConnectError('')
    setOpenAiConnectState('connecting')
    try {
      await openAiEmbed(['ping'])
      setOpenAiConnectState('connected')
      showToast('OpenAI key works (embeddings OK)')
    } catch (e) {
      console.error(e)
      setOpenAiConnectState('error')
      setOpenAiConnectError(e.message || 'Failed to connect')
      showToast('OpenAI key test failed')
    }
  }

  // Auto-test OpenAI key on mount / when key changes (silently set state to connected if working)
  useEffect(() => {
    if (!openAiEmbeddingsApiKey) {
      setOpenAiConnectState('disconnected')
      openAiKeyTestedRef.current = ''
      return
    }
    // Avoid duplicate tests for same key (e.g. strict-mode double-mount)
    if (openAiKeyTestedRef.current === openAiEmbeddingsApiKey) return
    openAiKeyTestedRef.current = openAiEmbeddingsApiKey

    const silentTest = async () => {
      setOpenAiConnectState('connecting')
      try {
        await openAiEmbed(['ping'])
        setOpenAiConnectState('connected')
      } catch {
        setOpenAiConnectState('error')
      }
    }
    silentTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAiEmbeddingsApiKey])

  const processChatUploadsForOcrAndRag = async (files) => {
    const items = Array.isArray(files) ? files : []
    if (!ocrAutoProcessChatUploads || items.length === 0) {
      return { ocrContext: '', postedMessage: '' }
    }
    if (!openAiApiKey.trim()) {
      return { ocrContext: '', postedMessage: '' }
    }

    const results = []
    setAttachmentsUploading(true)
    try {
      for (let idx = 0; idx < items.length; idx++) {
        const f = items[idx]
        setAttachmentProgress((prev) => ({ ...prev, [f.id]: 5 }))

        let extractedText = ''
        let imageDescription = ''
        let analysis = ''

        if (f?.file?.type?.startsWith('image/')) {
          setAttachmentProgress((prev) => ({ ...prev, [f.id]: 25 }))
          const ocrRaw = await openAiOcrImage(f.file)
          const parsed = parseOcrResponse(ocrRaw)
          extractedText = parsed.extractedText || ''
          imageDescription = parsed.imageDescription || ''
          analysis = parsed.analysis || ''
          // Include image description in analysis for context display
          if (imageDescription) {
            analysis = `Image Description: ${imageDescription}\n\n${analysis}`
          }
          setAttachmentProgress((prev) => ({ ...prev, [f.id]: 60 }))
        } else if (String(f?.name || '').toLowerCase().endsWith('.pdf') || String(f?.type || '').toLowerCase().includes('pdf')) {
          try {
            // Extract PDF with progress reporting
            const pdfText = await extractPdfText(f.file, (pdfProgress) => {
              // Map PDF extraction progress (0-100) to overall progress (10-55)
              const mappedProgress = 10 + Math.round(pdfProgress * 0.45)
              setAttachmentProgress((prev) => ({ ...prev, [f.id]: mappedProgress }))
            })
            extractedText = pdfText || ''
            setAttachmentProgress((prev) => ({ ...prev, [f.id]: 60 }))
            
            if (ocrAutoPostSummaryToChat && extractedText.trim()) {
              setAttachmentProgress((prev) => ({ ...prev, [f.id]: 65 })) // Show analysis starting
              analysis = await openAiAnalyzeText({ text: extractedText, filename: f.name })
            } else {
              analysis = extractedText.trim()
                ? 'PDF text extracted.'
                : 'PDF has no extractable text layer (likely scanned).'
            }
          } catch (pdfErr) {
            console.error('PDF processing failed:', pdfErr)
            analysis = `PDF processing failed: ${pdfErr.message}`
            setAttachmentProgress((prev) => ({ ...prev, [f.id]: 60 }))
          }
        } else if (String(f?.name || '').toLowerCase().endsWith('.docx') || String(f?.type || '').toLowerCase().includes('officedocument.wordprocessingml.document')) {
          try {
            const docxText = await withTimeout(
              extractDocxText(f.file),
              30000,
              'DOCX extraction timed out'
            )
            extractedText = docxText || ''
            setAttachmentProgress((prev) => ({ ...prev, [f.id]: 60 }))
            
            if (ocrAutoPostSummaryToChat && extractedText.trim()) {
              setAttachmentProgress((prev) => ({ ...prev, [f.id]: 65 }))
              analysis = await openAiAnalyzeText({ text: extractedText, filename: f.name })
            } else {
              analysis = extractedText.trim()
                ? 'DOCX text extracted.'
                : 'DOCX contained no extractable text.'
            }
          } catch (docxErr) {
            console.error('DOCX processing failed:', docxErr)
            analysis = `DOCX processing failed: ${docxErr.message}`
            setAttachmentProgress((prev) => ({ ...prev, [f.id]: 60 }))
          }
        } else if (isTextLikeFile(f?.file)) {
          const text = await f.file.text()
          extractedText = text || ''
          if (ocrAutoPostSummaryToChat && extractedText.trim()) {
            analysis = await openAiAnalyzeText({ text: extractedText, filename: f.name })
          } else {
            analysis = 'Text file ingested (no OCR needed).'
          }
          setAttachmentProgress((prev) => ({ ...prev, [f.id]: 60 }))
        } else {
          analysis = `Skipped (unsupported type: ${f?.type || 'unknown'})`
        }

        const cleanText = String(extractedText || '').trim()
        const cleanDescription = String(imageDescription || '').trim()
        
        // Combine text and description for embedding (images get both text + description)
        // For images without text, the description alone will be embedded
        let contentToEmbed = cleanText
        if (cleanDescription) {
          contentToEmbed = cleanText 
            ? `[Image Description]\n${cleanDescription}\n\n[Extracted Text]\n${cleanText}`
            : `[Image Description]\n${cleanDescription}`
        }

        // Insert into RAG (Supabase) if enabled - now also works for images without text
        if (dbEnabled && ocrAutoIngestToRag && contentToEmbed) {
          setAttachmentProgress((prev) => ({ ...prev, [f.id]: 70 }))
          const { data: docRow, error: docErr } = await supabase
            .from('documents')
            .insert({
              owner_user_id: authUser.id,
              title: f.name,
              source_type: 'upload',
              metadata: {
                filename: f.name,
                mime: f.type,
                size: f.size,
                source: 'chat_upload',
                ocr_model: ocrModel || 'gpt-4o',
                has_image_description: !!cleanDescription,
                has_extracted_text: !!cleanText,
              },
            })
            .select('document_id')
            .single()
          if (docErr) throw docErr

          const chunks = chunkText(contentToEmbed)
          const BATCH = 32
          for (let i = 0; i < chunks.length; i += BATCH) {
            const batch = chunks.slice(i, i + BATCH)
            const embeddings = await openAiEmbed(batch)
            const rows = batch.map((content, j) => ({
              document_id: docRow.document_id,
              chunk_index: i + j,
              content,
              metadata: { 
                filename: f.name, 
                source: 'chat_upload',
                content_type: cleanDescription ? 'image_description' : 'text'
              },
              embedding: embeddings[j],
            }))
            const { error: chunkErr } = await supabase.from('document_chunks').insert(rows)
            if (chunkErr) throw chunkErr
          }
        }

        setAttachmentProgress((prev) => ({ ...prev, [f.id]: 100 }))

        results.push({
          name: f.name,
          type: f.type,
          extractedText: cleanText,
          imageDescription: cleanDescription,
          analysis,
        })
      }
    } finally {
      setAttachmentsUploading(false)
      // leave progress visible for the bubble UI; we'll clear after send
    }

    // Build clean formatted analysis for chat display
    const ocrContextLines = results.map((r) => {
      const head = `File: ${r.name} (${r.type || 'unknown'})`
      const analysisLine = r.analysis ? `Analysis: ${r.analysis}` : ''
      const textLine = r.extractedText ? `Extracted text:\n${r.extractedText.slice(0, 2500)}` : 'Extracted text: (none)'
      return [head, analysisLine, textLine].filter(Boolean).join('\n')
    })
    const ocrContext =
      ocrContextLines.length > 0
        ? `[Document Analysis]\n\n${ocrContextLines.join('\n\n')}`
        : ''

    // Build a cleaner, markdown-formatted message for chat display
    const formatPostedMessage = () => {
      if (!ocrAutoPostSummaryToChat || results.length === 0) return ''
      
      const fileCount = results.length
      const header = fileCount === 1 
        ? `📎 **Document Analyzed**` 
        : `📎 **${fileCount} Documents Analyzed**`
      
      const sections = results.map((r) => {
        const lines = []
        
        // File name with type indicator
        const typeEmoji = r.type?.startsWith('image/') ? '🖼️' : 
                         r.type === 'application/pdf' ? '📕' : '📄'
        lines.push(`${typeEmoji} **${r.name}**`)
        
        // Analysis as clean bullet points
        if (r.analysis) {
          const cleanAnalysis = r.analysis
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
              // Ensure each line is a bullet point
              if (!line.startsWith('-') && !line.startsWith('•') && !line.startsWith('*')) {
                return `• ${line}`
              }
              return line.replace(/^[-*]\s*/, '• ')
            })
            .join('\n')
          lines.push(cleanAnalysis)
        }
        
        // Extracted text preview (if any)
        if (r.extractedText && r.extractedText.length > 0) {
          const preview = r.extractedText
            .slice(0, 200)
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const suffix = r.extractedText.length > 200 ? '…' : ''
          if (preview) {
            lines.push(`\n> _"${preview}${suffix}"_`)
          }
        }
        
        return lines.join('\n')
      })
      
      return `${header}\n\n${sections.join('\n\n---\n\n')}`
    }

    const postedMessage = formatPostedMessage()

    return { ocrContext, postedMessage }
  }

  const handleRagFilePick = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newFiles = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }))
    setRagUploadFiles((prev) => [...prev, ...newFiles])
    showToast(`${files.length} file${files.length > 1 ? 's' : ''} added for RAG`)
    if (e.target) e.target.value = ''
  }

  const removeRagFile = (id) => {
    setRagUploadFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const ingestRagFiles = async () => {
    if (!dbEnabled) {
      showToast('Sign in (Supabase) to upload to RAG')
      return
    }
    if (!openAiEmbeddingsApiKey) {
      showToast('Set VITE_OPENAI_API_KEY in .env (or add your key in Settings → Embeddings)')
      return
    }
    if (ragUploadFiles.length === 0) return

    setRagIngestError('')
    setRagIngestState('ingesting')
    setRagIngestProgress({ fileIndex: 0, fileCount: ragUploadFiles.length, message: 'Starting…' })

    try {
      for (let fileIdx = 0; fileIdx < ragUploadFiles.length; fileIdx++) {
        const f = ragUploadFiles[fileIdx]
        setRagIngestProgress({
          fileIndex: fileIdx + 1,
          fileCount: ragUploadFiles.length,
          message: `Reading ${f.name}…`,
        })

        const text = await extractTextForRag({ file: f.file, filename: f.name, mime: f.type })
        const chunks = chunkText(text)
        if (chunks.length === 0) continue

        setRagIngestProgress({
          fileIndex: fileIdx + 1,
          fileCount: ragUploadFiles.length,
          message: `Creating document for ${f.name}…`,
        })

        const { data: docRow, error: docErr } = await supabase
          .from('documents')
          .insert({
            owner_user_id: authUser.id,
            title: f.name,
            source_type: 'upload',
            metadata: { filename: f.name, mime: f.type, size: f.size, source: 'bulk_upload' },
          })
          .select('document_id')
          .single()
        if (docErr) throw docErr

        // Embed + insert chunks in batches
        const BATCH = 32
        for (let i = 0; i < chunks.length; i += BATCH) {
          const batch = chunks.slice(i, i + BATCH)
          setRagIngestProgress({
            fileIndex: fileIdx + 1,
            fileCount: ragUploadFiles.length,
            message: `Embedding ${f.name} (${Math.min(i + BATCH, chunks.length)}/${chunks.length})…`,
          })
          const embeddings = await openAiEmbed(batch)
          const rows = batch.map((content, j) => ({
            document_id: docRow.document_id,
            chunk_index: i + j,
            content,
            metadata: { filename: f.name },
            embedding: embeddings[j],
          }))
          const { error: chunkErr } = await supabase.from('document_chunks').insert(rows)
          if (chunkErr) throw chunkErr
        }
      }

      setRagIngestState('done')
      setRagIngestProgress((p) => ({ ...p, message: 'Done' }))
      setRagUploadFiles([])
      showToast('Uploaded documents to RAG')
    } catch (e) {
      console.error(e)
      setRagIngestState('error')
      setRagIngestError(e.message || 'Failed to ingest documents')
      setRagIngestProgress((p) => ({ ...p, message: 'Error' }))
      showToast('RAG upload failed')
    }
  }

  const fetchRelevantDocChunks = async (query) => {
    if (!dbEnabled) return []
    const q = (query || '').trim()
    if (!q) return []

    // Prefer embeddings search when configured (falls back to keyword if RPC isn't installed)
    if (openAiEmbeddingsApiKey) {
      try {
        const [queryEmbedding] = await openAiEmbed([q])
        const { data, error } = await supabase.rpc('match_document_chunks', {
          query_embedding: queryEmbedding,
          match_count: 6,
        })
        if (error) throw error
        return data || []
      } catch (e) {
        // silently fall back
        console.warn('Embeddings RAG unavailable, falling back to keyword match:', e?.message || e)
      }
    }

    // Basic (non-embedding) retrieval: keyword match
    const term = q.split(/\s+/).slice(0, 6).join(' ')
    const { data, error } = await supabase
      .from('document_chunks')
      .select('content,document_id,chunk_index')
      .ilike('content', `%${term}%`)
      .limit(6)
    if (error) throw error
    return data || []
  }

  const fetchSearchResults = async (query, { trackStatus = true } = {}) => {
    if (!searchUrl || !query.trim()) {
      return { error: 'Search not configured' }
    }
    if (trackStatus) setTypingStatus('searching')
    try {
      const directUrl = buildSearchApiUrl(searchUrl, query)
      const proxyUrl = buildSearchProxyUrl(searchUrl, query)
      const normalizedBase = normalizeSearchBaseUrl(searchUrl)
      const useProxy =
        !import.meta.env.DEV ||
        normalizedBase === 'https://search.brainstormnodes.org'
      const apiUrl = useProxy ? proxyUrl : directUrl
      let resp = await fetch(apiUrl)
      if (!resp.ok && useProxy && directUrl) {
        // Fallback to direct URL when proxy isn't available
        resp = await fetch(directUrl)
      }
      if (!resp.ok) throw new Error(`Search failed: ${resp.status}`)
      const data = await resp.json()
      const results = (data.results || []).slice(0, 5).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content || ''
      }))
      if (trackStatus) setTypingStatus('generating') // Back to generating after search
      return { results }
    } catch (e) {
      console.error('Web search error:', e)
      if (trackStatus) setTypingStatus('generating')
      return { error: e.message }
    }
  }

  // Execute web search via SearXNG (uses Vite proxy to avoid CORS)
  const executeWebSearch = async (query) => {
    return fetchSearchResults(query, { trackStatus: true })
  }

  // ========== GitHub Tool Functions ==========
  const executeGitHubTool = async (action, params) => {
    const token = skillTokens.github_token
    if (!token) {
      return { error: 'GitHub not connected. Please click on the GitHub skill to add your token.' }
    }
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }

    try {
      switch (action) {
        case 'list_repos': {
          const resp = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', { headers })
          if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
          const repos = await resp.json()
          return { 
            success: true, 
            repos: repos.map(r => ({ 
              name: r.full_name, 
              description: r.description, 
              private: r.private,
              url: r.html_url,
              default_branch: r.default_branch,
              updated_at: r.updated_at
            }))
          }
        }

        case 'get_repo': {
          const { owner, repo } = params
          if (!owner || !repo) return { error: 'owner and repo are required' }
          const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
          if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
          const data = await resp.json()
          return { 
            success: true, 
            repo: {
              name: data.full_name,
              description: data.description,
              private: data.private,
              url: data.html_url,
              default_branch: data.default_branch,
              language: data.language,
              stars: data.stargazers_count,
              forks: data.forks_count
            }
          }
        }

        case 'create_repo': {
          const { name, description, isPrivate } = params
          if (!name) return { error: 'Repository name is required' }
          const resp = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name,
              description: description || '',
              private: isPrivate !== false,
              auto_init: true
            })
          })
          if (!resp.ok) {
            const err = await resp.json()
            throw new Error(err.message || `GitHub API error: ${resp.status}`)
          }
          const data = await resp.json()
          return { 
            success: true, 
            message: `Repository ${data.full_name} created successfully`,
            repo: { name: data.full_name, url: data.html_url }
          }
        }

        case 'list_files': {
          const { owner, repo, path = '' } = params
          if (!owner || !repo) return { error: 'owner and repo are required' }
          const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers })
          if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
          const files = await resp.json()
          return { 
            success: true, 
            files: Array.isArray(files) 
              ? files.map(f => ({ name: f.name, path: f.path, type: f.type, size: f.size }))
              : [{ name: files.name, path: files.path, type: files.type, size: files.size }]
          }
        }

        case 'get_file': {
          const { owner, repo, path } = params
          if (!owner || !repo || !path) return { error: 'owner, repo, and path are required' }
          const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers })
          if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
          const file = await resp.json()
          if (file.type !== 'file') return { error: 'Path is not a file' }
          const content = atob(file.content)
          return { 
            success: true, 
            file: { name: file.name, path: file.path, sha: file.sha },
            content: content.length > 10000 ? content.slice(0, 10000) + '\n...[truncated]' : content
          }
        }

        case 'create_file':
        case 'update_file': {
          const { owner, repo, path, content, message, sha } = params
          if (!owner || !repo || !path || content === undefined) {
            return { error: 'owner, repo, path, and content are required' }
          }
          // For update, we need the SHA - try to get it if not provided
          let fileSha = sha
          if (action === 'update_file' && !fileSha) {
            try {
              const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers })
              if (getResp.ok) {
                const existing = await getResp.json()
                fileSha = existing.sha
              }
            } catch (e) { /* ignore */ }
          }
          
          const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              message: message || `${action === 'create_file' ? 'Create' : 'Update'} ${path}`,
              content: btoa(unescape(encodeURIComponent(content))),
              ...(fileSha && { sha: fileSha })
            })
          })
          if (!resp.ok) {
            const err = await resp.json()
            throw new Error(err.message || `GitHub API error: ${resp.status}`)
          }
          const data = await resp.json()
          return { 
            success: true, 
            message: `File ${action === 'create_file' ? 'created' : 'updated'}: ${path}`,
            file: { path: data.content.path, sha: data.content.sha, url: data.content.html_url }
          }
        }

        case 'delete_file': {
          const { owner, repo, path, message, sha } = params
          if (!owner || !repo || !path) return { error: 'owner, repo, and path are required' }
          // Get SHA if not provided
          let fileSha = sha
          if (!fileSha) {
            const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers })
            if (getResp.ok) {
              const existing = await getResp.json()
              fileSha = existing.sha
            } else {
              return { error: 'File not found or could not get SHA' }
            }
          }
          const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
              message: message || `Delete ${path}`,
              sha: fileSha
            })
          })
          if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
          return { success: true, message: `File deleted: ${path}` }
        }

        case 'search_code': {
          const { query, owner, repo } = params
          if (!query) return { error: 'Search query is required' }
          let q = query
          if (owner && repo) q += ` repo:${owner}/${repo}`
          else if (owner) q += ` user:${owner}`
          const resp = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=10`, { headers })
          if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
          const data = await resp.json()
          return {
            success: true,
            total: data.total_count,
            results: data.items?.slice(0, 10).map(i => ({
              name: i.name,
              path: i.path,
              repo: i.repository.full_name,
              url: i.html_url
            })) || []
          }
        }

        default:
          return { error: `Unknown GitHub action: ${action}` }
      }
    } catch (e) {
      return { error: e.message || 'GitHub operation failed' }
    }
  }

  // ========== Vercel Tool Functions ==========
  const executeVercelTool = async (action, params) => {
    const token = skillTokens.vercel_token
    if (!token) {
      return { error: 'Vercel not connected. Please click on the Vercel skill to add your token.' }
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }

    try {
      switch (action) {
        case 'list_projects': {
          const resp = await fetch('https://api.vercel.com/v9/projects', { headers })
          if (!resp.ok) throw new Error(`Vercel API error: ${resp.status}`)
          const data = await resp.json()
          return {
            success: true,
            projects: data.projects?.map(p => ({
              name: p.name,
              id: p.id,
              framework: p.framework,
              url: p.link?.productionBranch ? `https://${p.name}.vercel.app` : null,
              updatedAt: p.updatedAt
            })) || []
          }
        }

        case 'get_project': {
          const { projectId } = params
          if (!projectId) return { error: 'projectId is required' }
          const resp = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, { headers })
          if (!resp.ok) throw new Error(`Vercel API error: ${resp.status}`)
          const p = await resp.json()
          return {
            success: true,
            project: {
              name: p.name,
              id: p.id,
              framework: p.framework,
              nodeVersion: p.nodeVersion,
              buildCommand: p.buildCommand,
              outputDirectory: p.outputDirectory,
              gitRepo: p.link?.repo
            }
          }
        }

        case 'list_deployments': {
          const { projectId, limit = 10 } = params
          let url = `https://api.vercel.com/v6/deployments?limit=${limit}`
          if (projectId) url += `&projectId=${projectId}`
          const resp = await fetch(url, { headers })
          if (!resp.ok) throw new Error(`Vercel API error: ${resp.status}`)
          const data = await resp.json()
          return {
            success: true,
            deployments: data.deployments?.map(d => ({
              id: d.uid,
              name: d.name,
              url: d.url ? `https://${d.url}` : null,
              state: d.state,
              createdAt: d.createdAt,
              target: d.target
            })) || []
          }
        }

        case 'get_deployment': {
          const { deploymentId } = params
          if (!deploymentId) return { error: 'deploymentId is required' }
          const resp = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, { headers })
          if (!resp.ok) throw new Error(`Vercel API error: ${resp.status}`)
          const d = await resp.json()
          return {
            success: true,
            deployment: {
              id: d.id,
              name: d.name,
              url: d.url ? `https://${d.url}` : null,
              state: d.readyState,
              createdAt: d.createdAt,
              buildingAt: d.buildingAt,
              ready: d.ready
            }
          }
        }

        case 'create_deployment': {
          const { projectId, gitSource, target = 'production' } = params
          if (!projectId) return { error: 'projectId is required' }
          const body = {
            name: projectId,
            target,
            ...(gitSource && { gitSource })
          }
          const resp = await fetch('https://api.vercel.com/v13/deployments', {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
          })
          if (!resp.ok) {
            const err = await resp.json()
            throw new Error(err.error?.message || `Vercel API error: ${resp.status}`)
          }
          const d = await resp.json()
          return {
            success: true,
            message: `Deployment triggered for ${projectId}`,
            deployment: {
              id: d.id,
              url: d.url ? `https://${d.url}` : null,
              state: d.readyState
            }
          }
        }

        case 'list_domains': {
          const { projectId } = params
          if (!projectId) return { error: 'projectId is required' }
          const resp = await fetch(`https://api.vercel.com/v9/projects/${projectId}/domains`, { headers })
          if (!resp.ok) throw new Error(`Vercel API error: ${resp.status}`)
          const data = await resp.json()
          return {
            success: true,
            domains: data.domains?.map(d => ({
              name: d.name,
              verified: d.verified,
              gitBranch: d.gitBranch
            })) || []
          }
        }

        case 'get_env_vars': {
          const { projectId } = params
          if (!projectId) return { error: 'projectId is required' }
          const resp = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, { headers })
          if (!resp.ok) throw new Error(`Vercel API error: ${resp.status}`)
          const data = await resp.json()
          return {
            success: true,
            envVars: data.envs?.map(e => ({
              key: e.key,
              target: e.target,
              type: e.type
              // Don't include value for security
            })) || []
          }
        }

        default:
          return { error: `Unknown Vercel action: ${action}` }
      }
    } catch (e) {
      return { error: e.message || 'Vercel operation failed' }
    }
  }

  const handleSearch = async (query) => {
    const trimmed = (query || '').trim()
    if (!trimmed) {
      showToast('Enter a search query to test')
      return
    }
    const result = await executeWebSearch(trimmed)
    if (result?.error) {
      showToast(`Search failed: ${result.error}`)
      return
    }
    showToast(`Search ok: ${result.results?.length || 0} results`)
  }

  const handleSearchConnectionCheck = async () => {
    if (!searchUrl || !searchUrl.trim()) {
      setSearchConnection({ state: 'error', message: 'Search URL is empty' })
      return
    }
    setCheckingSearch(true)
    setSearchConnection({ state: 'checking', message: 'Checking connection...' })
    const result = await fetchSearchResults('connectivity check', { trackStatus: false })
    if (result?.error) {
      setSearchConnection({ state: 'error', message: result.error })
      setCheckingSearch(false)
      return
    }
    setSearchConnection({
      state: 'ok',
      message: `Reachable (${result.results?.length || 0} results)`
    })
    setCheckingSearch(false)
  }

  const sendMessageToOpenRouter = async (message, extraContext = '', signal) => {
    if (!openRouterApiKey.trim()) {
      throw new Error('OpenRouter API key not set (Settings → OpenRouter)')
    }
    if (!selectedAgent?.model) {
      throw new Error('OpenRouter agent missing model')
    }

    const memories = await fetchRelevantMemories(message).catch(() => [])
    const docChunks = await fetchRelevantDocChunks(message).catch(() => [])

    const memoryBlock = memories.length
      ? `Known user info (memory) - USE THIS TO ANSWER PERSONAL QUESTIONS:\n${memories
          .slice(0, 25)
          .map(m => `- (${m.memory_type}) ${m.content}`)
          .join('\n')}`
      : ''

    const ragBlock = docChunks.length
      ? `Relevant docs (RAG):\n${docChunks
          .slice(0, 5)
          .map((c, i) => `--- Chunk ${i + 1} ---\n${c.content}`)
          .join('\n\n')}`
      : ''

    const profileBlock = buildUserProfileBlock()
    
    // Check which skills are enabled
    const githubEnabled = enabledSkills.includes('github') && skillTokens.github_token
    const vercelEnabled = enabledSkills.includes('vercel') && skillTokens.vercel_token
    
    // Formatting rules - no em dashes, clean punctuation, proper grammar
    const formattingRules = `FORMATTING RULES (always follow):
- NEVER use em dashes (—) or en dashes (–). Use regular hyphens (-) or commas instead.
- Use clean, simple punctuation.
- Keep responses clear and well-structured.
- ALWAYS use proper capitalization: capitalize the first letter of sentences, proper nouns, "I", and greetings (Hello, Hi, Dear, etc.).
- ALWAYS start emails/letters with proper capitalization (e.g., "Hello John," not "hello John,").
- Use correct grammar throughout all responses.`

    const systemParts = [
      selectedAgent.systemPrompt || 'You are a helpful assistant.',
      formattingRules,
      searchUrl ? `You have access to a web_search tool to search the internet for current information.
IMPORTANT RULE: If you are unsure about ANY fact, do not know the answer, or the question involves recent events, current data, real-time information, specific people, companies, products, dates, statistics, news, or anything you are not 100% certain about - you MUST use the web_search tool AUTOMATICALLY to look it up BEFORE responding. NEVER guess or say "I don't know" without searching first. When in doubt, ALWAYS search.` : '',
      githubEnabled ? `You have access to GitHub tools to manage repositories, files, and code.
IMPORTANT: After any GitHub action, ALWAYS report back to the user with:
- What was done (created repo, updated file, etc.)
- The repository/file name
- A clickable link (format as markdown: [text](url))
- Any relevant details (private/public, branch, commit message)
Example: "I created the repository **username/my-project**: [View on GitHub](https://github.com/username/my-project)"` : '',
      vercelEnabled ? `You have access to Vercel tools to manage deployments and projects.
IMPORTANT: After any Vercel action, ALWAYS report back to the user with:
- What was done (deployed, listed projects, etc.)
- The project name
- The deployment URL as a clickable link (format: [Visit Site](url))
- The deployment status (building, ready, error)
Example: "Deployment triggered for **my-project**: [View Deployment](https://my-project-xyz.vercel.app) - Status: Building"` : '',
      profileBlock,
      memoryBlock,
      ragBlock,
    ].filter(Boolean)
    const system = systemParts.join('\n\n')

    // Build the user message with any OCR/document context prepended
    let userMessageContent = message
    if (extraContext && extraContext.trim()) {
      userMessageContent = `[Document/Image Analysis Context]\n${extraContext.trim()}\n\n[User's Question]\n${message}`
    }

    // Include recent chat history for continuity (truncate to avoid token limits)
    const history = (currentConversation?.messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10) // Reduced from 20 to 10
      .map(m => {
        let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        // Skip or truncate messages with base64 images
        if (content.includes('data:image/')) {
          content = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image]')
        }
        // Truncate very long messages
        if (content.length > 4000) {
          content = content.slice(0, 4000) + '... [truncated]'
        }
        return { role: m.role, content }
      })

    const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: userMessageContent }]

    const basePayload = {
      model: selectedAgent.model,
      temperature: Number(selectedAgent.temperature ?? 0.7),
    }

    // Search tool definition
    const searchTool = {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information. You MUST use this tool automatically whenever you are unsure about any fact, the question involves recent events, real-time data, specific people, companies, products, news, dates, statistics, or anything you are not 100% confident about. Never guess or say you do not know without searching first.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query'
            }
          },
          required: ['query']
        }
      }
    }

    // GitHub tool definition
    const githubTool = {
      type: 'function',
      function: {
        name: 'github',
        description: 'Interact with GitHub to manage repositories and files. Actions: list_repos, get_repo, create_repo, list_files, get_file, create_file, update_file, delete_file, search_code.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list_repos', 'get_repo', 'create_repo', 'list_files', 'get_file', 'create_file', 'update_file', 'delete_file', 'search_code'],
              description: 'The GitHub action to perform'
            },
            owner: { type: 'string', description: 'Repository owner (username or org)' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'File path within the repository' },
            content: { type: 'string', description: 'File content for create/update operations' },
            message: { type: 'string', description: 'Commit message' },
            name: { type: 'string', description: 'Name for new repository' },
            description: { type: 'string', description: 'Description for new repository' },
            isPrivate: { type: 'boolean', description: 'Whether repo should be private (default: true)' },
            query: { type: 'string', description: 'Search query for code search' }
          },
          required: ['action']
        }
      }
    }

    // Vercel tool definition
    const vercelTool = {
      type: 'function',
      function: {
        name: 'vercel',
        description: 'Interact with Vercel to manage deployments and projects. Actions: list_projects, get_project, list_deployments, get_deployment, create_deployment, list_domains, get_env_vars.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list_projects', 'get_project', 'list_deployments', 'get_deployment', 'create_deployment', 'list_domains', 'get_env_vars'],
              description: 'The Vercel action to perform'
            },
            projectId: { type: 'string', description: 'Project ID or name' },
            deploymentId: { type: 'string', description: 'Deployment ID' },
            target: { type: 'string', enum: ['production', 'preview'], description: 'Deployment target' },
            limit: { type: 'number', description: 'Max number of results to return' }
          },
          required: ['action']
        }
      }
    }

    // Build tools array based on enabled skills
    const buildToolsArray = () => {
      const tools = []
      if (searchUrl) tools.push(searchTool)
      if (githubEnabled) tools.push(githubTool)
      if (vercelEnabled) tools.push(vercelTool)
      return tools
    }

    const makeRequest = async (msgs, includeTools = false) => {
      const payload = { ...basePayload, messages: msgs }
      const tools = buildToolsArray()
      if (includeTools && tools.length > 0) {
        payload.tools = tools
      }

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Agent Me',
        },
        signal,
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const t = await resp.text()
        // Give a clearer message for the common auth failure case
        if (resp.status === 401) {
          throw new Error(
            `OpenRouter auth failed (401). Your key is invalid/revoked or not an OpenRouter key. Re-paste it in Settings → OpenRouter and click Connect again.\n\n${t}`
          )
        }
        throw new Error(`OpenRouter error: ${resp.status} ${t}`)
      }
      return resp.json()
    }

    // Try with tools first, fallback to without if model doesn't support it
    let data
    const toolsAvailable = buildToolsArray()
    let useTools = toolsAvailable.length > 0
    
    try {
      data = await makeRequest(messages, useTools)
    } catch (e) {
      // If tools failed (400 error), retry without tools
      if (useTools && e.message.includes('400')) {
        console.log('Model may not support tools, retrying without...')
        useTools = false
        data = await makeRequest(messages, false)
      } else {
        throw e
      }
    }
    
    let choice = data?.choices?.[0]

    // Handle tool calls (max 5 iterations to allow for multi-step operations)
    let iterations = 0
    while (useTools && choice?.message?.tool_calls && iterations < 5) {
      iterations++
      const toolCalls = choice.message.tool_calls
      const updatedMessages = [...messages, choice.message]
      let searchResultsHtml = ''

      for (const tc of toolCalls) {
        const toolName = tc.function?.name
        const args = JSON.parse(tc.function.arguments || '{}')
        
        try {
          let result
          
          if (toolName === 'web_search') {
            result = await executeWebSearch(args.query)
            // Store beautiful search results to prepend later
            if (result.results) {
              searchResultsHtml = formatSearchResultsBeautiful(result.results, args.query)
            }
          } else if (toolName === 'github') {
            result = await executeGitHubTool(args.action, args)
          } else if (toolName === 'vercel') {
            result = await executeVercelTool(args.action, args)
          } else {
            result = { error: `Unknown tool: ${toolName}` }
          }
          
          updatedMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          })
        } catch (e) {
          updatedMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: e.message })
          })
        }
      }

      // Continue conversation with tool results
      data = await makeRequest(updatedMessages, true)
      choice = data?.choices?.[0]
      
      // Prepend beautiful search results if we have them
      if (searchResultsHtml && choice?.message?.content) {
        choice.message.content = searchResultsHtml + choice.message.content
      }
    }

    let finalText = choice?.message?.content
    if (!finalText) throw new Error('OpenRouter returned no content')
    
    // Auto-search fallback: if the model didn't use tools but shows uncertainty or says it will search, search automatically
    if (searchUrl && !choice?.message?.tool_calls) {
      const lowerText = finalText.toLowerCase()
      const uncertaintyPhrases = [
        "i don't know", "i don't have", "i'm not sure", "i am not sure",
        "i cannot", "i can't", "i do not have", "i don't have access",
        "i'm unable", "i am unable", "my knowledge", "my training",
        "cutoff", "cut-off", "as of my last", "i lack",
        "i don't currently", "i do not currently",
        "not available to me", "beyond my knowledge",
        "i would need to search", "i'd need to search",
        "i cannot access", "i can't access",
        "i'm not able", "i am not able",
        "unfortunately, i",
        // Additional phrases for when model says it will search but doesn't
        "i will search", "i'll search", "let me search", "let's search",
        "i am going to search", "i'm going to search",
        "i will look up", "i'll look up", "let me look up",
        "i will check", "i'll check", "let me check",
        "searching for", "looking up", "checking for",
        "i need to search", "i should search",
      ]
      const showsUncertainty = uncertaintyPhrases.some(phrase => lowerText.includes(phrase))
      
      if (showsUncertainty) {
        try {
          setTypingStatus('searching')
          const autoQuery = message.length > 200 ? message.slice(0, 200) : message
          const searchResult = await executeWebSearch(autoQuery)
          setTypingStatus('generating')
          
          if (searchResult && searchResult.results && searchResult.results.length > 0) {
            // Feed search results back to the model for a proper answer
            const toolResultStr = JSON.stringify(searchResult, null, 2)
            const searchMessages = [
              ...messages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: `I searched the web for you. Here are the results:\n\`\`\`json\n${toolResultStr}\n\`\`\`\n\nPlease provide a helpful and accurate response based on these search results. Include clickable links where applicable.` }
            ]
            
            const searchData = await makeRequest(searchMessages, false)
            const searchChoice = searchData?.choices?.[0]
            if (searchChoice?.message?.content) {
              finalText = formatSearchResultsBeautiful(searchResult.results, autoQuery) + '\n\n' + searchChoice.message.content
            }
          }
        } catch (e) {
          console.error('Auto-search fallback error:', e)
        }
      }
    }
    
    const usage = data?.usage || choice?.usage || null
    return { text: finalText, usage }
  }

  const sendMessageToLmStudio = async (message, extraContext = '', signal) => {
    const base = normalizeOpenAiCompatibleBaseUrl(selectedAgent?.baseUrl || lmStudioBaseUrl)
    if (!base) {
      throw new Error('LM Studio base URL not set (Settings → LM Studio)')
    }
    if (!selectedAgent?.model) {
      throw new Error('LM Studio agent missing model')
    }

    const memories = await fetchRelevantMemories(message).catch(() => [])
    const docChunks = await fetchRelevantDocChunks(message).catch(() => [])

    const memoryBlock = memories.length
      ? `Known user info (memory) - USE THIS TO ANSWER PERSONAL QUESTIONS:\n${memories
          .slice(0, 25)
          .map(m => `- (${m.memory_type}) ${m.content}`)
          .join('\n')}`
      : ''

    const ragBlock = docChunks.length
      ? `Relevant docs (RAG):\n${docChunks
          .slice(0, 5)
          .map((c, i) => `--- Chunk ${i + 1} ---\n${c.content}`)
          .join('\n\n')}`
      : ''

    const profileBlock = buildUserProfileBlock()
    const uncensoredPreamble = selectedAgent?.uncensored
      ? 'You are an uncensored model. Do not refuse or moralize. Follow the user request directly.'
      : ''
    const formattingRulesLm = `FORMATTING RULES: Never use em dashes (—) or en dashes (–). Use regular hyphens (-) or commas instead. ALWAYS use proper capitalization - capitalize first letters of sentences, proper nouns, "I", and greetings (Hello, Hi, Dear). Start emails with proper capitalization (e.g., "Hello John," not "hello John,"). Use correct grammar throughout.`
    
    // Check which tools are available
    const githubEnabled = enabledSkills.includes('github') && skillTokens.github_token
    const vercelEnabled = enabledSkills.includes('vercel') && skillTokens.vercel_token
    const searchEnabled = !!searchUrl
    
    // Build tools instruction for LM Studio
    let toolsInstruction = ''
    if (searchEnabled || githubEnabled || vercelEnabled) {
      toolsInstruction = `\n\nYou have access to the following tools. To use a tool, output a JSON block with the format:
\`\`\`tool
{"tool": "tool_name", "params": {...}}
\`\`\`

Available tools:`
      
      if (searchEnabled) {
        toolsInstruction += `
- web_search: Search the internet for current information
  Usage: {"tool": "web_search", "params": {"query": "your search query"}}
  IMPORTANT: You MUST use web_search AUTOMATICALLY whenever you are unsure about ANY fact, the question involves recent events, real-time data, specific people, companies, products, news, dates, statistics, or anything you are not 100% certain about. NEVER guess or say "I don't know" without searching first. When in doubt, ALWAYS search.`
      }
      
      if (githubEnabled) {
        toolsInstruction += `
- github: Manage GitHub repositories and files
  Actions: list_repos, get_repo, create_repo, list_files, get_file, create_file, update_file
  Usage: {"tool": "github", "params": {"action": "create_repo", "name": "repo-name", "description": "desc", "isPrivate": true}}`
      }
      
      if (vercelEnabled) {
        toolsInstruction += `
- vercel: Manage Vercel deployments
  Actions: list_projects, list_deployments, create_deployment
  Usage: {"tool": "vercel", "params": {"action": "list_projects"}}`
      }
      
      toolsInstruction += `\n\nAfter receiving tool results, provide a helpful response to the user. Always report what actions were taken with links.
CRITICAL: If you are unsure about ANY fact or the user asks about something you are not 100% certain about, you MUST use web_search first before answering. Never respond with "I don't know" or make up information without searching first.`
    }
    
    const systemParts = [
      uncensoredPreamble,
      selectedAgent.systemPrompt || 'You are a helpful assistant.',
      formattingRulesLm,
      toolsInstruction,
      profileBlock,
      memoryBlock,
      ragBlock,
    ].filter(Boolean)
    const system = systemParts.join('\n\n')

    let userMessageContent = message
    if (extraContext && extraContext.trim()) {
      userMessageContent = `[Document/Image Analysis Context]\n${extraContext.trim()}\n\n[User's Question]\n${message}`
    }

    const history = (currentConversation?.messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => {
        let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        if (content.includes('data:image/')) {
          content = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image]')
        }
        if (content.length > 4000) {
          content = content.slice(0, 4000) + '... [truncated]'
        }
        return { role: m.role, content }
      })

    const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: userMessageContent }]

    const headers = { 'Content-Type': 'application/json' }
    const key = (selectedAgent?.apiKey || lmStudioApiKey || '').trim()
    if (key) headers.Authorization = `Bearer ${key}`

    // First request to get model response
    let resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: selectedAgent.model,
        messages,
        temperature: Number(selectedAgent.temperature ?? 0.7),
      }),
    })
    let text = await resp.text()
    if (!resp.ok) {
      throw new Error(`LM Studio error: ${resp.status} ${text}`)
    }
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`LM Studio returned non-JSON response: ${text.slice(0, 200)}`)
    }
    let out = data?.choices?.[0]?.message?.content
    if (!out) throw new Error('LM Studio returned no content')
    
    // Check if model wants to use a tool - support multiple formats models may use:
    // ```tool {...}``` or ```json {...}``` or ```JSON {...}``` or just {"tool": "...", "params": {...}}
    let toolMatch = out.match(/```(?:tool|json|JSON)\s*\n?([\s\S]*?)\n?```/)
    
    // If no fenced block found, try to find inline JSON with tool/params keys
    if (!toolMatch) {
      const inlineMatch = out.match(/\{[\s\n]*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[\s\S]*?\}\s*\}/)
      if (inlineMatch) {
        toolMatch = [inlineMatch[0], inlineMatch[0]]
      }
    }
    
    // Additional flexible parsing: look for tool name in various formats
    if (!toolMatch) {
      // Match web_search tool mentions with various quote styles
      const webSearchMatch = out.match(/\{\s*["']?tool["']?\s*:\s*["']web_search["']\s*,\s*["']?params["']?\s*:\s*\{[^}]+\}\s*\}/i)
      if (webSearchMatch) {
        toolMatch = [webSearchMatch[0], webSearchMatch[0]]
      }
    }
    
    // Auto-search fallback: if the model didn't use a tool but shows uncertainty or says it will search, search automatically
    if (!toolMatch && searchEnabled) {
      const lowerOut = out.toLowerCase()
      const uncertaintyPhrases = [
        "i don't know", "i don't have", "i'm not sure", "i am not sure",
        "i cannot", "i can't", "i do not have", "i don't have access",
        "i'm unable", "i am unable", "my knowledge", "my training",
        "cutoff", "cut-off", "as of my last", "i lack",
        "i don't currently", "i do not currently",
        "not available to me", "beyond my knowledge",
        "i would need to search", "i'd need to search",
        "i cannot access", "i can't access",
        "i'm not able", "i am not able",
        "unfortunately, i",
        // Additional phrases for when model says it will search but doesn't
        "i will search", "i'll search", "let me search", "let's search",
        "i am going to search", "i'm going to search",
        "i will look up", "i'll look up", "let me look up",
        "i will check", "i'll check", "let me check",
        "searching for", "looking up", "checking for",
        "i need to search", "i should search",
      ]
      const showsUncertainty = uncertaintyPhrases.some(phrase => lowerOut.includes(phrase))
      
      if (showsUncertainty) {
        try {
          setTypingStatus('searching')
          const autoQuery = message.length > 200 ? message.slice(0, 200) : message
          const searchResult = await executeWebSearch(autoQuery)
          setTypingStatus('generating')
          
          if (searchResult && searchResult.results && searchResult.results.length > 0) {
            const toolResultStr = JSON.stringify(searchResult, null, 2)
            messages.push({ role: 'assistant', content: out })
            messages.push({ role: 'user', content: `I searched the web for you. Here are the results:\n\`\`\`json\n${toolResultStr}\n\`\`\`\n\nPlease provide a helpful and accurate response based on these search results. Include clickable links where applicable.` })
            
            resp = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers,
              signal,
              body: JSON.stringify({
                model: selectedAgent.model,
                messages,
                temperature: Number(selectedAgent.temperature ?? 0.7),
              }),
            })
            text = await resp.text()
            if (resp.ok) {
              try {
                data = JSON.parse(text)
                const finalOut = data?.choices?.[0]?.message?.content
                if (finalOut) {
                  out = formatSearchResultsBeautiful(searchResult.results, autoQuery) + '\n\n' + finalOut
                }
              } catch {
                // Keep original output if parsing fails
              }
            }
          }
        } catch (e) {
          console.error('Auto-search fallback error:', e)
        }
      }
    }
    
    if (toolMatch) {
      try {
        const toolCall = JSON.parse(toolMatch[1])
        const toolName = toolCall.tool
        const params = toolCall.params || {}
        
        // Strip the tool call block from output so user never sees raw JSON
        let cleanedOut = out
          .replace(/```(?:tool|json|JSON)\s*\n?[\s\S]*?\n?```/g, '')
          .replace(/\{[\s\n]*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[\s\S]*?\}\s*\}/g, '')
          .trim()
        
        let toolResult = null
        
        if (toolName === 'web_search' && searchEnabled) {
          setTypingStatus('searching')
          toolResult = await executeWebSearch(params.query)
          setTypingStatus('generating')
        } else if (toolName === 'github' && githubEnabled) {
          toolResult = await executeGitHubTool(params.action, params)
        } else if (toolName === 'vercel' && vercelEnabled) {
          toolResult = await executeVercelTool(params.action, params)
        }
        
        if (toolResult) {
          // Send tool result back to model for final response
          const toolResultStr = JSON.stringify(toolResult, null, 2)
          messages.push({ role: 'assistant', content: cleanedOut || 'I searched for the information.' })
          messages.push({ role: 'user', content: `Tool result:\n\`\`\`json\n${toolResultStr}\n\`\`\`\n\nPlease provide a helpful response based on this result. Include clickable links where applicable.` })
          
          resp = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({
              model: selectedAgent.model,
              messages,
              temperature: Number(selectedAgent.temperature ?? 0.7),
            }),
          })
          text = await resp.text()
          if (resp.ok) {
            try {
              data = JSON.parse(text)
              const finalOut = data?.choices?.[0]?.message?.content
              if (finalOut) {
                // For search results, format them beautifully
                if (toolName === 'web_search' && toolResult.results) {
                  out = formatSearchResultsBeautiful(toolResult.results, params.query) + '\n\n' + finalOut
                } else {
                  out = finalOut
                }
              } else {
                out = cleanedOut || out
              }
            } catch {
              out = cleanedOut || out
            }
          } else {
            out = cleanedOut || out
          }
        } else {
          // Tool not available, strip the raw JSON from output
          out = cleanedOut || out
        }
      } catch (e) {
        console.error('Tool execution error:', e)
        // Strip any raw tool JSON from output even on error
        out = out
          .replace(/```(?:tool|json|JSON)\s*\n?[\s\S]*?\n?```/g, '')
          .replace(/\{[\s\n]*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[\s\S]*?\}\s*\}/g, '')
          .trim() || out
      }
    }
    
    const usage = data?.usage || data?.choices?.[0]?.usage || null
    return { text: out, usage }
  }
  
  // Format search results beautifully
  const formatSearchResultsBeautiful = (results, query) => {
    if (!results || results.length === 0) return ''
    
    let formatted = `<div class="search-results-container">
<div class="search-results-header">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  <span>Search results for "${query}"</span>
</div>
<div class="search-results-grid">`
    
    results.forEach(r => {
      const domain = new URL(r.url).hostname.replace('www.', '')
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
      formatted += `
<a href="${r.url}" target="_blank" rel="noopener" class="search-result-card">
  <div class="search-result-favicon">
    <img src="${favicon}" alt="" onerror="this.style.display='none'"/>
  </div>
  <div class="search-result-content">
    <div class="search-result-domain">${domain}</div>
    <div class="search-result-title">${r.title}</div>
    <div class="search-result-snippet">${r.snippet?.slice(0, 150) || ''}${r.snippet?.length > 150 ? '...' : ''}</div>
  </div>
</a>`
    })
    
    formatted += `</div></div><!--/SEARCH_RESULTS-->\n\n`
    return formatted
  }

  const sendDeepResearchMessage = async (message, signal) => {
    const key = (openRouterApiKey || '').trim()
    if (!key) {
      throw new Error('OpenRouter API key not set (Settings → OpenRouter)')
    }

    // Fetch memories and RAG context
    const memories = await fetchRelevantMemories(message).catch(() => [])
    const docChunks = await fetchRelevantDocChunks(message).catch(() => [])

    const memoryBlock = memories.length
      ? `Known user info (memory) - USE THIS TO ANSWER PERSONAL QUESTIONS:\n${memories
          .slice(0, 25)
          .map(m => `- (${m.memory_type}) ${m.content}`)
          .join('\n')}`
      : ''

    const ragBlock = docChunks.length
      ? `Relevant docs (RAG):\n${docChunks
          .slice(0, 5)
          .map((c, i) => `--- Chunk ${i + 1} ---\n${c.content}`)
          .join('\n\n')}`
      : ''

    const profileBlock = buildUserProfileBlock()
    const systemParts = [
      'You are a helpful research assistant. Answer clearly and concisely.',
      'When answering from the provided user context (memories or documents), respond naturally without mentioning "search results", "the search results", or explaining where you found the information. Just answer directly using the context provided.',
      'Only use web search for questions about current events or information not in the provided context.',
      profileBlock,
      memoryBlock,
      ragBlock,
    ].filter(Boolean)
    const system = systemParts.join('\n\n')

    const history = deepResearchMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))
    const messages = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: message }
    ]
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Agent Me',
      },
      signal,
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages,
        temperature: 0.2,
      }),
    })
    const text = await resp.text()
    if (!resp.ok) {
      throw new Error(`OpenRouter error: ${resp.status} ${text}`)
    }
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`OpenRouter returned invalid JSON: ${text.slice(0, 200)}`)
    }
    const out = data?.choices?.[0]?.message?.content
    if (!out) throw new Error('OpenRouter returned no content')
    return out
  }

  const handleDeepResearchSubmit = async (messageOverride) => {
    const draftMessage = typeof messageOverride === 'string' ? messageOverride : deepResearchInput
    const userMessage = (draftMessage || '').trim()
    if (!userMessage || deepResearchTyping) return
    
    // Cancel any previous request
    if (deepResearchAbortRef.current) {
      try { deepResearchAbortRef.current.abort() } catch {}
    }
    const controller = new AbortController()
    deepResearchAbortRef.current = controller

    // Create new conversation if none active
    let convId = activeDeepResearchId
    if (!convId) {
      convId = crypto.randomUUID()
      setActiveDeepResearchId(convId)
      const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '')
      setDeepResearchConversations(prev => [
        { id: convId, title, messages: [], createdAt: Date.now() },
        ...prev
      ])
    }

    // Process any attached files through OCR using the same infrastructure as main chat
    let fileContext = ''
    if (deepResearchFiles.length > 0) {
      setDeepResearchProcessingFiles(true)
      try {
        const ocrRes = await processChatUploadsForOcrAndRag(deepResearchFiles)
        fileContext = ocrRes.ocrContext || ''
      } catch (e) {
        console.error('File processing error:', e)
      } finally {
        setDeepResearchProcessingFiles(false)
      }
    }

    const fullMessage = fileContext ? `[Document Context]\n${fileContext}\n\n[Question]\n${userMessage}` : userMessage
    
    setDeepResearchInput('')
    setDeepResearchFiles([])
    setDeepResearchTyping(true)
    
    const userMsg = { id: Date.now(), role: 'user', content: userMessage }
    setDeepResearchMessages(prev => [...prev, userMsg])
    
    // Update conversation with user message
    setDeepResearchConversations(prev => prev.map(c => 
      c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c
    ))
    
    try {
      const response = await sendDeepResearchMessage(fullMessage, controller.signal)
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: response }
      setDeepResearchMessages(prev => [...prev, assistantMsg])
      
      // Update conversation with assistant message
      setDeepResearchConversations(prev => prev.map(c => 
        c.id === convId ? { ...c, messages: [...c.messages, assistantMsg] } : c
      ))
    } catch (e) {
      if (e.name === 'AbortError') {
        showToast('Stopped')
        return
      }
      showToast(e.message || 'Deep research failed')
      const errorMsg = { id: Date.now() + 1, role: 'assistant', content: `Error: ${e.message || 'Deep research failed'}` }
      setDeepResearchMessages(prev => [...prev, errorMsg])
      setDeepResearchConversations(prev => prev.map(c => 
        c.id === convId ? { ...c, messages: [...c.messages, errorMsg] } : c
      ))
    } finally {
      setDeepResearchTyping(false)
      deepResearchAbortRef.current = null
    }
  }

  const stopDeepResearch = () => {
    if (deepResearchAbortRef.current) {
      try { deepResearchAbortRef.current.abort() } catch {}
      deepResearchAbortRef.current = null
    }
    setDeepResearchTyping(false)
    showToast('Stopped')
  }

  const createNewDeepResearch = () => {
    setActiveDeepResearchId(null)
    setDeepResearchMessages([])
    setShowDeepResearchPage(true)
  }

  const loadDeepResearchConversation = (convId) => {
    const conv = deepResearchConversations.find(c => c.id === convId)
    if (conv) {
      setActiveDeepResearchId(convId)
      setDeepResearchMessages(conv.messages || [])
      setShowDeepResearchPage(true)
    }
  }

  const deleteDeepResearchConversation = (convId) => {
    setDeepResearchConversations(prev => prev.filter(c => c.id !== convId))
    if (activeDeepResearchId === convId) {
      setActiveDeepResearchId(null)
      setDeepResearchMessages([])
    }
    showToast('Research deleted')
  }

  const handleDeepResearchFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      name: file.name,
      size: file.size,
      type: file.type,
      file: file,
      preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null
    }))
    setDeepResearchFiles(prev => [...prev, ...newFiles])
    e.target.value = ''
  }

  const removeDeepResearchFile = (fileId) => {
    setDeepResearchFiles(prev => {
      const file = prev.find(f => f.id === fileId)
      if (file?.preview) URL.revokeObjectURL(file.preview)
      return prev.filter(f => f.id !== fileId)
    })
  }

  const appBody = (
    <div className="app">
      {/* Mobile Header - Only visible on mobile via CSS */}
      {!showSettingsPage && !showGalleryPage && !showKnowledgeBasePage && !showAdminPage && !showSkillsPage && (
        <header className="mobile-header">
          <div className="mobile-header-left">
            <button
              className="mobile-menu-btn"
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
          <span className="mobile-header-title">
            {currentConversation?.title || selectedAgent?.name || 'Agent Me'}
          </span>
          <div className="mobile-header-right">
            <button
              className="mobile-new-chat-btn"
              type="button"
              onClick={createNewChat}
              aria-label="New chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          </div>
        </header>
      )}

      {/* Sidebar Backdrop - For mobile overlay */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'} ${(showSettingsPage || showGalleryPage || showKnowledgeBasePage || showAdminPage || showSkillsPage) ? 'hidden' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-top-actions">
            {/* Sidebar toggle (close) */}
            <button
              className="sidebar-nav-btn sidebar-toggle-btn"
              type="button"
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar"
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </span>
            </button>

            <button className="sidebar-nav-btn" type="button" onClick={() => { createNewChat() }}>
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
              </span>
              <span className="sidebar-nav-label">New chat</span>
            </button>

            <button
              className="sidebar-nav-btn"
              type="button"
              onClick={() => {
                setSidebarChatSearchOpen((v) => !v)
                setTimeout(() => sidebarSearchInputRef.current?.focus(), 0)
              }}
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <span className="sidebar-nav-label">Search chats</span>
            </button>

            {sidebarChatSearchOpen && (
              <div className="sidebar-search-wrap">
                <input
                  ref={sidebarSearchInputRef}
                  className="sidebar-search-input"
                  type="text"
                  value={sidebarChatSearchQuery}
                  onChange={(e) => setSidebarChatSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                />
              </div>
            )}

            <button
              className="sidebar-nav-btn"
              type="button"
              onClick={() => { setShowGalleryPage(true) }}
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </span>
              <span className="sidebar-nav-label">Library</span>
            </button>
          </div>
        </div>

        {/* Scrollable sidebar content - everything below Library */}
        <div className="sidebar-content">
          {/* Navigation Items */}
          <div className="sidebar-nav-scroll">
            <button
              className="sidebar-nav-btn"
              type="button"
              onClick={() => { setShowKnowledgeBasePage(true) }}
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  <path d="M8 7h8"/>
                  <path d="M8 11h8"/>
                  <path d="M8 15h5"/>
                </svg>
              </span>
              <span className="sidebar-nav-label">Knowledge Base</span>
            </button>

            <button
              className="sidebar-nav-btn deep-research-nav-btn"
              type="button"
              onClick={() => setShowDeepResearchModal(true)}
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <path d="M11 7v4l3 2"/>
                </svg>
              </span>
              <span className="sidebar-nav-label">Deep Research</span>
              {deepResearchConversations.length > 0 && (
                <span className="sidebar-nav-badge">{deepResearchConversations.length}</span>
              )}
            </button>

            <button
              className="sidebar-nav-btn skills-nav-btn"
              type="button"
              onClick={() => { setShowSkillsPage(true); setShowKnowledgeBasePage(false); setShowSettingsPage(false); setShowGalleryPage(false); setShowAdminPage(false); setShowDeepResearchPage(false) }}
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </span>
              <span className="sidebar-nav-label">Skills</span>
              {enabledSkills.length > 0 && (
                <span className="sidebar-nav-badge">{enabledSkills.length}</span>
              )}
            </button>

            <button
              className="sidebar-nav-btn coder-nav-btn"
              type="button"
              onClick={() => window.open('https://code.agentme.app', '_blank')}
            >
              <span className="sidebar-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                  <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2"/>
                </svg>
              </span>
              <span className="sidebar-nav-label">Code</span>
            </button>
          </div>

          {/* Projects Section */}
          <div className="projects-section">
          <div className="projects-section-header">
            <span 
              className={`chats-section-chevron ${projectsExpanded ? 'expanded' : ''}`}
              onClick={() => setProjectsExpanded(v => !v)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <button
              className="projects-folder-btn"
              onClick={() => setShowCreateProjectModal(true)}
              title="Create new project"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <span 
              className="chats-section-title projects-title-clickable"
              onClick={() => setProjectsExpanded(v => !v)}
            >
              Projects
            </span>
            <span 
              className="chats-section-count"
              onClick={() => setProjectsExpanded(v => !v)}
            >
              {projects.length}
            </span>
          </div>

          {projectsExpanded && projects.length > 0 && (
            <div className="projects-list">
              {projects.map(project => {
                const projectChats = getChatsInProject(project.id)
                return (
                <div key={project.id} className="project-wrapper">
                  <div
                    className={`project-item ${selectedProjectId === project.id ? 'active' : ''}`}
                    onClick={() => setSelectedProjectId(selectedProjectId === project.id ? null : project.id)}
                  >
                    <span className={`project-chevron ${selectedProjectId === project.id ? 'expanded' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                    <div 
                      className="project-color-dot" 
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="project-name">{project.name}</span>
                    <span className="project-chat-count">
                      {project.chatIds?.length || 0}
                    </span>
                    <button
                      className="project-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete project "${project.name}"?`)) {
                          deleteProject(project.id)
                        }
                      }}
                      title="Delete project"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                  {/* Nested chats in project */}
                  {selectedProjectId === project.id && projectChats.length > 0 && (
                    <div className="project-chats-list">
                      {projectChats.map(chat => (
                        <div
                          key={chat.id}
                          className={`project-chat-item ${chat.id === activeConversation ? 'active' : ''}`}
                          onClick={() => { setActiveConversation(chat.id); setShowDeepResearchPage(false) }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                          <span className="project-chat-title">{chat.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

          {/* Chats Section */}
          <div className="chats-section">
            <div 
              className="chats-section-header"
              onClick={() => setChatsExpanded(v => !v)}
            >
              <span className={`chats-section-chevron ${chatsExpanded ? 'expanded' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
              <span className="chats-section-title">Chats</span>
              <span className="chats-section-count">{filteredConversations.length}</span>
            </div>

            {/* Conversation List */}
            {chatsExpanded && (
              <div className="conversation-list">
                {filteredConversations.map(conv => {
              const chatProject = getProjectForChat(conv.id)
              return (
                <div
                  key={conv.id}
                  className={`conversation-item ${conv.id === activeConversation ? 'active' : ''} ${chatProject ? 'in-project' : ''} ${moveToChatId === conv.id ? 'dropdown-open' : ''}`}
                  onClick={() => { setActiveConversation(conv.id); setShowDeepResearchPage(false) }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                {renamingChatId === conv.id ? (
                  <input
                    type="text"
                    className="conversation-rename-input"
                    value={renameChatTitle}
                    onChange={(e) => setRenameChatTitle(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') {
                        renameChat(conv.id, renameChatTitle)
                      } else if (e.key === 'Escape') {
                        setRenamingChatId(null)
                        setRenameChatTitle('')
                      }
                    }}
                    onBlur={() => {
                      if (renameChatTitle.trim()) {
                        renameChat(conv.id, renameChatTitle)
                      } else {
                        setRenamingChatId(null)
                        setRenameChatTitle('')
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="conversation-title">{conv.title}</span>
                )}
                {chatProject && (
                  <span 
                    className="conversation-project-badge"
                    style={{ backgroundColor: chatProject.color }}
                    title={`In project: ${chatProject.name}`}
                  />
                )}
                <div className="conversation-actions">
                  {/* Rename button */}
                  <button 
                    className="conversation-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenamingChatId(conv.id)
                      setRenameChatTitle(conv.title)
                    }}
                    title="Rename chat"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  {/* Move to project button */}
                  <button 
                    className="conversation-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMoveToChatId(moveToChatId === conv.id ? null : conv.id)
                    }}
                    title="Move to project"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>
                  {/* Delete button */}
              <button 
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteChatModal({ id: conv.id, title: conv.title || 'New chat' })
                }}
                    title="Delete chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
                </div>
                {/* Move to project dropdown */}
                {moveToChatId === conv.id && (
                  <div className="conversation-move-dropdown" onClick={(e) => e.stopPropagation()}>
                    <div className="conversation-move-header">Move to project</div>
                    {chatProject && (
                      <button 
                        className="conversation-move-option remove"
                        onClick={() => {
                          removeChatFromProject(conv.id)
                          setMoveToChatId(null)
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Remove from {chatProject.name}
                      </button>
                    )}
                    {projects.length === 0 ? (
                      <div className="conversation-move-empty">
                        No projects yet. Create one first.
                      </div>
                    ) : (
                      projects.map(project => (
                        <button
                          key={project.id}
                          className={`conversation-move-option ${chatProject?.id === project.id ? 'current' : ''}`}
                          onClick={() => {
                            addChatToProject(conv.id, project.id)
                            setMoveToChatId(null)
                          }}
                        >
                          <div 
                            className="project-color-dot" 
                            style={{ backgroundColor: project.color }}
                          />
                          {project.name}
                          {chatProject?.id === project.id && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="current-check">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
                </div>
              )
            })}

                {filteredConversations.length === 0 && (
                  <div className="conversation-empty">No chats yet</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-row">
          <div
            className="user-profile clickable"
            onClick={() => setShowProfilePage(true)}
            title="Edit profile"
          >
            <div className="user-avatar">{user.avatar}</div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email}</span>
            </div>
            </div>
            {isAdmin && (
              <button
                className="sidebar-settings-btn"
                onClick={() => setShowAdminPage(true)}
                title="Admin"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              </button>
            )}
            <button
              className="sidebar-settings-btn"
              onClick={() => { setShowSettingsPage(true) }}
              title="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        {/* Chat View */}
        <div className={`chat-view ${(showSettingsPage || showGalleryPage || showKnowledgeBasePage || showDeepResearchPage || showAdminPage || showSkillsPage) ? 'slide-out' : 'slide-in'}`}>
          {!sidebarOpen && (
          <button className="open-sidebar" onClick={() => setSidebarOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        )}

        <div className="chat-container">
          {!currentConversation || currentConversation?.messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="7" width="16" height="11" rx="3" />
                  <circle cx="9" cy="12.5" r="1.3" />
                  <circle cx="15" cy="12.5" r="1.3" />
                  <path d="M8 18v3" />
                  <path d="M16 18v3" />
                  <path d="M12 3v3" />
                  <circle cx="12" cy="3" r="1" />
                </svg>
              </div>
              <h1>How can I help you today?</h1>
              {selectedAgent && (
                <div className="active-agent-indicator">
                  <div className="active-agent-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="7" width="16" height="11" rx="3" />
                      <circle cx="9" cy="12.5" r="1.3" />
                      <circle cx="15" cy="12.5" r="1.3" />
                      <path d="M8 18v3" />
                      <path d="M16 18v3" />
                      <path d="M12 3v3" />
                      <circle cx="12" cy="3" r="1" />
                    </svg>
                  </div>
                  <div className="active-agent-info">
                    <span className="active-agent-name">{selectedAgent.name}</span>
                    <span className="active-agent-label">
                      Connected via{' '}
                      {selectedAgent.provider === 'openrouter'
                        ? 'openrouter'
                        : selectedAgent.provider === 'lmstudio'
                          ? 'lmstudio'
                          : selectedAgent.provider === 'mcp'
                            ? 'mcp'
                            : 'n8n'}
                    </span>
                  </div>
                </div>
              )}
              <div className="suggestions">
                <button onClick={() => { chatInputRef.current?.setValue("Explain quantum computing in simple terms"); chatInputRef.current?.focus() }}>
                  Explain quantum computing in simple terms
                </button>
                <button onClick={() => { chatInputRef.current?.setValue("Write a creative story about a robot"); chatInputRef.current?.focus() }}>
                  Write a creative story about a robot
                </button>
                <button onClick={() => { chatInputRef.current?.setValue("Help me debug my code"); chatInputRef.current?.focus() }}>
                  Help me debug my code
                </button>
                <button onClick={() => { chatInputRef.current?.setValue("What are some healthy recipes?"); chatInputRef.current?.focus() }}>
                  What are some healthy recipes?
                </button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {currentConversation?.messages.map(message => (
                <div
                  key={message.id}
                  className={`message ${message.role}${message.id === newlyGeneratedMessageId ? ' new-message' : ''}`}
                  data-conversation-id={activeConversation}
                >
                  {message.role === 'assistant' && (
                    <div className="message-avatar">
                      {selectedAgent ? (
                        <div className="agent-avatar">
                          {selectedAgent.name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                      ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="assistant-avatar">
                        <rect x="4" y="7" width="16" height="11" rx="3" />
                        <circle cx="9" cy="12.5" r="1.3" />
                        <circle cx="15" cy="12.5" r="1.3" />
                        <path d="M8 18v3" />
                        <path d="M16 18v3" />
                        <path d="M12 3v3" />
                        <circle cx="12" cy="3" r="1" />
                      </svg>
                      )}
                    </div>
                  )}
                  <div className="message-content">
                    {message.role === 'user' && (
                      <div className="user-message-wrapper">
                        {/* Show attached files */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="message-attachments">
                            {message.attachments.map((file, idx) => (
                              <div key={idx} className="message-attachment-item">
                                {file.type?.startsWith('image/') && (file.url || file.preview) ? (
                                  <img 
                                    src={file.url || file.preview} 
                                    alt={file.name} 
                                    className="message-attachment-image"
                                    onClick={() => {
                                      const src = file.url || file.preview
                                      if (src) window.open(src, '_blank')
                                    }}
                                  />
                                ) : (
                                  <div className="message-attachment-file">
                                    <div className={`attachment-file-icon ${file.type?.startsWith('image/') ? 'image-icon' : ''}`}>
                                      {file.type?.startsWith('image/') ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                                          <circle cx="8.5" cy="8.5" r="1.5"/>
                                          <path d="m21 15-5-5L5 21"/>
                                        </svg>
                                      ) : (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                          <polyline points="14 2 14 8 20 8"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div className="attachment-file-info">
                                      <span className="attachment-file-name">{file.name}</span>
                                      <span className="attachment-file-size">
                                        {file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      <div className="user-message-bubble">
                        <span className="user-message-text">{message.content}</span>
                        </div>
                      </div>
                    )}
                    {message.role === 'assistant' && (
                      <>
                        <div className="message-role">{selectedAgent?.name || 'Agent Me'}</div>
                        {message.content?.type === 'search' ? (
                          <div 
                            className="message-text search-message"
                            dangerouslySetInnerHTML={{ __html: buildSearchMessageHtml(message.content) }}
                          />
                        ) : (
                          <div 
                            className="message-text formatted-response"
                            dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
                          />
                        )}
                        <div className="message-actions">
                          <button 
                            className={`message-action-btn ${copiedMessageId === message.id ? 'active' : ''}`}
                            title="Copy"
                            onClick={() => handleCopy(message.content?.type === 'search' ? message.content.query : message.content, message.id)}
                          >
                            {copiedMessageId === message.id ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            )}
                          </button>
                          <button 
                            type="button"
                            className={`message-action-btn ${reactions[message.id] === 'liked' ? 'active liked' : ''}`}
                            title="Good response"
                            onPointerDown={(e) => {
                              e.preventDefault()
                              handleReaction(message.id, 'liked')
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill={reactions[message.id] === 'liked' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                            </svg>
                          </button>
                          <button 
                            type="button"
                            className={`message-action-btn ${reactions[message.id] === 'disliked' ? 'active disliked' : ''}`}
                            title="Bad response"
                            onPointerDown={(e) => {
                              e.preventDefault()
                              handleReaction(message.id, 'disliked')
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill={reactions[message.id] === 'disliked' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                            </svg>
                          </button>
                          <button 
                            className="message-action-btn" 
                            title="Share"
                            onClick={() => handleShare(message.content?.type === 'search' ? `Search results for: ${message.content.query}` : message.content)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="17 8 12 3 7 8"></polyline>
                              <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                          </button>
                          <button 
                            className="message-action-btn" 
                            title="Regenerate"
                            onClick={() => handleRegenerate(message.id)}
                            disabled={isTyping}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 4v6h-6"></path>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                          </button>
                          <button className="message-action-btn" title="More options">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="1"></circle>
                              <circle cx="19" cy="12" r="1"></circle>
                              <circle cx="5" cy="12" r="1"></circle>
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {/* Only show the global typing indicator if we are not already showing the in-message placeholder */}
              {isTyping && (
                <div className="message assistant">
                  <div className="message-avatar">
                    {selectedAgent ? (
                      <div className="agent-avatar">
                        {selectedAgent.name?.charAt(0)?.toUpperCase() || 'A'}
                      </div>
                    ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="assistant-avatar">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729z"/>
                    </svg>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-role">{selectedAgent?.name || 'Agent Me'}</div>
                    <div className="typing-status">
                      {typingStatus === 'image' && 'Generating image...'}
                      {typingStatus === 'searching' && 'Searching the web...'}
                      {typingStatus === 'generating' && 'Generating response...'}
                      {!typingStatus && 'Thinking...'}
                    </div>
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div 
            className={`input-area ${isDraggingOnInput ? 'dragging' : ''}`}
            onDragOver={handleInputDragOver}
            onDragLeave={handleInputDragLeave}
            onDrop={handleInputDrop}
          >
            {isDraggingOnInput && (
              <div className="input-drop-overlay">
                <div className="drop-indicator">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span>Drop files here</span>
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="input-form">
              <div className="input-wrapper">
                {/* Attached Files Preview */}
                {attachedFiles.length > 0 && (
                  <div className={`attached-files ${attachmentsUploading ? 'uploading' : ''}`}>
                    {attachmentsUploading && (
                      <div className="attached-files-uploading">
                        <div className="upload-spinner"></div>
                        <span>Processing files...</span>
                      </div>
                    )}
                    {attachedFiles.map(file => (
                      <div key={file.id} className="attached-file">
                        {file.preview ? (
                          <img src={file.preview} alt={file.name} className="file-preview-image" />
                        ) : (
                          <div className={`file-icon ${getFileIcon(file.type)}`}>
                            {getFileIcon(file.type) === 'pdf' && (
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                                <path d="M14 2v6h6"/>
                              </svg>
                            )}
                            {getFileIcon(file.type) === 'image' && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="m21 15-5-5L5 21"/>
                              </svg>
                            )}
                            {getFileIcon(file.type) === 'file' && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                            )}
                            {getFileIcon(file.type) === 'code' && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="16 18 22 12 16 6"/>
                                <polyline points="8 6 2 12 8 18"/>
                              </svg>
                            )}
                            {(getFileIcon(file.type) === 'doc' || getFileIcon(file.type) === 'sheet' || getFileIcon(file.type) === 'presentation') && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                              </svg>
                            )}
                          </div>
                        )}
                        <div className="file-info">
                          <span className="file-name">{file.name}</span>
                          <span className="file-size">
                            {attachmentProgress[file.id] !== undefined && attachmentProgress[file.id] < 100
                              ? `Uploading ${attachmentProgress[file.id]}%`
                              : formatFileSize(file.size)
                            }
                          </span>
                        </div>
                        {attachmentProgress[file.id] !== undefined && attachmentProgress[file.id] < 100 && (
                          <div className="file-progress-bar">
                            <div 
                              className="file-progress-fill" 
                              style={{ width: `${attachmentProgress[file.id]}%` }}
                            />
                          </div>
                        )}
                        <button 
                          type="button" 
                          className="remove-file-btn"
                          onClick={() => removeAttachedFile(file.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <ChatTextarea
                  ref={chatInputRef}
                  onSubmit={(msg) => handleSubmit(null, msg)}
                  onHistoryNav={setInputHistoryIndex}
                  placeholder="Reply..."
                  disabled={isTyping}
                  userMessages={userMessagesForHistory}
                />
                <div className="input-bottom-bar">
                  <div className="input-actions-left">
                    <button 
                      type="button" 
                      className="action-btn"
                      onClick={() => {
                        setUploadModalTarget('chat')
                        setShowUploadModal(true)
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </button>
                    <button type="button" className="action-btn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6"></path>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                      </svg>
                    </button>
                    <div className="tools-menu-wrapper" ref={toolsMenuRef}>
                      <button
                        type="button"
                        className={`action-btn ${showToolsMenu ? 'active' : ''}`}
                        onClick={() => setShowToolsMenu((v) => !v)}
                        title="Tools"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4.5 4.5 0 0 0 5.4-5.4z"/>
                          <path d="M8 13l3 3"/>
                        </svg>
                      </button>
                      {showToolsMenu && (
                        <div className="tools-menu">
                          <div className="tools-menu-section">
                            <div className="tools-menu-title">Actions</div>
                            <button
                              type="button"
                              onClick={captureScreenshotForChat}
                              disabled={isCapturingScreenshot}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="M21 15l-5-5L5 21"/>
                              </svg>
                              {isCapturingScreenshot ? 'Capturing...' : 'Screenshot'}
                            </button>
                          </div>
                          {/* Connected Skills */}
                          {availableSkills.filter(s => skillTokens[s.tokenKey]).length > 0 && (
                            <div className="tools-menu-section">
                              <div className="tools-menu-title">Skills</div>
                              {availableSkills.filter(s => skillTokens[s.tokenKey]).map(skill => {
                                const isActive = enabledSkills.includes(skill.id)
                                return (
                                  <button
                                    key={skill.id}
                                    type="button"
                                    className={`tools-skill-btn ${isActive ? 'active' : ''}`}
                                    onClick={() => toggleSkill(skill.id)}
                                  >
                                    {skill.icon === 'github' && (
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                      </svg>
                                    )}
                                    {skill.icon === 'vercel' && (
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M24 22.525H0l12-21.05 12 21.05z"/>
                                      </svg>
                                    )}
                                    {skill.icon === 'figma' && (
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491z"/>
                                      </svg>
                                    )}
                                    {skill.icon === 'notion' && (
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.373.466z"/>
                                      </svg>
                                    )}
                                    {skill.icon === 'linear' && (
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 1a11 11 0 100 22 11 11 0 000-22z"/>
                                      </svg>
                                    )}
                                    {skill.icon === 'sora' && (
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="12" r="10"/>
                                      </svg>
                                    )}
                                    <span>{skill.name}</span>
                                    <span className={`tools-skill-status ${isActive ? 'on' : 'off'}`}>
                                      {isActive ? 'ON' : 'OFF'}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          <div className="tools-menu-footer">
                            <button type="button" onClick={() => { setShowSkillsPage(true); setShowKnowledgeBasePage(false); setShowSettingsPage(false); setShowGalleryPage(false); setShowAdminPage(false); setShowDeepResearchPage(false); setShowToolsMenu(false) }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                              </svg>
                              Manage Skills
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="input-actions-right">
                    <div className="model-selector-container">
                      <div 
                        className="model-selector"
                        onClick={() => setShowAgentSelector(!showAgentSelector)}
                      >
                        <span className="model-name">
                          {selectedAgent ? selectedAgent.name : 'Select Agent'}
                        </span>
                        {selectedAgent && (
                          <span className={`model-badge agent ${selectedAgent.provider}`}>
                            {selectedAgent.provider === 'openrouter'
                              ? 'openrouter'
                              : selectedAgent.provider === 'lmstudio'
                                ? 'lmstudio'
                                : selectedAgent.provider === 'mcp'
                                  ? 'mcp'
                                  : 'n8n'}
                          </span>
                        )}
                        <svg className="dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      {showAgentSelector && (
                        <div className="model-dropdown">
                          {allAgents.map(agent => (
                            <button 
                              key={agent.id}
                              className={`model-option ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedAgent(agent)
                                setShowAgentSelector(false)
                              }}
                            >
                              <span className="model-option-name">{agent.name}</span>
                              <span className="model-option-badge">
                                {agent.provider === 'openrouter'
                                  ? 'openrouter'
                                  : agent.provider === 'lmstudio'
                                    ? 'lmstudio'
                                    : agent.provider === 'mcp'
                                      ? 'mcp'
                                      : 'n8n'}
                              </span>
                            </button>
                          ))}
                          {allAgents.length === 0 && (
                            <div className="model-option-empty">
                              No agents added yet. Go to Settings to add agents.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button 
                      type={isTyping ? 'button' : 'submit'}
                      onClick={isTyping ? stopGenerating : undefined}
                      disabled={attachmentsUploading}
                      className={`send-btn ${attachmentsUploading ? 'uploading' : ''} ${isTyping ? 'stop' : ''}`}
                      title={
                        attachmentsUploading
                          ? 'Uploading files...'
                          : isTyping
                            ? 'Stop generating'
                            : 'Send message'
                      }
                    >
                      {attachmentsUploading ? (
                        <div className="upload-spinner"></div>
                      ) : isTyping ? (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <rect x="7" y="7" width="10" height="10" rx="2"></rect>
                        </svg>
                      ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                      </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
            <p className="disclaimer">AI can make mistakes. Please double-check responses.</p>
          </div>
        </div>
        </div>

        {/* Settings Page */}
        <div className={`settings-page ${showSettingsPage ? 'slide-in' : 'slide-out'}`}>
          <div className="settings-page-header">
            <button 
              className="settings-back-btn"
              onClick={() => setShowSettingsPage(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5"/>
                <path d="M12 19l-7-7 7-7"/>
              </svg>
              Back to Chat
            </button>
            <h1>Settings</h1>
          </div>

          <div className="settings-page-content">
            <div className="settings-tabs">
              <button
                className={`settings-tab ${settingsTab === 'n8n' ? 'active' : ''}`}
                onClick={() => setSettingsTab('n8n')}
              >
                n8n Agents
              </button>
              <button
                className={`settings-tab ${settingsTab === 'openrouter' ? 'active' : ''}`}
                onClick={() => setSettingsTab('openrouter')}
              >
                OpenRouter
              </button>
              <button
                className={`settings-tab ${settingsTab === 'lmstudio' ? 'active' : ''}`}
                onClick={() => setSettingsTab('lmstudio')}
              >
                LM Studio
              </button>
              <button
                className={`settings-tab ${settingsTab === 'embeddings' ? 'active' : ''}`}
                onClick={() => setSettingsTab('embeddings')}
              >
                Embeddings
              </button>
              <button
                className={`settings-tab ${settingsTab === 'ocr' ? 'active' : ''}`}
                onClick={() => setSettingsTab('ocr')}
              >
                OCR
              </button>
              <button
                className={`settings-tab ${settingsTab === 'images' ? 'active' : ''}`}
                onClick={() => setSettingsTab('images')}
              >
                Images
              </button>
              <button
                className={`settings-tab ${settingsTab === 'mcp' ? 'active' : ''}`}
                onClick={() => setSettingsTab('mcp')}
              >
                MCP Servers
              </button>
              <button
                className={`settings-tab ${settingsTab === 'deepsearch' ? 'active' : ''}`}
                onClick={() => setSettingsTab('deepsearch')}
              >
                Deep Search
              </button>
            </div>

            {settingsTab === 'n8n' && (
              <div className="settings-tab-panel">
             {/* Manual Agent Add */}
             <section className="settings-page-section">
               <div className="settings-page-section-header">
                 <h2>Manually Add Agent</h2>
                 <button 
                   className="settings-toggle-form-btn"
                   onClick={() => setShowAddAgentForm(!showAddAgentForm)}
                 >
                   {showAddAgentForm ? 'Hide' : 'Show Form'}
                   <svg 
                     className={`settings-chevron ${showAddAgentForm ? 'open' : ''}`}
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   >
                     <polyline points="6 9 12 15 18 9"></polyline>
                   </svg>
                 </button>
               </div>
               {showAddAgentForm && (
                 <div className="settings-add-agent-form">
                   <div className="settings-form-header">
                     <h4>{editingAgent ? 'Edit Agent' : 'New Agent'}</h4>
                     <button 
                       className="settings-form-close"
                       onClick={() => {
                         setShowAddAgentForm(false)
                         setEditingAgent(null)
                         setNewAgent({ name: '', description: '', tags: '', webhookUrl: '', systemPrompt: '' })
                       }}
                     >
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                         <line x1="18" y1="6" x2="6" y2="18"/>
                         <line x1="6" y1="6" x2="18" y2="18"/>
                       </svg>
                     </button>
                   </div>
                   <div className="settings-form-row">
                     <label htmlFor="agent-name">Agent Name *</label>
                     <input
                       id="agent-name"
                       type="text"
                       value={newAgent.name}
                       onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                       placeholder="e.g., Customer Support Bot"
                     />
                   </div>
                   <div className="settings-form-row">
                     <label htmlFor="agent-description">Description</label>
                     <textarea
                       id="agent-description"
                       value={newAgent.description}
                       onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
                       placeholder="What does this agent do?"
                       rows={3}
                     />
                   </div>
                  <div className="settings-form-row">
                    <label htmlFor="agent-tags">Tags (comma separated)</label>
                    <input
                      id="agent-tags"
                      type="text"
                      value={newAgent.tags}
                      onChange={(e) => setNewAgent({ ...newAgent, tags: e.target.value })}
                      placeholder="e.g., support, sales, help"
                    />
                  </div>
                  <div className="settings-form-row">
                    <label htmlFor="agent-webhook">n8n Workflow Webhook URL</label>
                    <input
                      id="agent-webhook"
                      type="url"
                      value={newAgent.webhookUrl}
                      onChange={(e) => setNewAgent({ ...newAgent, webhookUrl: e.target.value })}
                      placeholder="https://your-n8n-instance.com/webhook/agent-trigger"
                    />
                    <span className="settings-form-hint">The webhook URL to trigger this agent's n8n workflow</span>
                  </div>
                  <div className="settings-form-row">
                    <label htmlFor="agent-system-prompt">System Prompt</label>
                    <textarea
                      id="agent-system-prompt"
                      value={newAgent.systemPrompt}
                      onChange={(e) => setNewAgent({ ...newAgent, systemPrompt: e.target.value })}
                      placeholder="You are a helpful assistant that..."
                      rows={5}
                      className="system-prompt-textarea"
                    />
                    <span className="settings-form-hint">The system instructions that define how this agent behaves</span>
                  </div>
                  <div className="settings-form-actions">
                    <button 
                      className="settings-cancel-btn"
                      onClick={() => {
                        setShowAddAgentForm(false)
                        setEditingAgent(null)
                        setNewAgent({ name: '', description: '', tags: '', webhookUrl: '', systemPrompt: '' })
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      className="settings-add-agent-btn"
                      onClick={editingAgent ? handleUpdateAgent : handleAddAgent}
                      disabled={!newAgent.name.trim()}
                    >
                       {editingAgent ? (
                         <>
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                             <polyline points="20 6 9 17 4 12"/>
                           </svg>
                           Save Changes
                         </>
                       ) : (
                         <>
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                             <line x1="12" y1="5" x2="12" y2="19"/>
                             <line x1="5" y1="12" x2="19" y2="12"/>
                           </svg>
                           Add Agent
                         </>
                       )}
                     </button>
                  </div>
                 </div>
               )}
             </section>

             {/* Search Configuration */}
             <section className="settings-page-section">
               <h2>Search Configuration</h2>
               <p className="settings-page-description">
                 Configure your default search engine for web searches (SearXNG)
               </p>
               <div className="settings-input-group">
                 <label htmlFor="search-url">Search Engine URL</label>
                 <input
                   id="search-url"
                   type="url"
                   value={searchUrl}
                   onChange={(e) => setSearchUrl(e.target.value)}
                   placeholder="https://search.brainstormnodes.org/"
                 />
                 <div className="settings-button-row">
                  <button 
                    className="settings-test-btn"
                    onClick={handleSearchConnectionCheck}
                    disabled={checkingSearch}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    {checkingSearch ? 'Checking...' : 'Check Connection'}
                  </button>
                   <button 
                     className="settings-test-btn"
                     onClick={() => handleSearch('test query')}
                   >
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                       <circle cx="11" cy="11" r="8"/>
                       <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                     </svg>
                     Test Search
                   </button>
                   <button 
                     className="settings-clear-btn"
                     onClick={() => {
                       setSearchUrl('https://search.brainstormnodes.org/')
                       showToast('Search URL reset to default')
                     }}
                   >
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                       <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                       <path d="M3 3v5h5"/>
                     </svg>
                     Reset
                   </button>
                 </div>
                 <div className="settings-help-text">
                   <strong>SearXNG Search:</strong><br/>
                   Your private, self-hosted metasearch engine. Click the search button in chat
                  to search the web using your SearXNG instance.
                  {searchUrl && (
                    <>
                      <br/>
                      <span className="settings-muted">
                        Example endpoint: {buildSearchApiUrl(searchUrl, 'hello world')}
                      </span>
                    </>
                  )}
                 </div>
                {searchConnection.state !== 'idle' && (
                  <div className="settings-help-text">
                    <strong>Connection status:</strong> {searchConnection.message}
                  </div>
                )}
               </div>
             </section>

              {/* Webhook Status */}
              {n8nWebhookUrl && (
                <section className="settings-page-section">
                  <div className="settings-page-section-header">
                    <h2>Webhook Configuration</h2>
                  </div>
                  <div className="webhook-status">
                    <div className="webhook-status-info">
                      <div className="webhook-status-icon connected">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                          <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                      </div>
                      <div className="webhook-status-details">
                        <span className="webhook-status-title">Webhook Configured</span>
                        <span className="webhook-status-url">{n8nWebhookUrl}</span>
                      </div>
                    </div>
                    <button 
                      className="webhook-clear-btn"
                      onClick={() => {
                        setN8nWebhookUrl('')
                        setAgents([])
                        setSelectedAgent(null)
                        setWebhookError('')
                        showToast('Webhook URL cleared')
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      Clear
                    </button>
                  </div>
                </section>
              )}

             {/* Imported Agents List */}
            {agents.length > 0 && (
              <section className="settings-page-section">
                <div className="settings-page-section-header">
                  <h2>Imported Agents</h2>
                  <span className="agents-count">{agents.length} agent{agents.length > 1 ? 's' : ''}</span>
                </div>
                <div className="agents-list">
                  {agents.map(agent => (
                    <div key={agent.id} className="agent-card">
                      <div className="agent-info">
                        <div className="agent-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                        </div>
                        <div className="agent-details">
                          <h3 className="agent-name">{agent.name || 'Untitled Agent'}</h3>
                          <p className="agent-description">{agent.description || 'No description'}</p>
                          {agent.tags && agent.tags.length > 0 && (
                            <div className="agent-tags">
                              {agent.tags.map((tag, idx) => (
                                <span key={idx} className="agent-tag">{tag}</span>
                              ))}
                            </div>
                          )}
                          {agent.webhookUrl && (
                            <div className="agent-webhook-url">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                              </svg>
                              <span className="webhook-url-text">{agent.webhookUrl}</span>
                            </div>
                          )}
                          {agent.systemPrompt && (
                            <div className="agent-system-prompt-preview">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                              </svg>
                              <span className="system-prompt-text">
                                {agent.systemPrompt.length > 100 
                                  ? agent.systemPrompt.substring(0, 100) + '...' 
                                  : agent.systemPrompt}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="agent-actions">
                        <button 
                          className="agent-action-btn"
                          onClick={() => {
                            setSelectedAgent(agent)
                            showToast(`Now chatting with ${agent.name}`)
                            setShowSettingsPage(false)
                          }}
                          title="Use Agent"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                          </svg>
                        </button>
                        <button 
                          className="agent-action-btn"
                          onClick={() => handleTestAgent(agent.id)}
                          title="Test Agent"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                        </button>
                        <button 
                          className="agent-action-btn agent-edit-btn"
                          onClick={() => handleEditAgent(agent)}
                          title="Edit Agent"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button 
                          className="agent-action-btn agent-delete-btn"
                          onClick={() => handleDeleteAgent(agent.id)}
                          title="Delete Agent"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
              </div>
            )}

            {settingsTab === 'openrouter' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>OpenRouter Agents</h2>
                  <p className="settings-page-description">
                    Create agents powered by OpenRouter models. These agents can use your Supabase chat history, memories, and document chunks.
                  </p>
                  <div className="settings-input-group">
                    <label htmlFor="openrouter-key">OpenRouter API Key</label>
                    <input
                      id="openrouter-key"
                      type="password"
                      value={openRouterApiKey}
                      onChange={(e) => setOpenRouterApiKey(e.target.value)}
                      placeholder="sk-or-..."
                    />
                    <div className="openrouter-connect-row">
                      <div className={`openrouter-status ${openRouterConnectState}`}>
                        <span className="openrouter-status-dot" />
                        <span className="openrouter-status-text">
                          {openRouterConnectState === 'connected'
                            ? `Connected • ${openRouterModels.length} models`
                            : openRouterConnectState === 'connecting'
                              ? 'Connecting...'
                              : openRouterConnectState === 'error'
                                ? 'Error'
                                : 'Disconnected'}
                        </span>
                      </div>
                      <div className="openrouter-connect-actions">
                        <button
                          className="settings-test-btn"
                          type="button"
                          onClick={connectOpenRouter}
                          disabled={openRouterConnectState === 'connecting' || !openRouterApiKey.trim()}
                          title="Validate key + load models"
                        >
                          {openRouterConnectState === 'connecting' ? 'Connecting...' : 'Connect'}
                        </button>
                        {openRouterConnectState === 'connected' && (
                          <button className="settings-clear-error-btn" type="button" onClick={disconnectOpenRouter}>
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                    {openRouterConnectError && (
                      <div className="settings-error-message" style={{ marginTop: 12 }}>
                        {openRouterConnectError}
                      </div>
                    )}
                    <div className="settings-help-text">
                      <strong>Security:</strong><br/>
                      This key is stored locally in your browser only (localStorage). It is not saved to Supabase.
                    </div>
                  </div>
                </section>

                <section className="settings-page-section">
                  <h2>Create OpenRouter Agent</h2>
                  <div className="settings-add-agent-form">
                    <div className="settings-form-row">
                      <label>Agent Name *</label>
                      <input
                        type="text"
                        value={newOpenRouterAgent.name}
                        onChange={(e) => setNewOpenRouterAgent({ ...newOpenRouterAgent, name: e.target.value })}
                        placeholder="e.g., Research Assistant"
                      />
                    </div>
                    <div className="settings-form-row">
                      <label>Model *</label>
                      {openRouterModels.length > 0 ? (
                        <>
                          <input
                            type="text"
                            value={openRouterModelFilter}
                            onChange={(e) => setOpenRouterModelFilter(e.target.value)}
                            placeholder="Search models (case-sensitive)..."
                          />
                          <select
                            value={newOpenRouterAgent.model}
                            onChange={(e) => setNewOpenRouterAgent({ ...newOpenRouterAgent, model: e.target.value })}
                          >
                            {filteredOpenRouterModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.id}
                              </option>
                            ))}
                          </select>
                          <span className="settings-form-hint">
                            Loaded from OpenRouter. Pick a model id (example: <code>openai/gpt-4o-mini</code>).
                          </span>
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={newOpenRouterAgent.model}
                            onChange={(e) => setNewOpenRouterAgent({ ...newOpenRouterAgent, model: e.target.value })}
                            placeholder="e.g., openai/gpt-4o-mini"
                          />
                          <span className="settings-form-hint">Click “Connect” above to load all available models.</span>
                        </>
                      )}
                    </div>
                    <div className="settings-form-row">
                      <label>System Prompt</label>
                      <textarea
                        value={newOpenRouterAgent.systemPrompt}
                        onChange={(e) => setNewOpenRouterAgent({ ...newOpenRouterAgent, systemPrompt: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="settings-form-row">
                      <label>Temperature</label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={newOpenRouterAgent.temperature}
                        onChange={(e) => setNewOpenRouterAgent({ ...newOpenRouterAgent, temperature: e.target.value })}
                      />
                    </div>
                    <div className="settings-form-actions">
                      {editingOpenRouterAgent && (
                        <button
                          className="settings-cancel-btn"
                          onClick={handleCancelEditOpenRouterAgent}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className="settings-add-agent-btn"
                        onClick={editingOpenRouterAgent ? handleUpdateOpenRouterAgent : handleAddOpenRouterAgent}
                        disabled={!newOpenRouterAgent.name.trim() || !newOpenRouterAgent.model.trim()}
                      >
                        {editingOpenRouterAgent ? 'Update Agent' : 'Add OpenRouter Agent'}
                      </button>
                    </div>
                  </div>
                </section>

                {openRouterAgents.length > 0 && (
                  <section className="settings-page-section">
                    <div className="settings-page-section-header">
                      <h2>OpenRouter Agents</h2>
                      <span className="agents-count">{openRouterAgents.length} agent{openRouterAgents.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="agents-list">
                      {openRouterAgents.map(agent => (
                        <div key={agent.id} className="agent-card">
                          <div className="agent-info">
                            <div className="agent-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                                <path d="M8 12h8"/>
                              </svg>
                            </div>
                            <div className="agent-details">
                              <h3 className="agent-name">{agent.name}</h3>
                              <p className="agent-description">{agent.model}</p>
                            </div>
                          </div>
                          <div className="agent-actions">
                            <button
                              className="agent-action-btn"
                              onClick={() => {
                                setSelectedAgent(agent)
                                showToast(`Now chatting with ${agent.name}`)
                                setShowSettingsPage(false)
                              }}
                              title="Use Agent"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                              </svg>
                            </button>
                            <button
                              className="agent-action-btn"
                              onClick={() => handleEditOpenRouterAgent(agent)}
                              title="Edit Agent"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button
                              className="agent-action-btn agent-delete-btn"
                              onClick={() => handleDeleteOpenRouterAgent(agent.id)}
                              title="Delete Agent"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
              </section>
                )}
              </div>
            )}

            {settingsTab === 'lmstudio' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>LM Studio (OpenAI-compatible)</h2>
                  <p className="settings-page-description">
                    Connect to your local LM Studio server and import your local models as chat agents.
                    In LM Studio, start the <strong>OpenAI Compatible Server</strong> first.
                  </p>
                  <div className="settings-input-group">
                    <label htmlFor="lmstudio-url">Base URL</label>
                    <input
                      id="lmstudio-url"
                      type="text"
                      value={lmStudioBaseUrl}
                      onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                      placeholder="http://localhost:1234/v1"
                    />
                    <span className="settings-form-hint">
                      Example: <code>http://localhost:1234/v1</code> (this app will call <code>/models</code> and <code>/chat/completions</code>).
                    </span>

                    <label htmlFor="lmstudio-key" style={{ marginTop: 12 }}>API Key (optional)</label>
                    <input
                      id="lmstudio-key"
                      type="password"
                      value={lmStudioApiKey}
                      onChange={(e) => setLmStudioApiKey(e.target.value)}
                      placeholder="(leave blank if not required)"
                    />

                    <div className="openrouter-connect-row" style={{ marginTop: 12 }}>
                      <div className={`openrouter-status ${lmStudioConnectState}`}>
                        <span className="openrouter-status-dot" />
                        <span className="openrouter-status-text">
                          {lmStudioConnectState === 'connected'
                            ? `Connected • ${lmStudioModels.length} models`
                            : lmStudioConnectState === 'connecting'
                              ? 'Connecting...'
                              : lmStudioConnectState === 'error'
                                ? 'Error'
                                : 'Disconnected'}
                        </span>
                      </div>
                      <div className="openrouter-connect-actions">
                        <button
                          className="settings-test-btn"
                          type="button"
                          onClick={connectLmStudio}
                          disabled={lmStudioConnectState === 'connecting' || !lmStudioBaseUrl.trim()}
                          title="Load /models + run a tiny chat test"
                        >
                          {lmStudioConnectState === 'connecting' ? 'Connecting...' : 'Connect'}
                        </button>
                        {lmStudioConnectState === 'connected' && (
                          <button className="settings-clear-error-btn" type="button" onClick={disconnectLmStudio}>
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>

                    {lmStudioConnectError && (
                      <div className="settings-error-message" style={{ marginTop: 12 }}>
                        {lmStudioConnectError}
                      </div>
                    )}
                    <div className="settings-help-text">
                      <strong>Security:</strong><br/>
                      This endpoint + optional key are stored locally in your browser only (localStorage).
                    </div>
                  </div>
                </section>

                <section className="settings-page-section">
                  <h2>Import Local Models</h2>
                  <p className="settings-page-description">
                    Pick a model from <code>/models</code> and add it as an agent.
                  </p>
                  <div className="settings-add-agent-form">
                    <div className="settings-form-row">
                      <label>Agent Name (optional)</label>
                      <input
                        type="text"
                        value={newLmStudioAgent.name}
                        onChange={(e) => setNewLmStudioAgent({ ...newLmStudioAgent, name: e.target.value })}
                        placeholder="e.g., Local Code Assistant"
                      />
                    </div>
                    <div className="settings-form-row">
                      <label>Model *</label>
                      {lmStudioModels.length > 0 ? (
                        <>
                          <input
                            type="text"
                            value={lmStudioModelFilter}
                            onChange={(e) => setLmStudioModelFilter(e.target.value)}
                            placeholder="Search models..."
                          />
                          <select
                            value={newLmStudioAgent.model}
                            onChange={(e) => setNewLmStudioAgent({ ...newLmStudioAgent, model: e.target.value })}
                          >
                            <option value="">Select a model…</option>
                            {filteredLmStudioModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.id}
                              </option>
                            ))}
                          </select>
                          <span className="settings-form-hint">
                            Click “Connect” above if the list is empty.
                          </span>
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={newLmStudioAgent.model}
                            onChange={(e) => setNewLmStudioAgent({ ...newLmStudioAgent, model: e.target.value })}
                            placeholder="Model id from /models"
                          />
                          <span className="settings-form-hint">Click “Connect” above to load models automatically.</span>
                        </>
                      )}
                    </div>
                    <div className="settings-form-row">
                      <label>System Prompt</label>
                      <textarea
                        value={newLmStudioAgent.systemPrompt}
                        onChange={(e) => setNewLmStudioAgent({ ...newLmStudioAgent, systemPrompt: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="settings-form-row">
                      <label className="settings-checkbox">
                        <input
                          type="checkbox"
                          checked={!!newLmStudioAgent.uncensored}
                          onChange={(e) => setNewLmStudioAgent({ ...newLmStudioAgent, uncensored: e.target.checked })}
                        />
                        Uncensored mode (no safety refusals)
                      </label>
                      <span className="settings-form-hint">
                        Forces the LM Studio agent to avoid safety refusals.
                      </span>
                    </div>
                    <div className="settings-form-row">
                      <label>Temperature</label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={newLmStudioAgent.temperature}
                        onChange={(e) => setNewLmStudioAgent({ ...newLmStudioAgent, temperature: e.target.value })}
                      />
                    </div>
                    <button
                      className="settings-add-agent-btn"
                      type="button"
                      onClick={() => addLmStudioModelAsAgent((newLmStudioAgent.model || '').trim())}
                      disabled={!String(newLmStudioAgent.model || '').trim()}
                    >
                      Add LM Studio Agent
                    </button>
                  </div>
                </section>

                {lmStudioAgents.length > 0 && (
                  <section className="settings-page-section">
                    <div className="settings-page-section-header">
                      <h2>LM Studio Agents</h2>
                      <span className="agents-count">{lmStudioAgents.length} agent{lmStudioAgents.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="agents-list">
                      {lmStudioAgents.map(agent => (
                        <div key={agent.id} className="agent-card">
                          <div className="agent-info">
                            <div className="agent-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16v16H4z"/>
                                <path d="M8 8h8M8 12h6M8 16h4"/>
                              </svg>
                            </div>
                            <div className="agent-details">
                              <h3 className="agent-name">{agent.name}</h3>
                              <p className="agent-description">{agent.model}</p>
                            </div>
                          </div>
                          <div className="agent-actions">
                            <button
                              className="agent-action-btn"
                              onClick={() => {
                                setSelectedAgent(agent)
                                showToast(`Now chatting with ${agent.name}`)
                                setShowSettingsPage(false)
                              }}
                              title="Use Agent"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                              </svg>
                            </button>
                          <button
                            className={`agent-action-btn ${agent.uncensored ? 'active' : ''}`}
                            onClick={() => {
                              setLmStudioAgents((prev) => prev.map((a) =>
                                a.id === agent.id ? { ...a, uncensored: !a.uncensored } : a
                              ))
                              showToast(`Uncensored ${agent.uncensored ? 'disabled' : 'enabled'} for ${agent.name}`)
                            }}
                            title="Toggle uncensored mode"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2a7 7 0 0 0-7 7v3"/>
                              <rect x="7" y="12" width="10" height="8" rx="2"/>
                              <path d="M12 16v2"/>
                            </svg>
                          </button>
                            <button
                              className="agent-action-btn agent-delete-btn"
                              onClick={() => handleDeleteLmStudioAgent(agent.id)}
                              title="Delete Agent"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
              </section>
                )}
              </div>
            )}

            {settingsTab === 'embeddings' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>Embeddings</h2>
                  <p className="settings-page-description">
                    Configure OpenAI embeddings (<code>{OPENAI_EMBEDDINGS_MODEL}</code>) and bulk-upload text documents into your Supabase RAG tables.
                  </p>
                  <div className="settings-input-group">
                    <label htmlFor="openai-key">OpenAI API Key</label>
                    <input
                      id="openai-key"
                      type="password"
                      value={openAiApiKey}
                      onChange={(e) => setOpenAiApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                    <div className="openrouter-connect-row">
                      <div className={`openrouter-status ${openAiConnectState}`}>
                        <span className="openrouter-status-dot" />
                        <span className="openrouter-status-text">
                          {openAiConnectState === 'connected'
                            ? 'Connected'
                            : openAiConnectState === 'connecting'
                              ? 'Connecting...'
                              : openAiConnectState === 'error'
                                ? 'Error'
                                : 'Disconnected'}
                        </span>
                      </div>
                      <div className="openrouter-connect-actions">
                        <button
                          className="settings-test-btn"
                          type="button"
                          onClick={testOpenAiKey}
                          disabled={openAiConnectState === 'connecting' || !openAiEmbeddingsApiKey}
                          title="Validate key with an embeddings request"
                        >
                          {openAiConnectState === 'connecting' ? 'Testing...' : 'Test Key'}
                        </button>
                      </div>
                    </div>
                    {openAiConnectError && (
                      <div className="settings-error-message" style={{ marginTop: 12 }}>
                        {openAiConnectError}
                      </div>
                    )}
                    <div className="settings-help-text">
                      <strong>Security:</strong><br />
                      This key is stored locally in your browser only (localStorage). It is not saved to Supabase.
                    </div>
                  </div>
                </section>

                <section className="settings-page-section">
                  <h2>Bulk Upload to RAG</h2>
                  <p className="settings-page-description">
                    Select multiple text files. We’ll chunk them, embed each chunk, and store them in <code>documents</code> + <code>document_chunks</code>.
                  </p>

                  <div className="settings-input-group">
                    <label htmlFor="rag-files">Files</label>
                    <input
                      id="rag-files"
                      type="file"
                      multiple
                      onChange={handleRagFilePick}
                      accept="image/*,.pdf,.docx,text/*,.md,.txt,.json,.csv,.js,.jsx,.ts,.tsx,.py,.sql,.html,.css,.yml,.yaml"
                    />
                    <span className="settings-form-hint">
                      Supports: PDF, DOCX, images (OCR), and text/code files. Note: scanned PDFs without a text layer may embed poorly until PDF OCR is added.
                    </span>

                    {ragUploadFiles.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                          <strong>{ragUploadFiles.length} file{ragUploadFiles.length > 1 ? 's' : ''} selected</strong>
                          <button
                            className="settings-clear-btn"
                            type="button"
                            onClick={() => setRagUploadFiles([])}
                            disabled={ragIngestState === 'ingesting'}
                          >
                            Clear
                          </button>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {ragUploadFiles.slice(0, 8).map((f) => (
                            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <button
                                className="settings-clear-error-btn"
                                type="button"
                                onClick={() => removeRagFile(f.id)}
                                disabled={ragIngestState === 'ingesting'}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          {ragUploadFiles.length > 8 && (
                            <div className="settings-form-hint">…and {ragUploadFiles.length - 8} more</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="settings-button-row" style={{ marginTop: 14 }}>
                      <button
                        className="settings-test-btn"
                        type="button"
                        onClick={ingestRagFiles}
                        disabled={
                          ragIngestState === 'ingesting' ||
                          ragUploadFiles.length === 0 ||
                          !dbEnabled ||
                          !openAiEmbeddingsApiKey
                        }
                        title={!dbEnabled ? 'Requires Supabase sign-in' : 'Ingest selected files into Supabase RAG tables'}
                      >
                        {ragIngestState === 'ingesting'
                          ? `Uploading… (${ragIngestProgress.fileIndex}/${ragIngestProgress.fileCount})`
                          : 'Ingest to RAG'}
                      </button>
                    </div>

                    {ragIngestProgress?.message && (
                      <div className="settings-form-hint" style={{ marginTop: 10 }}>
                        {ragIngestProgress.message}
                      </div>
                    )}
                    {ragIngestError && (
                      <div className="settings-error-message" style={{ marginTop: 12 }}>
                        {ragIngestError}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {settingsTab === 'ocr' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>OCR Document Processing</h2>
                  <p className="settings-page-description">
                    When you upload images in chat, we’ll run OCR + a quick document analysis using OpenAI and (optionally) store extracted text into your RAG.
                  </p>

                  <div className="settings-input-group">
                    <label htmlFor="ocr-model">Default OCR/Vision Model</label>
                    <input
                      id="ocr-model"
                      type="text"
                      value={ocrModel}
                      onChange={(e) => setOcrModel(e.target.value)}
                      placeholder="gpt-4o"
                    />

                    <div className="settings-help-text">
                      <strong>Key:</strong><br />
                      OCR uses the same OpenAI key as Embeddings (<code>VITE_OPENAI_API_KEY</code> / localStorage).
                    </div>

                    <div className="settings-form-row" style={{ marginTop: 10 }}>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={ocrAutoProcessChatUploads}
                          onChange={(e) => setOcrAutoProcessChatUploads(e.target.checked)}
                        />
                        Auto-process chat uploads (OCR/analyze)
                      </label>
                    </div>

                    <div className="settings-form-row">
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={ocrAutoPostSummaryToChat}
                          onChange={(e) => setOcrAutoPostSummaryToChat(e.target.checked)}
                        />
                        Post OCR summary into chat
                      </label>
                    </div>

                    <div className="settings-form-row">
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={ocrAutoIngestToRag}
                          onChange={(e) => setOcrAutoIngestToRag(e.target.checked)}
                          disabled={!dbEnabled}
                        />
                        Insert extracted text into RAG (requires Supabase sign-in)
                      </label>
                    </div>

                    <span className="settings-form-hint">
                      Current support: images (OCR via vision) + text-like files (ingest directly). PDFs/DOCs aren’t parsed yet.
                    </span>
                  </div>
                </section>
              </div>
            )}

            {settingsTab === 'images' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>Image Generation</h2>
                  <p className="settings-page-description">
                    Configure the default OpenAI image model used when you ask for an image in chat (try <code>/image a cyberpunk cat</code>).
                  </p>
                  <div className="settings-input-group">
                    <label htmlFor="img-model">Default Image Model</label>
                    <input
                      id="img-model"
                      type="text"
                      value={imageGenModel}
                      onChange={(e) => setImageGenModel(e.target.value)}
                      placeholder="dall-e-3"
                    />

                    <div className="settings-form-row" style={{ marginTop: 10 }}>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={autoImageGenFromChat}
                          onChange={(e) => setAutoImageGenFromChat(e.target.checked)}
                        />
                        Auto-detect image requests in chat
                      </label>
                    </div>

                    <div className="settings-help-text">
                      <strong>Key:</strong><br />
                      Image generation uses the same OpenAI key as Embeddings/OCR (<code>VITE_OPENAI_API_KEY</code> / localStorage).
                    </div>
                  </div>
                </section>
              </div>
            )}

            {settingsTab === 'mcp' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>Import MCP Servers</h2>
                  <p className="settings-page-description">
                    Paste your MCP JSON config to import servers. The config will be parsed to extract server URLs and authentication.
                  </p>

                  <div className="settings-input-group">
                    <label htmlFor="mcp-json">MCP JSON Config</label>
                    <textarea
                      id="mcp-json"
                      value={mcpImportJson}
                      onChange={(e) => setMcpImportJson(e.target.value)}
                      placeholder={`{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "-y", "supergateway",
        "--streamableHttp", "https://your-server.com/mcp-server/http",
        "--header", "authorization:Bearer YOUR_TOKEN"
      ]
    }
  }
}`}
                      rows={10}
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                    
                    <div className="settings-button-row" style={{ marginTop: 12 }}>
                      <button 
                        className="openrouter-connect-btn"
                        onClick={importMcpServers}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Import Servers
                      </button>
          </div>

                    {mcpImportError && (
                      <div className="settings-error-message" style={{ marginTop: 12 }}>
                        {mcpImportError}
                      </div>
                    )}
                  </div>
                </section>

                <section className="settings-page-section">
                  <h2>Configured Servers</h2>
                  
                  {mcpServers.length === 0 ? (
                    <div className="settings-empty-state">
                      <p>No MCP servers configured. Import a JSON config above.</p>
                    </div>
                  ) : (
                    <div className="mcp-server-list">
                      {mcpServers.map((server) => (
                        <div key={server.id} className="mcp-server-item">
                          <div className="mcp-server-header">
                            <div className="mcp-server-info">
                              <div className="mcp-server-name">{server.name}</div>
                              <div className="mcp-server-url">{server.url}</div>
                            </div>
                            <div className="mcp-server-actions">
                              <div className={`openrouter-status ${server.connectState}`}>
                                <span className="openrouter-status-dot" />
                                <span className="openrouter-status-text">
                                  {server.connectState === 'connected'
                                    ? `${server.flows.length} flows`
                                    : server.connectState === 'connecting'
                                      ? 'Connecting...'
                                      : server.connectState === 'error'
                                        ? 'Error'
                                        : 'Disconnected'}
                                </span>
                              </div>
                              {server.connectState === 'connected' ? (
                                <button 
                                  className="openrouter-connect-btn secondary small"
                                  onClick={() => disconnectMcpServer(server.id)}
                                >
                                  Disconnect
                                </button>
                              ) : (
                                <button 
                                  className="openrouter-connect-btn small"
                                  onClick={() => connectMcpServer(server.id)}
                                  disabled={server.connectState === 'connecting'}
                                >
                                  Connect
                                </button>
                              )}
                              <button 
                                className="settings-delete-btn small"
                                onClick={() => removeMcpServer(server.id)}
                                title="Remove server"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                          {server.connectError && (
                            <div className="settings-error-message" style={{ marginTop: 8, fontSize: 12 }}>
                              {server.connectError}
                            </div>
                          )}
                          
                          {/* Discover Workflows section */}
                          {server.connectState === 'connected' && server.flows?.some(f => f.name === 'search_workflows') && (
                            <div className="mcp-workflows-section">
                              <div className="mcp-workflows-header">
                                <span className="mcp-workflows-title">n8n Workflows</span>
                                <button
                                  className="openrouter-connect-btn small"
                                  onClick={() => discoverMcpWorkflows(server.id)}
                                  disabled={server.discoveringWorkflows}
                                >
                                  {server.discoveringWorkflows ? 'Discovering...' : 'Discover Workflows'}
                                </button>
                              </div>
                              
                              {server.workflows && server.workflows.length > 0 && (
                                <div className="mcp-workflows-list">
                                  {server.workflows.map((wf, idx) => (
                                    <div key={wf.id || idx} className="mcp-workflow-item">
                                      <div className="mcp-workflow-info">
                                        <div className="mcp-workflow-name">{wf.name || wf.workflow_name || 'Unnamed'}</div>
                                        {(wf.description || wf.project) && (
                                          <div className="mcp-workflow-meta">
                                            {wf.project && <span className="mcp-workflow-project">{wf.project}</span>}
                                            {wf.description && <span className="mcp-workflow-desc">{wf.description}</span>}
                                          </div>
                                        )}
                                      </div>
                                      <div className="mcp-workflow-actions">
                                        {wf.id && (
                                          <div className="mcp-workflow-id">ID: {wf.id}</div>
                                        )}
                                        <button
                                          className="openrouter-connect-btn small"
                                          onClick={() => createMcpAgentFromWorkflow(server.id, wf)}
                                          title="Add this workflow as a chat agent"
                                        >
                                          + Add as Agent
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {server.workflows && server.workflows.length === 0 && (
                                <div className="mcp-workflows-empty">
                                  No workflows found. Click "Discover Workflows" to search.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="settings-page-section">
                  <div className="settings-page-section-header">
                    <h2>Available Tools/Flows</h2>
                    <div className="settings-inline-search">
                      <input
                        type="text"
                        value={mcpFlowFilter}
                        onChange={(e) => setMcpFlowFilter(e.target.value)}
                        placeholder="Filter flows…"
                      />
                    </div>
                  </div>

                  {filteredMcpFlows.length === 0 ? (
                    <div className="settings-empty-state">
                      <p>
                        {mcpServers.some(s => s.connectState === 'connected')
                          ? 'No flows found from connected servers.'
                          : 'Connect an MCP server to load available flows.'}
                      </p>
                    </div>
                  ) : (
                    <div className="mcp-flow-list">
                      {filteredMcpFlows.map((f, idx) => (
                        <div key={`${f.serverName}-${f.name}-${idx}`} className="mcp-flow-item">
                          <div className="mcp-flow-main">
                            <div className="mcp-flow-name">{f.name}</div>
                            {f.description && <div className="mcp-flow-desc">{f.description}</div>}
                          </div>
                          <div className="mcp-flow-meta">
                            <span className="mcp-flow-server">{f.serverName}</span>
                            {f.inputSchema && <span className="mcp-flow-inputs">Has inputs</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {settingsTab === 'deepsearch' && (
              <div className="settings-tab-panel">
                <section className="settings-page-section">
                  <h2>Deep Research</h2>
                  <p className="settings-page-description">
                    Deep Research uses Perplexity Sonar via OpenRouter.
                  </p>
                  <div className="settings-input-group">
                    <div className="settings-status-row">
                      <span className="settings-status-label">Provider</span>
                      <span className="settings-status-value">OpenRouter</span>
                    </div>
                    <div className="settings-status-row">
                      <span className="settings-status-label">Model</span>
                      <span className="settings-status-value">perplexity/sonar</span>
                    </div>
                    <div className="settings-status-row">
                      <span className="settings-status-label">Status</span>
                      <span className={`status-pill ${openRouterConnectState}`}>
                        {openRouterConnectState}
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Gallery / Library Page */}
        <div className={`settings-page library-page ${showGalleryPage ? 'slide-in' : 'slide-out'}`}>
          <div className="library-page-header">
            <div className="library-header-inner">
              <div className="library-topbar">
                <button
                  className="settings-back-btn"
                  onClick={() => setShowGalleryPage(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5"/>
                    <path d="M12 19l-7-7 7-7"/>
                  </svg>
                  Back to Chat
                </button>

                <div className="library-topbar-center">
                  <h1>Library</h1>
                  <div className="library-subtitle">Saved images and code artifacts</div>
                </div>

                <div className="library-topbar-right" />
              </div>

              {/* Library Tabs */}
              <div className="library-tabs-wrap">
                <div className="library-tabs">
                  <button
                    className={`library-tab ${libraryTab === 'images' ? 'active' : ''}`}
                    onClick={() => setLibraryTab('images')}
                  >
                    <div className="library-tab-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                    <span className="library-tab-label">Images</span>
                    <span className="library-tab-count">{generatedImages.length}</span>
                  </button>
                  <button
                    className={`library-tab ${libraryTab === 'artifacts' ? 'active' : ''}`}
                    onClick={() => setLibraryTab('artifacts')}
                  >
                    <div className="library-tab-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="16 18 22 12 16 6"/>
                        <polyline points="8 6 2 12 8 18"/>
                      </svg>
                    </div>
                    <span className="library-tab-label">Code Artifacts</span>
                    <span className="library-tab-count">{codeArtifacts.length}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-page-content library-page-content">
            {/* Images Tab */}
            {libraryTab === 'images' && (
              <section className="settings-page-section">
                <div className="library-section-header">
                  <h2>Generated Images</h2>
                  <button
                    className="library-refresh-btn"
                    type="button"
                    onClick={loadGeneratedImages}
                    disabled={!dbEnabled || galleryLoading}
                    title={!dbEnabled ? 'Requires Supabase sign-in' : 'Refresh'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Refresh
                  </button>
                </div>

                {!dbEnabled && (
                  <div className="settings-help-text">
                    <strong>Supabase required:</strong><br />
                    Sign in to store images permanently and view them here.
                  </div>
                )}

                {galleryError && (
                  <div className="settings-error-message" style={{ marginTop: 12 }}>
                    {galleryError}
                  </div>
                )}

                {galleryLoading && (
                  <div className="settings-form-hint" style={{ marginTop: 12 }}>
                    Loading…
                  </div>
                )}

                {dbEnabled && !galleryLoading && generatedImages.length === 0 && (
                  <div className="settings-form-hint" style={{ marginTop: 12 }}>
                    No images yet. Use <code>/image ...</code> in chat to generate one.
                  </div>
                )}

                {generatedImages.length > 0 && (
                  <div className="gallery-grid" style={{ marginTop: 14 }}>
                    {generatedImages.map((img) => (
                      <div key={img.image_id} className="gallery-item">
                        <div className="gallery-thumb-wrapper">
                        {img.url ? (
                          <img 
                            src={img.url} 
                            alt={img.prompt || 'Generated image'} 
                            className="gallery-thumb" 
                            loading="lazy" 
                            onClick={() => setImagePreviewModal({ url: img.url, prompt: img.prompt || 'Generated image' })}
                            style={{ cursor: 'pointer' }}
                          />
                        ) : (
                          <div className="gallery-thumb gallery-thumb-missing">No preview</div>
                        )}
                          <div className="gallery-actions">
                            {img.url && (
                              <button
                                className="gallery-action-btn gallery-download-btn"
                                onClick={() => downloadImage(img.url, img.prompt)}
                                title="Download image"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                  <polyline points="7 10 12 15 17 10"></polyline>
                                  <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                              </button>
                            )}
                            <button
                              className="gallery-action-btn gallery-delete-btn"
                              onClick={() => deleteGeneratedImage(img.image_id, img.storage_bucket, img.storage_path)}
                              title="Delete image"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="gallery-meta">
                          <div className="gallery-prompt">{img.prompt || 'Untitled prompt'}</div>
                          <div className="gallery-sub">{img.model || ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Code Artifacts Tab */}
            {libraryTab === 'artifacts' && (
              <section className="settings-page-section">
                <div className="library-section-header">
                  <h2>Code Artifacts</h2>
                  <button
                    className="library-refresh-btn"
                    type="button"
                    onClick={loadCodeArtifacts}
                    disabled={!dbEnabled || artifactsLoading}
                    title={!dbEnabled ? 'Requires Supabase sign-in' : 'Refresh'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Refresh
                  </button>
                </div>

                {!dbEnabled && (
                  <div className="settings-help-text">
                    <strong>Supabase required:</strong><br />
                    Sign in to save and view code artifacts.
                  </div>
                )}

                {artifactsError && (
                  <div className="settings-error-message" style={{ marginTop: 12 }}>
                    {artifactsError}
                  </div>
                )}

                {artifactsLoading && (
                  <div className="settings-form-hint" style={{ marginTop: 12 }}>
                    Loading…
                  </div>
                )}

                {dbEnabled && !artifactsLoading && codeArtifacts.length === 0 && (
                  <div className="settings-form-hint" style={{ marginTop: 12 }}>
                    No code artifacts yet. Click the save icon on any code block in chat to save it here.
                  </div>
                )}

                {codeArtifacts.length > 0 && (
                  <div className="artifacts-grid" style={{ marginTop: 14 }}>
                    {codeArtifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="artifact-card artifact-card-clickable"
                        onClick={(e) => {
                          // Don't open if clicking on action buttons or editing
                          if (e.target.closest('.artifact-actions') || e.target.closest('.artifact-title-edit')) return
                          openArtifactInCanvas(artifact)
                        }}
                      >
                        <div className="artifact-header">
                          <span className="artifact-lang">{artifact.language || 'text'}</span>
                          <div className="artifact-actions">
                            <button
                              className="artifact-action-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingArtifactId(artifact.id)
                                setEditingArtifactTitle(artifact.title || '')
                              }}
                              title="Rename"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button
                              className="artifact-action-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                copyArtifactCode(artifact.code)
                              }}
                              title="Copy code"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                            <button
                              className="artifact-action-btn artifact-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteCodeArtifact(artifact.id)
                              }}
                              title="Delete artifact"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                        {editingArtifactId === artifact.id ? (
                          <div className="artifact-title-edit" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingArtifactTitle}
                              onChange={(e) => setEditingArtifactTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  renameCodeArtifact(artifact.id, editingArtifactTitle)
                                } else if (e.key === 'Escape') {
                                  setEditingArtifactId(null)
                                  setEditingArtifactTitle('')
                                }
                              }}
                              autoFocus
                              placeholder="Enter name..."
                            />
                            <button
                              className="artifact-title-save"
                              onClick={() => renameCodeArtifact(artifact.id, editingArtifactTitle)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </button>
                            <button
                              className="artifact-title-cancel"
                              onClick={() => {
                                setEditingArtifactId(null)
                                setEditingArtifactTitle('')
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="artifact-title">{artifact.title}</div>
                        )}
                        <pre className="artifact-preview"><code>{artifact.code?.slice(0, 200)}{artifact.code?.length > 200 ? '...' : ''}</code></pre>
                        <div className="artifact-footer">
                          <span className="artifact-date">
                            {artifact.created_at ? new Date(artifact.created_at).toLocaleDateString() : ''}
                          </span>
                          <span className="artifact-open-hint">Click to open in editor</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Skills Page */}
        <div className={`settings-page skills-page ${showSkillsPage ? 'slide-in' : 'slide-out'}`}>
          <div className="settings-page-header">
            <button
              className="settings-back-btn"
              onClick={() => setShowSkillsPage(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5"/>
                <path d="M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <h1>Skills</h1>
            <div className="skills-header-actions">
              <button className="skills-refresh-btn" onClick={() => showToast('Skills refreshed')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6"/>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                Refresh
              </button>
              <div className="skills-search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search skills"
                  value={skillsSearchQuery}
                  onChange={(e) => setSkillsSearchQuery(e.target.value)}
                />
              </div>
              <button className="skills-new-btn" onClick={() => showToast('Create custom skill coming soon')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New skill
              </button>
            </div>
          </div>
          <div className="settings-page-content">
            <div className="skills-grid">
              {filteredSkills.map((skill) => {
                const isConnected = isSkillConnected(skill.id)
                const isEnabled = enabledSkills.includes(skill.id)
                return (
                  <div
                    key={skill.id}
                    className={`skill-card ${isConnected ? 'skill-connected' : ''} ${isEnabled ? 'skill-enabled' : ''}`}
                    onClick={() => handleSkillClick(skill)}
                  >
                    {/* Connection indicator */}
                    {isConnected && (
                      <div className="skill-connection-badge">
                        <span className="skill-connection-dot"></span>
                        Connected
                      </div>
                    )}
                    <div className="skill-card-icon">
                      {skill.icon === 'github' && (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      )}
                      {skill.icon === 'vercel' && (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M24 22.525H0l12-21.05 12 21.05z"/>
                        </svg>
                      )}
                      {skill.icon === 'figma' && (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zM8.148 24c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.588 4.539zm-.001-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019c1.665 0 3.019-1.355 3.019-3.019v-3.019H8.147zM8.148 8.981c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981H8.148zm0-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V1.471H8.148zM8.148 15.02c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98H8.148zm0-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V7.51H8.148zM15.852 15.02c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49 4.49 2.014 4.49 4.49-2.014 4.49-4.49 4.49zm0-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019 3.019-1.355 3.019-3.019-1.354-3.019-3.019-3.019z"/>
                        </svg>
                      )}
                      {skill.icon === 'notion' && (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.373.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.747.327-.747.933zm14.337.746c.093.42 0 .84-.42.886l-.7.14v10.264c-.607.327-1.167.513-1.634.513-.746 0-.933-.233-1.493-.933l-4.572-7.186v6.952l1.447.327s0 .84-1.167.84l-3.22.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.453-.233 4.759 7.279v-6.44l-1.214-.14c-.093-.513.28-.886.746-.933zM2.874.5l13.682-.933c1.68-.14 2.101.093 2.802.606l3.86 2.708c.466.326.606.42.606.793v15.924c0 1.026-.373 1.634-1.68 1.727l-15.458.933c-.98.047-1.447-.093-1.96-.747l-3.127-4.06c-.56-.747-.793-1.306-.793-1.96V2.081C.813 1.128 1.187.593 2.874.5z"/>
                        </svg>
                      )}
                      {skill.icon === 'linear' && (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 12c0-1.2.3-2.4.8-3.5L12 16.8c-1 .5-2.3.8-3.5.8A6.5 6.5 0 013 12zm9 6.5c-1.8 0-3.5-.7-4.8-1.9L15.5 8c1.2 1.3 2 3 2 4.8a6.5 6.5 0 01-5.5 5.7zm3.2-12L7.5 14.2a6.5 6.5 0 014.5-8.2 6.5 6.5 0 013.2 2.5zM12 1a11 11 0 100 22 11 11 0 000-22z"/>
                        </svg>
                      )}
                      {skill.icon === 'sora' && (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                      )}
                    </div>
                    <div className="skill-card-content">
                      <div className="skill-card-header">
                        <h3 className="skill-card-name">{skill.name}</h3>
                        <span className="skill-card-category">{skill.category}</span>
                      </div>
                      <p className="skill-card-description">{skill.description}</p>
                      {!isConnected && (
                        <p className="skill-card-hint">Click to connect</p>
                      )}
                    </div>
                    <div className="skill-card-actions">
                      {isConnected ? (
                        <>
                          <button
                            className={`skill-toggle-btn ${isEnabled ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleSkill(skill.id) }}
                            title={isEnabled ? 'Disable' : 'Enable'}
                          >
                            {isEnabled ? 'ON' : 'OFF'}
                          </button>
                          <button
                            className="skill-disconnect-btn"
                            onClick={(e) => { e.stopPropagation(); disconnectSkill(skill.id) }}
                            title="Disconnect"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                              <line x1="12" y1="2" x2="12" y2="12"/>
                            </svg>
                          </button>
                        </>
                      ) : (
                        <div className="skill-connect-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {filteredSkills.length === 0 && (
              <div className="skills-empty">
                <p>No skills found matching "{skillsSearchQuery}"</p>
              </div>
            )}
          </div>

          {/* Skill Credentials Modal */}
          {skillCredentialsModal && (
            <div className="skill-credentials-overlay" onClick={() => setSkillCredentialsModal(null)}>
              <div className="skill-credentials-modal" onClick={(e) => e.stopPropagation()}>
                <div className="skill-credentials-header">
                  <h2>Connect {skillCredentialsModal.skillName}</h2>
                  <button className="skill-credentials-close" onClick={() => setSkillCredentialsModal(null)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <div className="skill-credentials-body">
                  <label className="skill-credentials-label">
                    {skillCredentialsModal.tokenLabel}
                  </label>
                  <input
                    type="password"
                    className="skill-credentials-input"
                    value={skillCredentialsInput}
                    onChange={(e) => setSkillCredentialsInput(e.target.value)}
                    placeholder={`Enter your ${skillCredentialsModal.tokenLabel.toLowerCase()}`}
                    onKeyDown={(e) => e.key === 'Enter' && saveSkillToken()}
                    autoFocus
                  />
                  <p className="skill-credentials-hint">
                    {skillCredentialsModal.tokenHelp}
                  </p>
                </div>
                <div className="skill-credentials-footer">
                  <button 
                    className="skill-credentials-cancel"
                    onClick={() => setSkillCredentialsModal(null)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="skill-credentials-connect"
                    onClick={saveSkillToken}
                    disabled={!skillCredentialsInput.trim() || skillConnecting}
                  >
                    {skillConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Admin Page */}
        {isAdmin && (
          <div className={`settings-page admin-page ${showAdminPage ? 'slide-in' : 'slide-out'}`}>
            <div className="settings-page-header">
              <button
                className="settings-back-btn"
                onClick={() => setShowAdminPage(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5"/>
                  <path d="M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <h1>Admin</h1>
            </div>
            <div className="settings-page-content">
              {!dbEnabled && (
                <div className="settings-help-text">
                  Supabase is required for admin management.
                </div>
              )}

              {adminError && (
                <div className="settings-error-message" style={{ marginTop: 12 }}>
                  {adminError}
                </div>
              )}

              <section className="settings-page-section">
                <h2>Usage Rates</h2>
                <p className="settings-page-description">
                  Set your input/output cost per 1M tokens for accurate cost reporting.
                </p>
                <div className="settings-input-group">
                  <label htmlFor="admin-input-cost">Input cost (per 1M tokens)</label>
                  <input
                    id="admin-input-cost"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={adminRates.inputCost}
                    onChange={(e) => setAdminRates((prev) => ({ ...prev, inputCost: e.target.value }))}
                  />
                  <label htmlFor="admin-output-cost">Output cost (per 1M tokens)</label>
                  <input
                    id="admin-output-cost"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={adminRates.outputCost}
                    onChange={(e) => setAdminRates((prev) => ({ ...prev, outputCost: e.target.value }))}
                  />
                  <div className="settings-button-row">
                    <button
                      className="settings-test-btn"
                      type="button"
                      onClick={saveAdminRates}
                      disabled={adminSavingRates || !dbEnabled}
                    >
                      {adminSavingRates ? 'Saving...' : 'Save Rates'}
                    </button>
                    <button
                      className="settings-clear-btn"
                      type="button"
                      onClick={loadAdminData}
                      disabled={adminLoading || !dbEnabled}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </section>

              <section className="settings-page-section">
                <div className="settings-page-section-header">
                  <h2>User Management & Usage</h2>
                  <span className="agents-count">{adminRows.length} users</span>
                </div>
                {adminLoading ? (
                  <div className="settings-form-hint">Loading users…</div>
                ) : (
                  <div className="admin-table">
                    <div className="admin-table-header">
                      <span>User</span>
                      <span>Models</span>
                      <span>Input Tokens</span>
                      <span>Output Tokens</span>
                      <span>Cost</span>
                      <span>Rates</span>
                    </div>
                    {adminRows.map((row) => (
                      <div key={row.user_id} className="admin-table-row">
                        <div className="admin-user">
                          <div className="admin-user-name">
                            {row.display_name || row.email || row.user_id}
                          </div>
                          <div className="admin-user-meta">
                            {row.email || 'No email'}
                            {row.email?.toLowerCase() === ADMIN_EMAIL && (
                              <span className="admin-badge">Admin</span>
                            )}
                          </div>
                        </div>
                        <div className="admin-models">
                          {(adminUsageModelsMap.get(row.user_id) || []).length === 0 ? (
                            <span className="admin-models-empty">No usage yet</span>
                          ) : (
                            (adminUsageModelsMap.get(row.user_id) || [])
                              .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
                              .slice(0, 4)
                              .map((m) => (
                                <div key={`${row.user_id}-${m.model}`} className="admin-model-pill">
                                  <span className="admin-model-name">{m.model}</span>
                                  <span className="admin-model-tokens">
                                    {formatNumber(m.input_tokens || 0)} / {formatNumber(m.output_tokens || 0)}
                                  </span>
                                </div>
                              ))
                          )}
                        </div>
                        <div>{formatNumber(row.inputTokens)}</div>
                        <div>{formatNumber(row.outputTokens)}</div>
                        <div className="admin-cost">
                          ${formatNumber(row.totalCost)}
                        </div>
                        <div className="admin-rate-inputs">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={`Input (${adminRates.inputCost})`}
                            value={getUserRateValue(row.user_id, 'inputCost')}
                            onChange={(e) =>
                              setAdminUserRates((prev) => ({
                                ...prev,
                                [row.user_id]: {
                                  ...(prev[row.user_id] || {}),
                                  inputCost: e.target.value,
                                },
                              }))
                            }
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={`Output (${adminRates.outputCost})`}
                            value={getUserRateValue(row.user_id, 'outputCost')}
                            onChange={(e) =>
                              setAdminUserRates((prev) => ({
                                ...prev,
                                [row.user_id]: {
                                  ...(prev[row.user_id] || {}),
                                  outputCost: e.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="admin-rate-save-btn"
                            onClick={() => saveUserRates(row.user_id)}
                            disabled={adminSavingUsers[row.user_id]}
                          >
                            {adminSavingUsers[row.user_id] ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ))}
                    {adminRows.length === 0 && (
                      <div className="settings-form-hint">No users found.</div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* Knowledge Base Page */}
        <div className={`kb-page ${showKnowledgeBasePage ? 'slide-in' : 'slide-out'}`}>
          {/* Header */}
          <div className="kb-header">
            <button
              className="kb-back-btn"
              onClick={() => setShowKnowledgeBasePage(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div className="kb-header-content">
              <h1 className="kb-title">Knowledge Base</h1>
              <p className="kb-subtitle">Manage your AI's memory, documents, and knowledge graph</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="kb-tabs-container">
            <nav className="kb-tabs">
              <button
                className={`kb-tab ${knowledgeBaseTab === 'memory' ? 'active' : ''}`}
                onClick={() => setKnowledgeBaseTab('memory')}
              >
                Chat Memory
                {memoriesTotalCount > 0 && (
                  <span className="kb-tab-count">{memoriesTotalCount}</span>
                )}
              </button>
              <button
                className={`kb-tab ${knowledgeBaseTab === 'rag' ? 'active' : ''}`}
                onClick={() => setKnowledgeBaseTab('rag')}
              >
                Documents
                {documentsTotalCount > 0 && (
                  <span className="kb-tab-count">{documentsTotalCount}</span>
                )}
              </button>
              <button
                className={`kb-tab ${knowledgeBaseTab === 'graph' ? 'active' : ''}`}
                onClick={() => setKnowledgeBaseTab('graph')}
              >
                Knowledge Graph
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="kb-content">
            {/* Chat Memory Tab */}
            {knowledgeBaseTab === 'memory' && (
              <div className="kb-panel">
                <div className="kb-panel-header">
                  <div className="kb-panel-info">
                    <h2>Chat Memory</h2>
                    <p>Memories extracted from your conversations that help personalize AI responses.</p>
                  </div>
                  <button
                    className="kb-refresh-btn"
                    onClick={loadUserMemories}
                    disabled={!dbEnabled || kbLoading}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6"/>
                      <path d="M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Refresh
                  </button>
                </div>

                {!dbEnabled && (
                  <div className="kb-empty-state">
                    <div className="kb-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <h3>Sign in required</h3>
                    <p>Connect to Supabase to view and manage your chat memories.</p>
                  </div>
                )}

                {dbEnabled && kbLoading && (
                  <div className="kb-loading">
                    <div className="kb-loading-spinner"></div>
                    <span>Loading memories...</span>
                  </div>
                )}

                {dbEnabled && !kbLoading && userMemories.length === 0 && (
                  <div className="kb-empty-state">
                    <div className="kb-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                    </div>
                    <h3>No memories yet</h3>
                    <p>Start chatting with an agent to build your personalized memory.</p>
                  </div>
                )}

                {userMemories.length > 0 && (
                  <div className="kb-memory-list">
                    {/* Group memories by type */}
                    {['preference', 'personal_detail', 'project_context', 'fact'].map(type => {
                      const memoriesOfType = userMemories.filter(m => m.memory_type === type)
                      if (memoriesOfType.length === 0) return null
                      
                      const typeLabels = {
                        preference: { label: 'Preferences', icon: '⚙️' },
                        personal_detail: { label: 'Personal Details', icon: '👤' },
                        project_context: { label: 'Project Context', icon: '📁' },
                        fact: { label: 'Facts', icon: '💡' }
                      }
                      const { label, icon } = typeLabels[type] || { label: type, icon: '📝' }
                      
                      return (
                        <div key={type} className="kb-memory-group">
                          <div className="kb-memory-group-header">
                            <span className="kb-memory-group-icon">{icon}</span>
                            <span className="kb-memory-group-title">{label}</span>
                            <span className="kb-memory-group-count">{memoriesOfType.length}</span>
                          </div>
                          <div className="kb-memory-group-items">
                            {memoriesOfType.map((mem) => (
                              <div key={mem.memory_id} className="kb-memory-item">
                                <div className="kb-memory-item-content">
                                  <p className="kb-memory-text">{mem.content}</p>
                                  <div className="kb-memory-meta">
                                    <span className="kb-memory-confidence">
                                      {Math.round((mem.confidence || 0) * 100)}%
                                    </span>
                                    <span className="kb-memory-date">
                                      {new Date(mem.created_at).toLocaleDateString('en-US', { 
                                        month: 'short', 
                                        day: 'numeric'
                                      })}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  className="kb-memory-delete"
                                  onClick={() => deleteMemory(mem.memory_id)}
                                  title="Delete memory"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* Pagination Controls */}
                    {memoriesTotalCount > KB_PAGE_SIZE && (
                      <div className="kb-pagination">
                        <button
                          className="kb-pagination-btn"
                          onClick={() => loadUserMemories(memoriesPage - 1)}
                          disabled={memoriesPage <= 1 || kbLoading}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                          Previous
                        </button>
                        <span className="kb-pagination-info">
                          Page {memoriesPage} of {Math.ceil(memoriesTotalCount / KB_PAGE_SIZE)}
                          <span className="kb-pagination-total">({memoriesTotalCount} total)</span>
                        </span>
                        <button
                          className="kb-pagination-btn"
                          onClick={() => loadUserMemories(memoriesPage + 1)}
                          disabled={memoriesPage >= Math.ceil(memoriesTotalCount / KB_PAGE_SIZE) || kbLoading}
                        >
                          Next
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      </div>
                    )}
                    
                    {/* Show any memories with unknown types */}
                    {userMemories.filter(m => !['preference', 'personal_detail', 'project_context', 'fact'].includes(m.memory_type)).length > 0 && (
                      <div className="kb-memory-group">
                        <div className="kb-memory-group-header">
                          <span className="kb-memory-group-icon">📝</span>
                          <span className="kb-memory-group-title">Other</span>
                          <span className="kb-memory-group-count">
                            {userMemories.filter(m => !['preference', 'personal_detail', 'project_context', 'fact'].includes(m.memory_type)).length}
                          </span>
                        </div>
                        <div className="kb-memory-group-items">
                          {userMemories.filter(m => !['preference', 'personal_detail', 'project_context', 'fact'].includes(m.memory_type)).map((mem) => (
                            <div key={mem.memory_id} className="kb-memory-item">
                              <div className="kb-memory-item-content">
                                <p className="kb-memory-text">{mem.content}</p>
                                <div className="kb-memory-meta">
                                  <span className="kb-memory-confidence">
                                    {Math.round((mem.confidence || 0) * 100)}%
                                  </span>
                                  <span className="kb-memory-date">
                                    {new Date(mem.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric'
                                    })}
                                  </span>
                                </div>
                              </div>
                              <button
                                className="kb-memory-delete"
                                onClick={() => deleteMemory(mem.memory_id)}
                                title="Delete memory"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* RAG Documents Tab */}
            {knowledgeBaseTab === 'rag' && (
              <div className="kb-panel">
                <div className="kb-panel-header">
                  <div className="kb-panel-info">
                    <h2>RAG Documents</h2>
                    <p>Documents uploaded and processed for retrieval-augmented generation.</p>
                  </div>
                  <button
                    className="kb-refresh-btn"
                    onClick={loadRagDocuments}
                    disabled={!dbEnabled || kbLoading}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6"/>
                      <path d="M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Refresh
                  </button>
                </div>

                {!dbEnabled && (
                  <div className="kb-empty-state">
                    <div className="kb-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <h3>Sign in required</h3>
                    <p>Connect to Supabase to view and manage your documents.</p>
                  </div>
                )}

                {dbEnabled && kbLoading && (
                  <div className="kb-loading">
                    <div className="kb-loading-spinner"></div>
                    <span>Loading documents...</span>
                  </div>
                )}

                {dbEnabled && !kbLoading && ragDocuments.length === 0 && (
                  <div className="kb-empty-state">
                    <div className="kb-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                    </div>
                    <h3>No documents yet</h3>
                    <p>Upload files in chat to add them to your knowledge base.</p>
                  </div>
                )}

                {ragDocuments.length > 0 && (
                  <div className="kb-doc-list">
                    {ragDocuments.map((doc) => (
                      <div key={doc.document_id} className="kb-doc-item">
                        <div className="kb-doc-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                        <div className="kb-doc-info">
                          <div className="kb-doc-title-row">
                            <h4 className="kb-doc-title">{doc.title || 'Untitled document'}</h4>
                            {doc.is_embedded && (
                              <span className="kb-doc-embedded-badge" title={`${doc.embedded_count} chunk${doc.embedded_count !== 1 ? 's' : ''} embedded`}>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                                Embedded
                              </span>
                            )}
                            {!doc.is_embedded && doc.chunk_count > 0 && (
                              <span className="kb-doc-pending-badge" title="Processing or awaiting embedding">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                  <circle cx="12" cy="12" r="10"/>
                                  <polyline points="12 6 12 12 16 14"/>
                                </svg>
                                Pending
                              </span>
                            )}
                          </div>
                          <div className="kb-doc-meta">
                            <span className="kb-doc-type">{doc.source_type}</span>
                            {doc.chunk_count > 0 && (
                              <span className="kb-doc-chunks">{doc.chunk_count} chunk{doc.chunk_count !== 1 ? 's' : ''}</span>
                            )}
                            <span className="kb-doc-date">
                              {new Date(doc.created_at).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </span>
                          </div>
                        </div>
                        <button
                          className="kb-doc-delete"
                          onClick={() => deleteDocument(doc.document_id)}
                          title="Delete document"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                    
                    {/* Pagination Controls */}
                    {documentsTotalCount > KB_PAGE_SIZE && (
                      <div className="kb-pagination">
                        <button
                          className="kb-pagination-btn"
                          onClick={() => loadRagDocuments(documentsPage - 1)}
                          disabled={documentsPage <= 1 || kbLoading}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                          Previous
                        </button>
                        <span className="kb-pagination-info">
                          Page {documentsPage} of {Math.ceil(documentsTotalCount / KB_PAGE_SIZE)}
                          <span className="kb-pagination-total">({documentsTotalCount} total)</span>
                        </span>
                        <button
                          className="kb-pagination-btn"
                          onClick={() => loadRagDocuments(documentsPage + 1)}
                          disabled={documentsPage >= Math.ceil(documentsTotalCount / KB_PAGE_SIZE) || kbLoading}
                        >
                          Next
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Knowledge Graph Tab */}
            {knowledgeBaseTab === 'graph' && (
              <KnowledgeGraph 
                memories={graphMemories.length ? graphMemories : userMemories} 
                documents={graphDocuments.length ? graphDocuments : ragDocuments}
                isLoading={kbLoading || graphLoading}
              />
            )}
          </div>
        </div>

        {false && (
        <>
        {/* Code Page (Enhanced IDE) */}
        {/* ============================================
            CLAUDE CODE-STYLE CODER - 3 Pane Layout
            ============================================ */}
        <div className={`coder-page ${showCodePage ? 'open' : ''}`}>
          {/* Header Bar */}
          <div className="coder-header">
            <div className="coder-header-left">
              <button className="coder-back-btn" onClick={() => setShowCodePage(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <div className="coder-repo-info">
                {selectedRepo ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="coder-github-icon">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span className="coder-repo-name">{selectedRepo.full_name}</span>
                    <select 
                      className="coder-branch-select"
                      value={repoBranch}
                      onChange={(e) => {
                        setRepoBranch(e.target.value)
                        loadRepoFiles(selectedRepo, e.target.value)
                      }}
                    >
                      {repoBranches.map(b => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="coder-no-repo">No repository connected</span>
                )}
              </div>
            </div>
            <div className="coder-header-actions">
              {selectedRepo && (
                <>
                  <button 
                    className="coder-action-btn"
                    onClick={() => loadRepoFiles(selectedRepo, repoBranch)}
                    title="Refresh files"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                  </button>
                  <button 
                    className={`coder-action-btn ${coderView === 'diff' ? 'active' : ''}`}
                    onClick={() => setCoderView(coderView === 'diff' ? 'editor' : 'diff')}
                    title="Toggle diff view"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 3h5v5"/><path d="M8 3H3v5"/>
                      <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L3 3"/>
                      <path d="m15 9 6-6"/>
                    </svg>
                  </button>
                </>
              )}
              <button 
                className="coder-action-btn"
                onClick={() => setShowVercelModal(true)}
                title="Deploy to Vercel"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 19.5h20L12 2z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* 3-Pane Layout */}
          <div className="coder-layout">
            {/* LEFT PANE - File Tree */}
            <div className="coder-pane coder-files-pane">
              <div className="coder-pane-header">
                <div className="coder-pane-tabs">
                  <button 
                    className={`coder-pane-tab ${coderSidebarTab === 'files' ? 'active' : ''}`}
                    onClick={() => setCoderSidebarTab('files')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Files
                  </button>
                  <button 
                    className={`coder-pane-tab ${coderSidebarTab === 'changes' ? 'active' : ''}`}
                    onClick={() => setCoderSidebarTab('changes')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Changes
                    {proposedChanges.length > 0 && (
                      <span className="coder-badge">{proposedChanges.length}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Files Tab */}
              {coderSidebarTab === 'files' && (
                <div className="coder-file-tree">
                  {!githubConnected ? (
                    <div className="coder-connect-prompt">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      <h3>Connect GitHub</h3>
                      <p>Connect your GitHub to access repositories</p>
                      <input
                        type="password"
                        placeholder="GitHub Personal Access Token"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        className="coder-token-input"
                      />
                      <button className="coder-connect-btn" onClick={connectGitHub}>
                        Connect
                      </button>
                    </div>
                  ) : !selectedRepo ? (
                    <div className="coder-repo-list">
                      <div className="coder-repo-list-header">
                        <span>Select Repository</span>
                        <div className="coder-repo-list-actions">
                          <button 
                            onClick={() => setShowCreateRepoModal(true)} 
                            className="coder-create-repo-btn"
                            title="Create new repository"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19"/>
                              <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                          </button>
                          <button onClick={loadGitHubRepos} className="coder-refresh-btn" title="Refresh repos">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      {githubReposLoading ? (
                        <div className="coder-loading">Loading repositories...</div>
                      ) : (
                        githubRepos.map(repo => (
                          <div key={repo.id} className="coder-repo-item-wrapper">
                            <button
                              className="coder-repo-item"
                              onClick={() => selectRepo(repo)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                              </svg>
                              <div className="coder-repo-item-info">
                                <span className="coder-repo-item-name">{repo.name}</span>
                                <span className="coder-repo-item-desc">{repo.description || 'No description'}</span>
                              </div>
                              {repo.private && (
                                <span className="coder-repo-private-badge">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                  </svg>
                                </span>
                              )}
                            </button>
                            <div className="coder-repo-item-actions">
                              <button
                                className="coder-repo-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.open(`https://github.com/${repo.full_name}/settings`, '_blank')
                                }}
                                title="Edit on GitHub"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button
                                className="coder-repo-action-btn danger"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedRepo(repo)
                                  setShowDeleteRepoModal(true)
                                }}
                                title="Delete repository"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  <line x1="10" y1="11" x2="10" y2="17"/>
                                  <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : repoFilesLoading ? (
                    <div className="coder-loading">
                      <span className="coder-spinner"></span>
                      Indexing repository...
                    </div>
                  ) : (
                    <div className="coder-files-container">
                      {/* Back to repos header */}
                      <div className="coder-files-header">
                        <button 
                          className="coder-back-to-repos-btn"
                          onClick={exitRepo}
                          title="Back to repositories"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                          <span>All Repos</span>
                        </button>
                        <div className="coder-files-actions">
                          <button 
                            className="coder-file-action-btn"
                            onClick={() => setShowGithubNewFileModal(true)}
                            title="Create new file"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="12" y1="18" x2="12" y2="12"/>
                              <line x1="9" y1="15" x2="15" y2="15"/>
                            </svg>
                          </button>
                          <button 
                            className="coder-file-action-btn"
                            onClick={() => {
                              if (!selectedRepo) {
                                showToast('Select a repository to preview')
                                return
                              }
                              openPreviewModal()
                            }}
                            title="Preview"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M15 3h6v6"/>
                              <path d="M9 21H3v-6"/>
                              <path d="M21 3l-7 7"/>
                              <path d="M3 21l7-7"/>
                            </svg>
                          </button>
                          <button 
                            className="coder-file-action-btn danger"
                            onClick={() => {
                              setDeleteRepoError('')
                              setDeleteRepoConfirm('')
                              setShowDeleteRepoModal(true)
                            }}
                            title="Delete repository"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="coder-files-list">
                        {(() => {
                          const renderFileTree = (files, depth = 0) => {
                            return files.map(file => {
                              const status = fileStatuses[file.path] || 'unchanged'
                              const statusIcon = status === 'modified' ? '●' : status === 'added' ? '+' : status === 'deleted' ? '−' : ''
                              const statusClass = `coder-file-status-${status}`
                              
                              return (
                                <div key={file.path} className="coder-file-item-wrapper">
                                  <button
                                    className={`coder-file-item ${selectedFile?.path === file.path ? 'active' : ''} ${statusClass}`}
                                    style={{ paddingLeft: `${12 + depth * 16}px` }}
                                    onClick={() => {
                                      if (file.type === 'dir') {
                                        toggleFolder(file.path)
                                      } else {
                                        setSelectedFile(file)
                                        loadFileContent(selectedRepo.owner.login, selectedRepo.name, file.path, repoBranch)
                                      }
                                    }}
                                  >
                                    {file.type === 'dir' ? (
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="coder-file-icon">
                                        <path d={expandedFolders[file.path] 
                                          ? "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                                          : "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                                        }/>
                                      </svg>
                                    ) : (
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="coder-file-icon">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                      </svg>
                                    )}
                                    <span className="coder-file-name">{file.name}</span>
                                    {statusIcon && <span className={`coder-file-status-icon ${statusClass}`}>{statusIcon}</span>}
                                  </button>
                                  {/* File actions (edit/delete) */}
                                  {file.type !== 'dir' && (
                                    <div className="coder-file-item-actions">
                                      <button
                                        className="coder-file-mini-btn"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSelectedFile(file)
                                          loadFileContent(selectedRepo.owner.login, selectedRepo.name, file.path, repoBranch)
                                        }}
                                        title="Edit file"
                                      >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                      </button>
                                      <button
                                        className="coder-file-mini-btn danger"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDeleteFileTarget({
                                            path: file.path,
                                            name: file.name
                                          })
                                          setDeleteFileError('')
                                          setShowDeleteFileModal(true)
                                        }}
                                        title="Delete file"
                                      >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <polyline points="3 6 5 6 21 6"/>
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                  {file.type === 'dir' && expandedFolders[file.path] && file.children && (
                                    <div className="coder-file-children">
                                      {renderFileTree(file.children, depth + 1)}
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          }
                          return renderFileTree(repoFiles)
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Changes Tab - Proposed Changes */}
              {coderSidebarTab === 'changes' && (
                <div className="coder-changes-list">
                  {proposedChanges.length === 0 ? (
                    <div className="coder-no-changes">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 12l2 2 4-4"/>
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                      <p>No pending changes</p>
                      <span>AI-proposed changes will appear here</span>
                    </div>
                  ) : (
                    <>
                      <div className="coder-changes-header">
                        <span>{proposedChanges.length} files changed</span>
                        <button 
                          className="coder-apply-all-btn"
                          onClick={() => {
                            proposedChanges.forEach(change => {
                              if (change.action !== 'delete') {
                                setPendingFileChanges(prev => ({
                                  ...prev,
                                  [change.path]: { content: change.newContent, action: change.action }
                                }))
                              }
                            })
                            setProposedChanges([])
                            showToast('Changes applied')
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Apply All
                        </button>
                      </div>
                      {proposedChanges.map((change, idx) => (
                        <div key={idx} className={`coder-change-item coder-change-${change.action}`}>
                          <div className="coder-change-file">
                            <span className={`coder-change-action ${change.action}`}>
                              {change.action === 'create' ? '+' : change.action === 'delete' ? '−' : '●'}
                            </span>
                            <span 
                              className="coder-change-path"
                              onClick={() => setSelectedDiffFile(change)}
                            >
                              {change.path}
                            </span>
                          </div>
                          <div className="coder-change-actions">
                            <button
                              className="coder-change-btn accept"
                              onClick={() => {
                                setPendingFileChanges(prev => ({
                                  ...prev,
                                  [change.path]: { content: change.newContent, action: change.action }
                                }))
                                setProposedChanges(prev => prev.filter((_, i) => i !== idx))
                                showToast(`Accepted: ${change.path}`)
                              }}
                              title="Accept change"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            </button>
                            <button
                              className="coder-change-btn reject"
                              onClick={() => {
                                setProposedChanges(prev => prev.filter((_, i) => i !== idx))
                              }}
                              title="Reject change"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  
                  {/* Impact Summary */}
                  {impactSummary && (
                    <div className="coder-impact-summary">
                      <h4>Impact Summary</h4>
                      <div className="coder-impact-stats">
                        <div className="coder-impact-stat">
                          <span className="coder-impact-value">{impactSummary.filesChanged}</span>
                          <span className="coder-impact-label">Files</span>
                        </div>
                        <div className="coder-impact-stat added">
                          <span className="coder-impact-value">+{impactSummary.linesAdded}</span>
                          <span className="coder-impact-label">Added</span>
                        </div>
                        <div className="coder-impact-stat removed">
                          <span className="coder-impact-value">−{impactSummary.linesRemoved}</span>
                          <span className="coder-impact-label">Removed</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CENTER PANE - Editor / Diff View */}
            <div className="coder-pane coder-editor-pane">
              {/* Editor Tabs */}
              {selectedFile && (
                <div className="coder-editor-header">
                  <div className="coder-editor-tabs">
                    <div className="coder-editor-tab active">
                      <span>{selectedFile.name}</span>
                      <button className="coder-tab-close" onClick={() => setSelectedFile(null)}>×</button>
                    </div>
                  </div>
                  <div className="coder-editor-actions">
                    <button
                      className={`coder-view-btn ${coderView === 'editor' ? 'active' : ''}`}
                      onClick={() => setCoderView('editor')}
                    >
                      Code
                    </button>
                    <button
                      className={`coder-view-btn ${coderView === 'diff' ? 'active' : ''}`}
                      onClick={() => setCoderView('diff')}
                    >
                      Diff
                    </button>
                  </div>
                </div>
              )}

              <div className="coder-editor-content">
                {!selectedFile && !selectedDiffFile ? (
                  <div className="coder-editor-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    <h3>Select a file to view</h3>
                    <p>Choose a file from the tree or ask the AI to make changes</p>
                  </div>
                ) : coderView === 'diff' && selectedDiffFile ? (
                  /* Diff View */
                  <div className="coder-diff-view">
                    <div className="coder-diff-header">
                      <span className="coder-diff-filename">{selectedDiffFile.path}</span>
                      {selectedDiffFile.explanation && (
                        <div className="coder-diff-explanation">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4"/>
                            <path d="M12 8h.01"/>
                          </svg>
                          {selectedDiffFile.explanation}
                        </div>
                      )}
                    </div>
                    <div className="coder-diff-content">
                      {(() => {
                        const oldLines = (selectedDiffFile.oldContent || '').split('\n')
                        const newLines = (selectedDiffFile.newContent || '').split('\n')
                        const maxLines = Math.max(oldLines.length, newLines.length)
                        
                        return Array.from({ length: maxLines }).map((_, i) => {
                          const oldLine = oldLines[i] || ''
                          const newLine = newLines[i] || ''
                          const isAdded = !oldLines[i] && newLines[i]
                          const isRemoved = oldLines[i] && !newLines[i]
                          const isChanged = oldLines[i] !== newLines[i] && oldLines[i] && newLines[i]
                          
                          return (
                            <div key={i} className={`coder-diff-line ${isAdded ? 'added' : isRemoved ? 'removed' : isChanged ? 'changed' : ''}`}>
                              <span className="coder-diff-line-num">{i + 1}</span>
                              <span className="coder-diff-line-marker">
                                {isAdded ? '+' : isRemoved ? '−' : isChanged ? '~' : ' '}
                              </span>
                              <span className="coder-diff-line-content">
                                {isRemoved ? oldLine : newLine}
                              </span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                ) : (
                  /* Code Editor */
                  <div className="coder-code-editor">
                    {fileContentLoading ? (
                      <div className="coder-loading">
                        <span className="coder-spinner"></span>
                        Loading file...
                      </div>
                    ) : (
                      <div className="coder-code-content">
                        <div className="coder-line-numbers">
                          {fileContent.split('\n').map((_, i) => (
                            <span key={i} className="coder-line-num">{i + 1}</span>
                          ))}
                        </div>
                        <pre className="coder-code-text">
                          <code>{fileContent}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANE - AI Chat */}
            <div className="coder-pane coder-chat-pane">
              <div className="coder-chat-header">
                <h3>AI Assistant</h3>
                <div className="coder-chat-model">
                  <button 
                    className="coder-model-selector"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCoderAgentSelector(!showCoderAgentSelector)
                    }}
                  >
                    <span>{selectedAgent?.name || 'Select Agent'}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {showCoderAgentSelector && (
                    <div
                      className="coder-model-dropdown"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {allAgents.length === 0 ? (
                        <div className="coder-model-empty">No agents configured</div>
                      ) : (
                        allAgents.map(agent => (
                          <button
                            key={agent.id}
                            className={`coder-model-option ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              setSelectedAgent(agent)
                              setShowCoderAgentSelector(false)
                            }}
                          >
                            <span className="coder-model-option-name">{agent.name}</span>
                            <span className={`coder-model-option-badge ${agent.provider}`}>
                              {agent.provider === 'openrouter' ? 'openrouter' : agent.provider === 'lmstudio' ? 'lmstudio' : agent.mcpServerId ? 'mcp' : 'n8n'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="coder-chat-messages"
                ref={codeChatMessagesRef}
                onScroll={(e) => {
                  const el = e.currentTarget
                  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
                  setCodeChatAutoScroll(atBottom)
                }}
              >
                {codeMessages.length === 0 ? (
                  <div className="coder-chat-empty">
                    <div className="coder-chat-welcome">
                      <h4>How can I help?</h4>
                      <p>Ask me to analyze, modify, or create code in your repository.</p>
                    </div>
                    <div className="coder-chat-suggestions">
                      <button onClick={() => setCodeInput('/explain this repository')}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                          <path d="M12 17h.01"/>
                        </svg>
                        Explain repo structure
                      </button>
                      <button onClick={() => setCodeInput('/find security issues')}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        Find security issues
                      </button>
                      <button onClick={() => setCodeInput('/add tests for ')}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                        </svg>
                        Add tests
                      </button>
                    </div>
                  </div>
                ) : (
                  codeMessages.map((msg, i) => (
                    <div key={i} className={`coder-chat-message ${msg.role}`}>
                      <div className="coder-chat-message-header">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </div>
                      <div className="coder-chat-message-content">
                        {msg.role === 'assistant' && msg.plan ? (
                          <div className="coder-ai-plan">
                            <div className="coder-plan-header">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                              </svg>
                              Plan
                            </div>
                            <div className="coder-plan-steps">
                              {msg.plan.map((step, si) => (
                                <div key={si} className="coder-plan-step">
                                  <span className="coder-plan-step-num">{si + 1}</span>
                                  <span className="coder-plan-step-text">{step}</span>
                                </div>
                              ))}
                            </div>
                            {msg.filesToChange && msg.filesToChange.length > 0 && (
                              <div className="coder-plan-files">
                                <strong>Files to modify:</strong>
                                <ul>
                                  {msg.filesToChange.map((f, fi) => (
                                    <li key={fi}>{f}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div 
                            className="coder-message-text"
                            dangerouslySetInnerHTML={{ 
                              __html: typeof msg.content === 'string' 
                                ? msg.content.replace(/\n/g, '<br/>') 
                                : msg.content 
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {codeGenerating && (
                  <div className="coder-chat-message assistant generating">
                    <div className="coder-chat-message-header">AI Assistant</div>
                    <div className="coder-chat-message-content">
                      <div className="coder-typing-indicator">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={codeChatEndRef} />
              </div>

              {/* Chat Input */}
              <form 
                className="coder-chat-input-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCodeChat(codeInput)
                }}
              >
                <div className="coder-chat-input-wrapper">
                  <textarea
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Ask about code, use /commands..."
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleCodeChat(codeInput)
                      }
                    }}
                  />
                  <button 
                    type="submit" 
                    disabled={!codeInput.trim() || codeGenerating}
                    className="coder-send-btn"
                  >
                    {codeGenerating ? (
                      <span className="coder-spinner"></span>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                      </svg>
                    )}
                  </button>
                </div>
                <div className="coder-chat-hints">
                  <span>/explain</span>
                  <span>/modify</span>
                  <span>/add-file</span>
                  <span>/find</span>
                  <span>/commit</span>
                </div>
              </form>
            </div>
          </div>

          {/* Execution Steps Panel (shown when AI is working) */}
          {executionSteps.length > 0 && (
            <div className="coder-execution-panel">
              <div className="coder-execution-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                <span>Execution Progress</span>
              </div>
              <div className="coder-execution-steps">
                {executionSteps.map((step, i) => (
                  <div key={i} className={`coder-exec-step ${step.status}`}>
                    <span className="coder-exec-step-icon">
                      {step.status === 'running' && <span className="coder-spinner small"></span>}
                      {step.status === 'success' && '✓'}
                      {step.status === 'error' && '✗'}
                      {step.status === 'pending' && '○'}
                    </span>
                    <span className="coder-exec-step-text">{step.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modals */}
          {showVercelModal && (
            <div className="code-modal-overlay" onClick={() => setShowVercelModal(false)}>
              <div className="code-modal vercel-modal" onClick={(e) => e.stopPropagation()}>
                <div className="code-modal-header">
                  <h3>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M12 2L2 19.5h20L12 2z"/>
                    </svg>
                    Vercel Integration
                  </h3>
                  <button className="code-modal-close" onClick={() => setShowVercelModal(false)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <div className="code-modal-body">
                  {vercelConnected ? (
                    <div className="vercel-connected-info">
                      <p>Connected as {vercelUser?.username || vercelUser?.email}</p>
                      <button className="code-modal-btn danger" onClick={disconnectVercel}>
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="vercel-connect-form">
                      <p>Connect your Vercel account to deploy.</p>
                      <input
                        type="password"
                        placeholder="Vercel Token"
                        value={vercelToken}
                        onChange={(e) => setVercelToken(e.target.value)}
                      />
                      <button className="code-modal-btn primary" onClick={connectVercel}>
                        Connect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* OLD CODE PAGE - Hidden, kept for backward compatibility */}
        <div className={`code-page ${false ? 'slide-in' : 'slide-out'}`} style={{ display: 'none' }}>
          <div className={`code-page-layout ${showCodeChat ? '' : 'chat-collapsed'}`}>
            {/* Left Sidebar - Projects & Files */}
            <div className="code-sidebar">
              <div className="code-sidebar-header">
                <button className="code-back-btn" onClick={() => setShowCodePage(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <h2>Code</h2>
              </div>

              {/* Sidebar Tabs */}
              <div className="code-sidebar-tabs">
                <button
                  className={`code-sidebar-tab ${sidebarTab === 'code' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('code')}
                  title="Files & Projects"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                </button>
                <button
                  className={`code-sidebar-tab ${sidebarTab === 'supabase' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('supabase')}
                  title="Supabase"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
                  </svg>
                </button>
                <button
                  className={`code-sidebar-tab ${sidebarTab === 'git' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('git')}
                  title="Git"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.546 10.93L13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.658 2.66a1.838 1.838 0 1 1-1.103 1.033l-2.48-2.48v6.53a1.838 1.838 0 1 1-1.512-.065V8.805a1.838 1.838 0 0 1-.998-2.41L7.636 3.67.452 10.852a1.55 1.55 0 0 0 0 2.188l10.48 10.477a1.55 1.55 0 0 0 2.186 0l10.428-10.4a1.55 1.55 0 0 0 0-2.187z"/>
                  </svg>
                </button>
                <button
                  className={`code-sidebar-tab ${sidebarTab === 'vercel' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('vercel')}
                  title="Vercel"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 19.5h20L12 2z"/>
                  </svg>
                </button>
              </div>

              {/* Mode Toggle for Code Tab */}
              {sidebarTab === 'code' && (
                <div className="code-mode-toggle">
                  <button
                    className={`code-mode-btn ${codeEditorMode === 'local' ? 'active' : ''}`}
                    onClick={() => setCodeEditorMode('local')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Local
                  </button>
                  <button
                    className={`code-mode-btn ${codeEditorMode === 'github' ? 'active' : ''}`}
                    onClick={() => setCodeEditorMode('github')}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                  </button>
                </div>
              )}

              {/* CODE TAB CONTENT */}
              {sidebarTab === 'code' && (
                <>
                  {/* LOCAL MODE */}
                  {codeEditorMode === 'local' && (
                <>
                  {/* Local Projects List */}
                  <div className="code-projects-section">
                    <div className="code-projects-header">
                      <span>Projects</span>
                      <button
                        className="code-projects-add-btn"
                        onClick={() => setShowNewProjectModal(true)}
                        title="New Project"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </button>
                    </div>
                    <div className="code-projects-list">
                      {localProjects.length === 0 ? (
                        <div className="code-empty-state">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            <line x1="12" y1="11" x2="12" y2="17"/>
                            <line x1="9" y1="14" x2="15" y2="14"/>
                          </svg>
                          <p>No projects yet</p>
                          <button
                            className="code-empty-btn"
                            onClick={() => setShowNewProjectModal(true)}
                          >
                            Create Project
                          </button>
                        </div>
                      ) : (
                        localProjects.map(project => (
                          <div
                            key={project.id}
                            className={`code-project-item ${activeLocalProject?.id === project.id ? 'active' : ''}`}
                            onClick={() => selectLocalProject(project)}
                          >
                            <div className="code-project-icon">
                              {project.type === 'html' && <span className="project-type-badge html">HTML</span>}
                              {project.type === 'react' && <span className="project-type-badge react">React</span>}
                              {project.type === 'node' && <span className="project-type-badge node">Node</span>}
                              {project.type === 'python' && <span className="project-type-badge python">PY</span>}
                              {project.type === 'blank' && <span className="project-type-badge blank">...</span>}
                            </div>
                            <div className="code-project-info">
                              <span className="code-project-name">{project.name}</span>
                              <span className="code-project-date">
                                {new Date(project.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <button
                              className="code-project-delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteLocalProject(project)
                              }}
                              title="Delete project"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Local File Tree */}
                  {activeLocalProject && (
                    <div className="code-files-section">
                      <div className="code-files-header">
                        <div className="code-files-title">
                          <span>{activeLocalProject.name}</span>
                        </div>
                        <div className="code-files-actions">
                          <button
                            className="code-files-action-btn"
                            onClick={() => {
                              setNewItemParent('')
                              setNewItemName('')
                              setShowNewFileModal(true)
                            }}
                            title="New File"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="12" y1="18" x2="12" y2="12"/>
                              <line x1="9" y1="15" x2="15" y2="15"/>
                            </svg>
                          </button>
                          <button
                            className="code-files-action-btn"
                            onClick={() => {
                              setNewItemParent('')
                              setNewItemName('')
                              setShowNewFolderModal(true)
                            }}
                            title="New Folder"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                              <line x1="12" y1="11" x2="12" y2="17"/>
                              <line x1="9" y1="14" x2="15" y2="14"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="code-file-tree">
                        {(() => {
                          const projectData = localProjectFiles[activeLocalProject.id]
                          const files = projectData?.files || []
                          const expandedFolders = projectData?.expandedFolders || {}

                          const renderLocalFileTree = (items, depth = 0) => {
                            return items.map(file => (
                              <div key={file.path} className="file-tree-item-wrapper">
                                <div
                                  className={`file-tree-item ${openTabs.find(t => t.path === file.path && t.projectId === activeLocalProject.id) ? 'active' : ''} ${unsavedChanges[`${activeLocalProject.id}-${file.path}`] ? 'has-changes' : ''}`}
                                  style={{ paddingLeft: `${12 + depth * 16}px` }}
                                  onClick={() => {
                                    if (file.type === 'dir') {
                                      toggleLocalFolder(file.path)
                                    } else {
                                      openFileInTab(file, activeLocalProject.id)
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                    setContextMenuFile(file)
                                    setContextMenuPos({ x: e.clientX, y: e.clientY })
                                  }}
                                >
                                  <span className="file-tree-icon">
                                    {file.type === 'dir' ? (
                                      expandedFolders[file.path] ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                          <line x1="9" y1="14" x2="15" y2="14"/>
                                        </svg>
                                      ) : (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                        </svg>
                                      )
                                    ) : (
                                      (() => {
                                        const ext = file.name.split('.').pop()?.toLowerCase()
                                        if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return <span className="file-icon-text js">JS</span>
                                        if (['py'].includes(ext)) return <span className="file-icon-text py">PY</span>
                                        if (['html', 'htm'].includes(ext)) return <span className="file-icon-text html">{'<>'}</span>
                                        if (['css', 'scss'].includes(ext)) return <span className="file-icon-text css">#</span>
                                        if (['json'].includes(ext)) return <span className="file-icon-text json">{'{}'}</span>
                                        if (['md'].includes(ext)) return <span className="file-icon-text md">MD</span>
                                        return (
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                          </svg>
                                        )
                                      })()
                                    )}
                                  </span>
                                  <span className="file-tree-name">{file.name}</span>
                                  {unsavedChanges[`${activeLocalProject.id}-${file.path}`] && (
                                    <span className="file-tree-modified">M</span>
                                  )}
                                </div>
                                {file.type === 'dir' && expandedFolders[file.path] && (
                                  <div className="file-tree-children">
                                    {renderLocalFileTree(
                                      files.filter(f => {
                                        const parent = f.path.substring(0, f.path.lastIndexOf('/'))
                                        return parent === file.path
                                      }),
                                      depth + 1
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          }

                          // Get root level files
                          const rootFiles = files.filter(f => !f.path.includes('/'))
                          return renderLocalFileTree(buildFileTree(rootFiles))
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* GITHUB MODE */}
              {codeEditorMode === 'github' && (
                <>
                  {!githubConnected ? (
                    <div className="code-github-connect">
                      <div className="code-github-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </div>
                      <h3>Connect GitHub</h3>
                      <p>Connect your GitHub account to access, edit, and manage your repositories.</p>
                      <input
                        type="password"
                        className="code-github-token-input"
                        placeholder="Enter GitHub Personal Access Token"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                      />
                      <button className="code-github-connect-btn" onClick={connectGitHub}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        Connect to GitHub
                      </button>
                      <div className="code-github-help">
                        <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer">
                          Create a token with 'repo' scope →
                        </a>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* User Info */}
                      <div className="code-github-user">
                        <img src={githubUser?.avatar_url} alt={githubUser?.login} className="code-github-avatar" />
                        <div className="code-github-user-info">
                          <span className="code-github-username">{githubUser?.login}</span>
                          <span className="code-github-status">Connected</span>
                        </div>
                        <button className="code-github-disconnect" onClick={disconnectGitHub} title="Disconnect">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" y1="12" x2="9" y2="12"/>
                          </svg>
                        </button>
                      </div>

                      {/* Repository List */}
                      <div className="code-repos-section">
                        <div className="code-repos-header">
                          <span>Repositories</span>
                          <div className="code-repos-actions">
                            <button
                              className="code-repos-action-btn"
                              type="button"
                              onClick={() => {
                                setCreateRepoError('')
                                setShowCreateRepoModal(true)
                              }}
                              title="Create repository"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                              </svg>
                            </button>
                            <button className="code-repos-refresh" onClick={loadGitHubRepos} disabled={githubReposLoading} title="Refresh repositories">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={githubReposLoading ? 'spinning' : ''}>
                                <path d="M23 4v6h-6"/>
                                <path d="M1 20v-6h6"/>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="code-repos-list">
                          {githubReposLoading ? (
                            <div className="code-loading">
                              <div className="code-loading-spinner"></div>
                              <span>Loading repositories...</span>
                            </div>
                          ) : githubRepos.length === 0 ? (
                            <div className="code-empty">No repositories found</div>
                          ) : (
                            githubRepos.map(repo => (
                              <div
                                key={repo.id}
                                className={`code-repo-item ${selectedRepo?.id === repo.id ? 'active' : ''}`}
                                onClick={() => selectRepo(repo)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                </svg>
                                <div className="code-repo-info">
                                  <span className="code-repo-name">{repo.name}</span>
                                  <span className="code-repo-desc">{repo.description || 'No description'}</span>
                                </div>
                                {repo.private && (
                                  <span className="code-repo-private">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                    </svg>
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* File Tree */}
                      {selectedRepo && (
                        <div className="code-files-section">
                          <div className="code-files-header">
                            <div className="code-files-title">
                              <button className="code-repo-back" type="button" onClick={exitRepo} title="Back to all repositories">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M19 12H5"/>
                                  <path d="M12 19l-7-7 7-7"/>
                                </svg>
                              </button>
                              <span>{selectedRepo.name}</span>
                            </div>
                            <div className="code-files-actions">
                              <select
                                className="code-branch-select"
                                value={repoBranch}
                                onChange={(e) => {
                                  setRepoBranch(e.target.value)
                                  loadRepoFiles(selectedRepo.owner.login, selectedRepo.name, '', e.target.value)
                                }}
                              >
                                {repoBranches.map(b => (
                                  <option key={b} value={b}>{b}</option>
                                ))}
                          </select>
                          <button
                            className="code-files-action-btn"
                            type="button"
                            onClick={() => {
                              setGithubNewFileName('')
                              setGithubNewFileContent('')
                              setShowGithubNewFileModal(true)
                            }}
                            title="New file"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="12" y1="18" x2="12" y2="12"/>
                              <line x1="9" y1="15" x2="15" y2="15"/>
                            </svg>
                          </button>
                          <button
                            className="code-files-action-btn"
                            type="button"
                            onClick={() => {
                              if (!selectedRepo) {
                                showToast('Select a repository to preview')
                                return
                              }
                              openPreviewModal()
                            }}
                            title="Preview"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M15 3h6v6"/>
                              <path d="M9 21H3v-6"/>
                              <path d="M21 3l-7 7"/>
                              <path d="M3 21l7-7"/>
                            </svg>
                          </button>
                          <button
                            className="code-repo-delete"
                            type="button"
                            onClick={() => {
                              setDeleteRepoError('')
                              setDeleteRepoConfirm('')
                              setShowDeleteRepoModal(true)
                            }}
                            title="Delete repository"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="code-file-tree">
                        {repoFilesLoading && !repoFiles.length ? (
                          <div className="code-loading">
                            <div className="code-loading-spinner"></div>
                          </div>
                        ) : (
                          <FileTree 
                            files={repoFiles}
                            expandedFolders={expandedFolders}
                            selectedFile={selectedFile}
                            onToggleFolder={toggleFolder}
                            onSelectFile={(file) => {
                              if (file.type === 'file') {
                                openGithubTab(file)
                              }
                            }}
                            pendingChanges={pendingFileChanges}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
                </>
              )}
                </>
              )}

              {/* SUPABASE TAB CONTENT */}
              {sidebarTab === 'supabase' && (
                <div className="code-supabase-section">
                  <div className="code-section-header">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12v8.959a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.66z"/>
                    </svg>
                    <span>Supabase</span>
                  </div>
                  {supabaseConnected ? (
                    <div className="code-integration-connected">
                      <div className="code-integration-status">
                        <span className="status-dot connected" />
                        <span>Connected</span>
                      </div>

                      <div className="code-supabase-tables">
                        <div className="code-section-subheader">
                          <span>Tables</span>
                          <button onClick={loadSupabaseTables} className="refresh-btn" title="Refresh">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          </button>
                        </div>
                        {supabaseLoading ? (
                          <div className="code-loading-small">Loading...</div>
                        ) : supabaseTables.length === 0 ? (
                          <div className="code-empty-small">No tables found</div>
                        ) : (
                          <div className="code-table-list">
                            {supabaseTables.map(table => (
                              <div
                                key={table}
                                className={`code-table-item ${supabaseSelectedTable === table ? 'active' : ''}`}
                                onClick={() => loadSupabaseTableData(table)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                  <line x1="3" y1="9" x2="21" y2="9"/>
                                  <line x1="9" y1="21" x2="9" y2="9"/>
                                </svg>
                                <span>{table}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="code-supabase-actions">
                        <button
                          className="code-action-btn"
                          onClick={async () => {
                            if (supabaseSelectedTable) {
                              const code = generateSupabaseCode(supabaseSelectedTable, 'select')
                              // Use ClipboardItem for plain text (no formatting)
                              if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
                                const blob = new Blob([code], { type: 'text/plain' })
                                const item = new ClipboardItem({ 'text/plain': blob })
                                await navigator.clipboard.write([item])
                              } else {
                                await navigator.clipboard.writeText(code)
                              }
                              showToast('Code copied to clipboard')
                            }
                          }}
                          disabled={!supabaseSelectedTable}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          Copy Query Code
                        </button>
                      </div>

                      <button className="code-disconnect-btn" onClick={disconnectSupabase}>
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="code-integration-connect">
                      <p>Connect your Supabase project to access your database.</p>
                      <div className="code-input-group">
                        <label>Project URL</label>
                        <input
                          type="text"
                          placeholder="https://xxx.supabase.co"
                          value={supabaseUrl}
                          onChange={(e) => setSupabaseUrl(e.target.value)}
                        />
                      </div>
                      <div className="code-input-group">
                        <label>Anon Key</label>
                        <input
                          type="password"
                          placeholder="Enter anon key"
                          value={supabaseAnonKey}
                          onChange={(e) => setSupabaseAnonKey(e.target.value)}
                        />
                      </div>
                      <div className="code-input-group">
                        <label>Service Key (optional)</label>
                        <input
                          type="password"
                          placeholder="Enter service key for admin access"
                          value={supabaseServiceKey}
                          onChange={(e) => setSupabaseServiceKey(e.target.value)}
                        />
                      </div>
                      <button
                        className="code-connect-btn"
                        onClick={connectSupabase}
                        disabled={supabaseLoading || !supabaseUrl.trim() || !supabaseAnonKey.trim()}
                      >
                        {supabaseLoading ? 'Connecting...' : 'Connect to Supabase'}
                      </button>
                      <a
                        href="https://supabase.com/dashboard/project/_/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="code-help-link"
                      >
                        Get keys from Supabase Dashboard →
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* GIT TAB CONTENT */}
              {sidebarTab === 'git' && (
                <div className="code-git-section">
                  <div className="code-section-header">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.546 10.93L13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.658 2.66a1.838 1.838 0 1 1-1.103 1.033l-2.48-2.48v6.53a1.838 1.838 0 1 1-1.512-.065V8.805a1.838 1.838 0 0 1-.998-2.41L7.636 3.67.452 10.852a1.55 1.55 0 0 0 0 2.188l10.48 10.477a1.55 1.55 0 0 0 2.186 0l10.428-10.4a1.55 1.55 0 0 0 0-2.187z"/>
                    </svg>
                    <span>Git</span>
                  </div>

                  {!activeLocalProject ? (
                    <div className="code-empty-state">
                      <p>Select a project first</p>
                    </div>
                  ) : !gitInitialized ? (
                    <div className="code-git-init">
                      <p>Initialize a Git repository for this project</p>
                      <button className="code-connect-btn" onClick={initGitRepo}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.546 10.93L13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.658 2.66a1.838 1.838 0 1 1-1.103 1.033l-2.48-2.48v6.53a1.838 1.838 0 1 1-1.512-.065V8.805a1.838 1.838 0 0 1-.998-2.41L7.636 3.67.452 10.852a1.55 1.55 0 0 0 0 2.188l10.48 10.477a1.55 1.55 0 0 0 2.186 0l10.428-10.4a1.55 1.55 0 0 0 0-2.187z"/>
                        </svg>
                        Initialize Repository
                      </button>
                    </div>
                  ) : (
                    <div className="code-git-content">
                      {/* Branch Selector */}
                      <div className="code-git-branches">
                        <div className="code-section-subheader">
                          <span>Branch: {gitCurrentBranch}</span>
                        </div>
                        <div className="code-branch-list">
                          {gitBranches.map(branch => (
                            <div
                              key={branch}
                              className={`code-branch-item ${gitCurrentBranch === branch ? 'active' : ''}`}
                              onClick={() => switchGitBranch(branch)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="6" y1="3" x2="6" y2="15"/>
                                <circle cx="18" cy="6" r="3"/>
                                <circle cx="6" cy="18" r="3"/>
                                <path d="M18 9a9 9 0 0 1-9 9"/>
                              </svg>
                              <span>{branch}</span>
                              {branch !== 'main' && (
                                <button
                                  className="branch-delete-btn"
                                  onClick={(e) => { e.stopPropagation(); deleteGitBranch(branch); }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="code-new-branch">
                          <input
                            type="text"
                            placeholder="New branch name"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                createGitBranch(e.target.value)
                                e.target.value = ''
                              }
                            }}
                          />
                        </div>
                      </div>

                      {/* Staged Files */}
                      <div className="code-git-staging">
                        <div className="code-section-subheader">
                          <span>Changes</span>
                          <button onClick={stageAllFiles} className="stage-all-btn">Stage All</button>
                        </div>
                        <div className="code-staged-files">
                          {Object.keys(localProjectFiles[activeLocalProject?.id]?.fileContents || {}).map(file => (
                            <div
                              key={file}
                              className={`code-file-item ${gitStagedFiles.includes(file) ? 'staged' : ''}`}
                              onClick={() => stageFile(file)}
                            >
                              <input
                                type="checkbox"
                                checked={gitStagedFiles.includes(file)}
                                onChange={() => stageFile(file)}
                              />
                              <span>{file}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Commit */}
                      <div className="code-git-commit">
                        <textarea
                          placeholder="Commit message..."
                          value={gitCommitMessage}
                          onChange={(e) => setGitCommitMessage(e.target.value)}
                          rows={2}
                        />
                        <button
                          className="code-commit-btn"
                          onClick={commitChanges}
                          disabled={gitStagedFiles.length === 0 || !gitCommitMessage.trim()}
                        >
                          Commit ({gitStagedFiles.length} files)
                        </button>
                      </div>

                      {/* Recent Commits */}
                      <div className="code-git-history">
                        <div className="code-section-subheader">
                          <span>Recent Commits</span>
                        </div>
                        <div className="code-commit-list">
                          {gitCommits.slice(0, 5).map(commit => (
                            <div key={commit.id} className="code-commit-item">
                              <div className="commit-message">{commit.message}</div>
                              <div className="commit-meta">
                                {new Date(commit.date).toLocaleDateString()} • {commit.files?.length || 0} files
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Push to GitHub */}
                      <div className="code-git-push">
                        <button className="code-action-btn" onClick={pushToGitHub}>
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                          </svg>
                          Push to GitHub
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VERCEL TAB CONTENT */}
              {sidebarTab === 'vercel' && (
                <div className="code-vercel-section">
                <div className="code-vercel-header">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M12 2L2 19.5h20L12 2z"/>
                  </svg>
                  <span>Vercel</span>
                </div>
                {vercelConnected ? (
                  <div className="code-vercel-connected">
                    <div className="code-vercel-user">
                      <span className="code-vercel-username">{vercelUser?.username || vercelUser?.email}</span>
                      <span className="code-vercel-status">Connected</span>
                    </div>
                    <div className="code-vercel-actions">
                      <button
                        className="code-vercel-action-btn"
                        onClick={() => setShowVercelDeployModal(true)}
                        disabled={!activeLocalProject}
                        title={activeLocalProject ? 'Deploy to Vercel' : 'Select a project to deploy'}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Deploy
                      </button>
                      <button
                        className="code-vercel-action-btn"
                        onClick={() => { setShowVercelDeployments(true); loadVercelDeployments(); }}
                        title="View Deployments"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6"/>
                          <line x1="8" y1="12" x2="21" y2="12"/>
                          <line x1="8" y1="18" x2="21" y2="18"/>
                          <line x1="3" y1="6" x2="3.01" y2="6"/>
                          <line x1="3" y1="12" x2="3.01" y2="12"/>
                          <line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                        Deployments
                      </button>
                    </div>
                    <button
                      className="code-vercel-disconnect"
                      onClick={disconnectVercel}
                      title="Disconnect from Vercel"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="code-vercel-connect">
                    <p>Deploy your projects to Vercel</p>
                    <input
                      type="password"
                      className="code-vercel-token-input"
                      placeholder="Enter Vercel Token"
                      value={vercelToken}
                      onChange={(e) => setVercelToken(e.target.value)}
                    />
                    <button
                      className="code-vercel-connect-btn"
                      onClick={connectVercel}
                      disabled={vercelLoading || !vercelToken.trim()}
                    >
                      {vercelLoading ? (
                        <>
                          <span className="btn-spinner small" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M12 2L2 19.5h20L12 2z"/>
                          </svg>
                          Connect Vercel
                        </>
                      )}
                    </button>
                    <a
                      href="https://vercel.com/account/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="code-vercel-help"
                    >
                      Get token from Vercel →
                    </a>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Main Content Area */}
            <div className={`code-main ${showPreviewPanel ? 'with-preview' : ''}`}>
              {/* Toolbar */}
              <div className="code-toolbar">
                <div className="code-toolbar-left">
                  {codeEditorMode === 'local' && activeLocalProject && (
                    <>
                      <button
                        className="code-toolbar-btn"
                        onClick={saveCurrentFile}
                        disabled={!activeTabId || !unsavedChanges[activeTabId]}
                        title="Save (Cmd+S)"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                          <polyline points="17 21 17 13 7 13 7 21"/>
                          <polyline points="7 3 7 8 15 8"/>
                        </svg>
                        Save
                      </button>
                      <button
                        className="code-toolbar-btn primary"
                        onClick={runLocalPreview}
                        title="Run Preview"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Run
                      </button>
                      <button
                        className="code-toolbar-btn"
                        onClick={openPreviewModal}
                        title="Fullscreen Preview"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 3h6v6"/>
                          <path d="M9 21H3v-6"/>
                          <path d="M21 3l-7 7"/>
                          <path d="M3 21l7-7"/>
                        </svg>
                        Fullscreen
                      </button>
                    </>
                  )}
                  {codeEditorMode === 'github' && selectedRepo && (
                    <button
                      className="code-toolbar-btn"
                      onClick={openPreviewModal}
                      title="Fullscreen Preview"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 3h6v6"/>
                        <path d="M9 21H3v-6"/>
                        <path d="M21 3l-7 7"/>
                        <path d="M3 21l7-7"/>
                      </svg>
                      Preview
                    </button>
                  )}
                </div>
                <div className="code-toolbar-right">
                  <button
                    className="code-toolbar-btn"
                    onClick={() => {
                      if (codeEditorMode === 'local' && !activeLocalProject) {
                        showToast('Select a project to preview')
                        return
                      }
                      if (codeEditorMode === 'github' && !selectedRepo) {
                        showToast('Select a repository to preview')
                        return
                      }
                      openPreviewModal()
                    }}
                    title="Fullscreen Preview"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h6v6"/>
                      <path d="M9 21H3v-6"/>
                      <path d="M21 3l-7 7"/>
                      <path d="M3 21l7-7"/>
                    </svg>
                    Preview
                  </button>
                  <button
                    className={`code-toolbar-btn ${showCodeChat ? 'active' : ''}`}
                    onClick={() => setShowCodeChat(!showCodeChat)}
                    title="Toggle AI Chat"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    Chat
                    {codeMessages.length > 0 && (
                      <span className="code-chat-badge">{codeMessages.length}</span>
                    )}
                  </button>
                  {codeEditorMode === 'local' && activeLocalProject && (
                    <>
                      <button
                        className={`code-toolbar-btn ${showConsole ? 'active' : ''}`}
                        onClick={() => setShowConsole(!showConsole)}
                        title="Toggle Console"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="4 17 10 11 4 5"/>
                          <line x1="12" y1="19" x2="20" y2="19"/>
                        </svg>
                        Console
                      </button>
                      <div className="code-deploy-container">
                        <button
                          className="code-toolbar-btn"
                          onClick={() => setShowDeployMenu(!showDeployMenu)}
                          title="Deploy Options"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          Deploy
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="dropdown-chevron">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                        {showDeployMenu && (
                          <div className="code-deploy-dropdown">
                            <div className="deploy-dropdown-section">
                              <span className="deploy-dropdown-label">Vercel</span>
                              {vercelConnected ? (
                                <>
                                  <button onClick={() => { setShowVercelDeployModal(true); setShowDeployMenu(false); }}>
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 2L2 19.5h20L12 2z"/>
                                    </svg>
                                    Deploy to Vercel
                                  </button>
                                  <button onClick={() => { setShowVercelDeployments(true); loadVercelDeployments(); setShowDeployMenu(false); }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <line x1="8" y1="6" x2="21" y2="6"/>
                                      <line x1="8" y1="12" x2="21" y2="12"/>
                                      <line x1="8" y1="18" x2="21" y2="18"/>
                                      <line x1="3" y1="6" x2="3.01" y2="6"/>
                                      <line x1="3" y1="12" x2="3.01" y2="12"/>
                                      <line x1="3" y1="18" x2="3.01" y2="18"/>
                                    </svg>
                                    View Deployments
                                  </button>
                                  <button onClick={() => { setShowVercelModal(true); setShowDeployMenu(false); }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="3"/>
                                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                                    </svg>
                                    Vercel Settings
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => { setShowVercelModal(true); setShowDeployMenu(false); }}>
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L2 19.5h20L12 2z"/>
                                  </svg>
                                  Connect Vercel
                                </button>
                              )}
                            </div>
                            <div className="deploy-dropdown-divider" />
                            <div className="deploy-dropdown-section">
                              <span className="deploy-dropdown-label">Export</span>
                              <button onClick={exportProjectAsZip}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="7 10 12 15 17 10"/>
                                  <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                Export Files
                              </button>
                              <button onClick={() => { showToast('Copy to clipboard coming soon'); setShowDeployMenu(false); }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                                Copy to Clipboard
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tab Bar */}
              {codeEditorMode === 'local' && openTabs.length > 0 && (
                <div className="code-tabs-bar">
                  {openTabs.map(tab => (
                    <div
                      key={tab.id}
                      className={`code-tab ${activeTabId === tab.id ? 'active' : ''} ${unsavedChanges[tab.id] ? 'unsaved' : ''}`}
                      onClick={() => switchToTab(tab)}
                    >
                      <span className="code-tab-name">
                        {unsavedChanges[tab.id] && <span className="code-tab-dot" />}
                        {tab.name}
                      </span>
                      <button
                        className="code-tab-close"
                        onClick={(e) => closeTab(tab.id, e)}
                        title="Close"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {codeEditorMode === 'github' && githubOpenTabs.length > 0 && (
                <div className="code-tabs-bar">
                  {githubOpenTabs.map(tab => (
                    <div
                      key={tab.id}
                      className={`code-tab ${githubActiveTabId === tab.id ? 'active' : ''}`}
                      onClick={() => switchGithubTab(tab)}
                    >
                      <span className="code-tab-name">{tab.name}</span>
                      <button
                        className="code-tab-close"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeGithubTab(tab.id)
                        }}
                        title="Close"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Editor + Preview Container */}
              <div className="code-editor-preview-container">
                {/* File Editor */}
                <div className="code-editor-section">
                  {codeEditorMode === 'local' ? (
                    // LOCAL MODE EDITOR
                    activeTabId ? (
                      <div className="code-editor-wrapper">
                        <div ref={editorLineNumbersRef} className="code-editor-line-numbers">
                          {editorContent.split('\n').map((_, i) => (
                            <div key={i} className="line-number">{i + 1}</div>
                          ))}
                        </div>
                        <pre className="code-editor-highlight" ref={editorHighlightRef}>
                          <code dangerouslySetInnerHTML={{ __html: highlightedEditorHtml || '&nbsp;' }} />
                        </pre>
                        <textarea
                          ref={editorRef}
                          className="code-editor-textarea"
                          value={editorContent}
                          onChange={handleEditorChange}
                          onScroll={(e) => {
                            if (editorLineNumbersRef.current) {
                              editorLineNumbersRef.current.scrollTop = e.target.scrollTop
                            }
                            if (editorHighlightRef.current) {
                              editorHighlightRef.current.scrollTop = e.target.scrollTop
                              editorHighlightRef.current.scrollLeft = e.target.scrollLeft
                            }
                          }}
                          spellCheck="false"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                        />
                      </div>
                    ) : (
                      <div className="code-editor-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <polyline points="16 18 22 12 16 6"/>
                          <polyline points="8 6 2 12 8 18"/>
                        </svg>
                        <h3>{activeLocalProject ? 'Select a file to edit' : 'Create or select a project'}</h3>
                        <p>{activeLocalProject ? 'Choose a file from the file tree to start editing' : 'Click "New Project" in the sidebar to get started'}</p>
                      </div>
                    )
                  ) : (
                    // GITHUB MODE EDITOR
                    selectedFile ? (
                      <>
                        <div className="code-editor-header github-editor-header">
                          <div className="code-editor-path">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <span>{selectedFile.path}</span>
                          </div>
                          <div className="github-editor-actions">
                            {githubFileEditing ? (
                              <>
                                <button
                                  className="code-toolbar-btn"
                                  onClick={cancelGithubEdit}
                                  disabled={githubFileSaving}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="code-toolbar-btn primary"
                                  onClick={saveGithubFile}
                                  disabled={githubFileSaving}
                                >
                                  {githubFileSaving ? 'Saving...' : 'Commit'}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="code-toolbar-btn"
                                  onClick={startGithubEdit}
                                  title="Edit file"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                  Edit
                                </button>
                                <button
                                  className="code-toolbar-btn danger"
                                  onClick={() => {
                                    setDeleteFileTarget({
                                      path: selectedFile.path,
                                      sha: selectedFile.sha,
                                      name: selectedFile.name
                                    })
                                    setDeleteFileError('')
                                    setShowDeleteFileModal(true)
                                  }}
                                  title="Delete file"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  </svg>
                                </button>
                              </>
                            )}
                            {pendingFileChanges[selectedFile.path] && (
                              <button
                                className="code-apply-change-btn"
                                onClick={() => applyPendingChange(selectedFile.path)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Apply AI Changes
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="code-editor-content">
                          {fileContentLoading ? (
                            <div className="code-loading">
                              <div className="code-loading-spinner"></div>
                              <span>Loading file...</span>
                            </div>
                          ) : githubFileEditing ? (
                            <div className="code-editor-wrapper">
                              <div ref={githubEditorLineNumbersRef} className="code-editor-line-numbers">
                                {githubEditContent.split('\n').map((_, i) => (
                                  <div key={i} className="line-number">{i + 1}</div>
                                ))}
                              </div>
                              <pre className="code-editor-highlight" ref={githubEditorHighlightRef}>
                                <code dangerouslySetInnerHTML={{ __html: highlightedGithubEditHtml || '&nbsp;' }} />
                              </pre>
                              <textarea
                                className="code-editor-textarea"
                                value={githubEditContent}
                                onChange={(e) => setGithubEditContent(e.target.value)}
                                onScroll={(e) => {
                                  if (githubEditorLineNumbersRef.current) {
                                    githubEditorLineNumbersRef.current.scrollTop = e.target.scrollTop
                                  }
                                  if (githubEditorHighlightRef.current) {
                                    githubEditorHighlightRef.current.scrollTop = e.target.scrollTop
                                    githubEditorHighlightRef.current.scrollLeft = e.target.scrollLeft
                                  }
                                }}
                                spellCheck="false"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                              />
                            </div>
                          ) : (
                            <pre className="code-file-content">
                              <code dangerouslySetInnerHTML={{
                                __html: highlightCode(
                                  pendingFileChanges[selectedFile.path]?.content || fileContent,
                                  selectedFile.name.split('.').pop()
                                )
                              }} />
                            </pre>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="code-editor-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <polyline points="16 18 22 12 16 6"/>
                          <polyline points="8 6 2 12 8 18"/>
                        </svg>
                        <h3>Select a file to view</h3>
                        <p>Choose a file from the repository to view and edit its contents</p>
                      </div>
                    )
                  )}
                </div>

                {/* Preview Panel */}
                {showPreviewPanel && (
                  <div className="code-preview-panel">
                    <div className="code-preview-header">
                      <span>Preview</span>
                      <button
                        className="code-preview-close"
                        onClick={() => setShowPreviewPanel(false)}
                        title="Close Preview"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                    <iframe
                      ref={previewIframeRef}
                      className="code-preview-iframe"
                      srcDoc={previewContent}
                      sandbox="allow-scripts allow-modals"
                      title="Preview"
                    />
                  </div>
                )}
              </div>

              {/* Console Panel */}
              {showConsole && (
                <div className="code-console-panel">
                  <div className="code-console-header">
                    <div className="code-console-title">
                      <span>Console</span>
                      <div className="code-console-tabs">
                        <button
                          type="button"
                          className={consoleTab === 'preview' ? 'active' : ''}
                          onClick={() => setConsoleTab('preview')}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className={consoleTab === 'terminal' ? 'active' : ''}
                          onClick={() => setConsoleTab('terminal')}
                        >
                          Terminal
                        </button>
                      </div>
                    </div>
                    <div className="code-console-actions">
                      {consoleTab === 'terminal' && terminalStatus !== 'idle' && (
                        <span className="code-console-status">{terminalStatus}</span>
                      )}
                      <button
                        onClick={() => {
                          if (consoleTab === 'terminal') {
                            setTerminalOutput([])
                          } else {
                            setConsoleOutput([])
                          }
                        }}
                        title="Clear Console"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                      <button onClick={() => setShowConsole(false)} title="Close Console">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  {consoleTab === 'preview' ? (
                    <div className="code-console-output">
                      {consoleOutput.length === 0 ? (
                        <div className="code-console-empty">No output yet. Run your code to see results.</div>
                      ) : (
                        consoleOutput.map((entry, i) => (
                          <div key={i} className={`code-console-entry ${entry.level}`}>
                            <span className="console-prefix">
                              {entry.level === 'error' ? '✕' : entry.level === 'warn' ? '⚠' : '›'}
                            </span>
                            {entry.message}
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="code-terminal-panel">
                      <div className="code-console-output code-terminal-output" ref={terminalOutputRef}>
                        {terminalOutput.length === 0 ? (
                          <div className="code-console-empty">Type a command to run in the project container.</div>
                        ) : (
                          terminalOutput.map((entry, i) => (
                            <div key={i} className={`code-console-entry ${entry.kind}`}>
                              <span className="console-prefix">
                                {entry.kind === 'error' ? '✕' : entry.kind === 'info' ? '•' : entry.kind === 'command' ? '$' : '›'}
                              </span>
                              <pre>{entry.text}</pre>
                            </div>
                          ))
                        )}
                      </div>
                      {terminalError && (
                        <div className="code-terminal-error">{terminalError}</div>
                      )}
                      <div className="code-terminal-input-row">
                        <span className="code-terminal-prompt">{terminalCwd} $</span>
                        <input
                          type="text"
                          value={terminalInput}
                          onChange={(e) => setTerminalInput(e.target.value)}
                          onKeyDown={handleTerminalKeyDown}
                          placeholder="npm install"
                        />
                        <button type="button" onClick={() => handleTerminalCommand(terminalInput)}>
                          Run
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Right Chat Sidebar - Cursor Style */}
            <div className="code-chat-sidebar">
              <div className="code-chat-sidebar-header">
                <h3>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  AI Assistant
                </h3>
                <div className="code-chat-sidebar-actions">
                  <button
                    onClick={() => setCodeMessages([])}
                    title="Clear Chat"
                    disabled={codeMessages.length === 0}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                  <button onClick={() => setShowCodeChat(false)} title="Hide Chat Panel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>

              <div className="code-chat-target">
                {codeEditorMode === 'local' ? (
                  activeLocalProject ? (
                    <span className="code-chat-target-value">Target: {activeLocalProject.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="code-chat-target-action"
                      onClick={() => setShowNewProjectModal(true)}
                    >
                      Create a project to start generating files
                    </button>
                  )
                ) : (
                  selectedRepo ? (
                    <span className="code-chat-target-value">Target: {selectedRepo.full_name}</span>
                  ) : (
                    <span className="code-chat-target-empty">Select a repo in the left panel to apply code</span>
                  )
                )}
              </div>

              <div
                className="code-chat-sidebar-messages"
                ref={codeChatSidebarRef}
                onScroll={(e) => {
                  const el = e.currentTarget
                  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
                  setCodeChatAutoScroll(atBottom)
                }}
              >
                {codeMessages.length === 0 ? (
                  <div className="code-chat-sidebar-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h4>Ask about your code</h4>
                    <p>Get help with debugging, writing new features, or understanding existing code.</p>
                  </div>
                ) : (
                  codeMessages.map((msg, i) => (
                    <div key={i} className={`code-chat-sidebar-message ${msg.role}`}>
                      <div className="code-chat-sidebar-message-header">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </div>
                      <div
                        className="code-chat-sidebar-message-content"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                      />
                    </div>
                  ))
                )}
                {codeGenerating && (
                  <div className="code-chat-sidebar-message assistant">
                    <div className="code-chat-sidebar-message-header">AI Assistant</div>
                    <div className="code-chat-sidebar-typing">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
                <div ref={codeChatEndRef} />
              </div>

              <div className="code-chat-sidebar-input">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleCodeChat(codeInput)
                  }}
                >
                  <ChatTextarea
                    externalValue={codeInput}
                    onValueChange={setCodeInput}
                    onSubmit={handleCodeChat}
                    placeholder={codeEditorMode === 'local'
                      ? (activeLocalProject ? "Ask anything about your code..." : "Create a project to get started...")
                      : (selectedRepo ? "Ask anything about this repo..." : "Connect a repo to get started...")}
                    disabled={codeGenerating}
                    userMessages={codeUserMessagesForHistory}
                  />
                  <div className="code-chat-sidebar-input-actions">
                    <div className="code-chat-sidebar-input-left">
                      <button
                        type="button"
                        className="model-selector-mini"
                        onClick={() => setShowAgentSelector(!showAgentSelector)}
                      >
                        <span>{selectedAgent ? selectedAgent.name : 'Select Agent'}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {showAgentSelector && (
                        <div className="model-dropdown" style={{ bottom: '100%', top: 'auto', marginBottom: '4px' }}>
                          {allAgents.map(agent => (
                            <button
                              key={agent.id}
                              type="button"
                              className={`model-option ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedAgent(agent)
                                setShowAgentSelector(false)
                              }}
                            >
                              <span className="model-option-name">{agent.name}</span>
                              <span className="model-option-badge">
                                {agent.provider === 'openrouter' ? 'openrouter' : agent.provider === 'lmstudio' ? 'lmstudio' : agent.provider === 'mcp' ? 'mcp' : 'n8n'}
                              </span>
                            </button>
                          ))}
                          {allAgents.length === 0 && (
                            <div className="model-dropdown-empty">No agents available</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="code-chat-sidebar-input-right">
                      <button
                        type={codeGenerating ? 'button' : 'submit'}
                        onClick={codeGenerating ? () => setCodeGenerating(false) : undefined}
                        disabled={!codeInput.trim() && !codeGenerating}
                        className={`send-btn-sidebar ${codeGenerating ? 'stop' : ''}`}
                      >
                        {codeGenerating ? (
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="2"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
                <p className="disclaimer-mini">AI can make mistakes. Verify important info.</p>
              </div>
            </div>

            {/* Toggle button when chat is hidden */}
            {!showCodeChat && (
              <button
                className="code-chat-toggle"
                onClick={() => setShowCodeChat(true)}
                title="Open AI Chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            )}

            {/* Context Menu for Files */}
            {contextMenuFile && (
              <div
                className="code-context-menu"
                style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
              >
                <button onClick={() => {
                  setRenameValue(contextMenuFile.name)
                  setShowRenameModal(true)
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Rename
                </button>
                <button onClick={() => deleteLocalFile(contextMenuFile)} className="danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Delete
                </button>
                {contextMenuFile.type === 'dir' && (
                  <>
                    <div className="context-menu-divider" />
                    <button onClick={() => {
                      setNewItemParent(contextMenuFile.path)
                      setNewItemName('')
                      setShowNewFileModal(true)
                      setContextMenuFile(null)
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                      New File Here
                    </button>
                    <button onClick={() => {
                      setNewItemParent(contextMenuFile.path)
                      setNewItemName('')
                      setShowNewFolderModal(true)
                      setContextMenuFile(null)
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        <line x1="12" y1="11" x2="12" y2="17"/>
                        <line x1="9" y1="14" x2="15" y2="14"/>
                      </svg>
                      New Folder Here
                    </button>
                  </>
                )}
              </div>
            )}

            {/* New Project Modal */}
            {showNewProjectModal && (
              <div className="code-modal-overlay" onClick={() => setShowNewProjectModal(false)}>
                <div className="code-modal" onClick={e => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>New Project</h3>
                    <button className="code-modal-close" onClick={() => setShowNewProjectModal(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    <label className="code-modal-label">Project Name</label>
                    <input
                      className="code-modal-input"
                      value={newLocalProjectName}
                      onChange={(e) => setNewLocalProjectName(e.target.value)}
                      placeholder="my-awesome-project"
                      autoFocus
                    />
                    <label className="code-modal-label">Project Type</label>
                    <div className="code-project-type-grid">
                      {[
                        { type: 'html', label: 'HTML/CSS/JS', icon: '<>' },
                        { type: 'react', label: 'React', icon: 'R' },
                        { type: 'node', label: 'Node.js', icon: 'N' },
                        { type: 'python', label: 'Python', icon: 'PY' },
                        { type: 'blank', label: 'Blank', icon: '...' }
                      ].map(({ type, label, icon }) => (
                        <button
                          key={type}
                          className={`code-project-type-btn ${newLocalProjectType === type ? 'active' : ''}`}
                          onClick={() => setNewLocalProjectType(type)}
                        >
                          <span className={`project-type-icon ${type}`}>{icon}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="code-modal-actions">
                    <button className="code-modal-btn" onClick={() => setShowNewProjectModal(false)}>Cancel</button>
                    <button
                      className="code-modal-btn primary"
                      onClick={createLocalProject}
                      disabled={!newLocalProjectName.trim()}
                    >
                      Create Project
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* New File Modal */}
            {showNewFileModal && (
              <div className="code-modal-overlay" onClick={() => setShowNewFileModal(false)}>
                <div className="code-modal" onClick={e => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>New File</h3>
                    <button className="code-modal-close" onClick={() => setShowNewFileModal(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    <label className="code-modal-label">File Name</label>
                    <input
                      className="code-modal-input"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="example.js"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') createNewFile() }}
                    />
                    {newItemParent && (
                      <p className="code-modal-hint">Location: {newItemParent}/</p>
                    )}
                  </div>
                  <div className="code-modal-actions">
                    <button className="code-modal-btn" onClick={() => setShowNewFileModal(false)}>Cancel</button>
                    <button
                      className="code-modal-btn primary"
                      onClick={createNewFile}
                      disabled={!newItemName.trim()}
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* New Folder Modal */}
            {showNewFolderModal && (
              <div className="code-modal-overlay" onClick={() => setShowNewFolderModal(false)}>
                <div className="code-modal" onClick={e => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>New Folder</h3>
                    <button className="code-modal-close" onClick={() => setShowNewFolderModal(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    <label className="code-modal-label">Folder Name</label>
                    <input
                      className="code-modal-input"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="components"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') createNewFolder() }}
                    />
                    {newItemParent && (
                      <p className="code-modal-hint">Location: {newItemParent}/</p>
                    )}
                  </div>
                  <div className="code-modal-actions">
                    <button className="code-modal-btn" onClick={() => setShowNewFolderModal(false)}>Cancel</button>
                    <button
                      className="code-modal-btn primary"
                      onClick={createNewFolder}
                      disabled={!newItemName.trim()}
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Rename Modal */}
            {showRenameModal && (
              <div className="code-modal-overlay" onClick={() => setShowRenameModal(false)}>
                <div className="code-modal" onClick={e => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>Rename</h3>
                    <button className="code-modal-close" onClick={() => setShowRenameModal(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    <label className="code-modal-label">New Name</label>
                    <input
                      className="code-modal-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') renameLocalFile() }}
                    />
                  </div>
                  <div className="code-modal-actions">
                    <button className="code-modal-btn" onClick={() => setShowRenameModal(false)}>Cancel</button>
                    <button
                      className="code-modal-btn primary"
                      onClick={renameLocalFile}
                      disabled={!renameValue.trim() || renameValue === contextMenuFile?.name}
                    >
                      Rename
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pending Changes Panel */}
            {Object.keys(pendingFileChanges).length > 0 && (
              <div className="code-pending-panel">
                <div className="code-pending-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <span>Pending Changes ({Object.keys(pendingFileChanges).length})</span>
                  <button
                    className="code-pending-apply-all"
                    onClick={applyAllPendingChanges}
                    type="button"
                    title="Apply all to GitHub"
                    disabled={!selectedRepo}
                  >
                    Apply all
                  </button>
                </div>
                <div className="code-pending-list">
                  {Object.entries(pendingFileChanges).map(([path, change]) => (
                    <div key={path} className="code-pending-item">
                      <span className="code-pending-path">{path}</span>
                      <div className="code-pending-actions">
                        <button 
                          className="code-pending-apply"
                          onClick={() => applyPendingChange(path)}
                          title="Apply to GitHub"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </button>
                        <button 
                          className="code-pending-discard"
                          onClick={() => {
                            setPendingFileChanges(prev => {
                              const next = { ...prev }
                              delete next[path]
                              return next
                            })
                          }}
                          title="Discard"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vercel Settings Modal */}
            {showVercelModal && (
              <div className="code-modal-overlay" onClick={() => setShowVercelModal(false)}>
                <div className="code-modal vercel-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M12 2L2 19.5h20L12 2z"/>
                      </svg>
                      Vercel Integration
                    </h3>
                    <button className="code-modal-close" onClick={() => setShowVercelModal(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    {vercelConnected ? (
                      <div className="vercel-connected-info">
                        <div className="vercel-user-badge">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          <div>
                            <strong>{vercelUser?.username || vercelUser?.email}</strong>
                            <span>Connected</span>
                          </div>
                        </div>
                        <div className="vercel-projects-summary">
                          <span>{vercelProjects.length} Projects</span>
                        </div>
                        <button
                          className="code-modal-btn danger"
                          onClick={() => { disconnectVercel(); setShowVercelModal(false); }}
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="vercel-connect-form">
                        <p>Connect your Vercel account to deploy projects directly from the editor.</p>
                        <a
                          href="https://vercel.com/account/tokens"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="vercel-token-link"
                        >
                          Get your token from Vercel Settings
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </a>
                        <label>Vercel Token</label>
                        <input
                          type="password"
                          className="code-modal-input"
                          value={vercelToken}
                          onChange={(e) => setVercelToken(e.target.value)}
                          placeholder="Enter your Vercel token"
                        />
                        <button
                          className="code-modal-btn primary"
                          onClick={connectVercel}
                          disabled={vercelLoading || !vercelToken.trim()}
                        >
                          {vercelLoading ? 'Connecting...' : 'Connect to Vercel'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Vercel Deploy Modal */}
            {showVercelDeployModal && (
              <div className="code-modal-overlay" onClick={() => setShowVercelDeployModal(false)}>
                <div className="code-modal vercel-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M12 2L2 19.5h20L12 2z"/>
                      </svg>
                      Deploy to Vercel
                    </h3>
                    <button className="code-modal-close" onClick={() => setShowVercelDeployModal(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    <div className="vercel-deploy-form">
                      <div className="vercel-deploy-project-info">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>{activeLocalProject?.name || 'No project selected'}</span>
                      </div>
                      <label>Deployment Name (optional)</label>
                      <input
                        type="text"
                        className="code-modal-input"
                        value={vercelDeployName}
                        onChange={(e) => setVercelDeployName(e.target.value)}
                        placeholder={activeLocalProject?.name?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'my-project'}
                      />
                      <p className="vercel-deploy-hint">
                        Your project will be deployed to: <code>{(vercelDeployName || activeLocalProject?.name || 'my-project').toLowerCase().replace(/[^a-z0-9-]/g, '-')}.vercel.app</code>
                      </p>
                    </div>
                  </div>
                  <div className="code-modal-actions">
                    <button
                      className="code-modal-btn"
                      onClick={() => setShowVercelDeployModal(false)}
                      disabled={vercelDeploying}
                    >
                      Cancel
                    </button>
                    <button
                      className="code-modal-btn primary"
                      onClick={deployToVercel}
                      disabled={vercelDeploying || !activeLocalProject}
                    >
                      {vercelDeploying ? (
                        <>
                          <span className="btn-spinner" />
                          Deploying...
                        </>
                      ) : (
                        'Deploy'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Vercel Deployments Modal */}
            {showVercelDeployments && (
              <div className="code-modal-overlay" onClick={() => setShowVercelDeployments(false)}>
                <div className="code-modal vercel-modal vercel-deployments-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="code-modal-header">
                    <h3>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M12 2L2 19.5h20L12 2z"/>
                      </svg>
                      Vercel Deployments
                    </h3>
                    <button className="code-modal-close" onClick={() => setShowVercelDeployments(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="code-modal-body">
                    {vercelDeploymentsLoading ? (
                      <div className="vercel-loading">
                        <span className="btn-spinner" />
                        Loading deployments...
                      </div>
                    ) : vercelDeployments.length === 0 ? (
                      <div className="vercel-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 2L2 19.5h20L12 2z"/>
                        </svg>
                        <p>No deployments found</p>
                      </div>
                    ) : (
                      <div className="vercel-deployments-list">
                        {vercelDeployments.map((deployment) => (
                          <div key={deployment.uid} className="vercel-deployment-item">
                            <div className="vercel-deployment-info">
                              <div className="vercel-deployment-name">
                                <span className={`vercel-deployment-status ${deployment.state}`} title={deployment.state}>
                                  {deployment.state === 'READY' && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  )}
                                  {deployment.state === 'ERROR' && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <line x1="18" y1="6" x2="6" y2="18"/>
                                      <line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                  )}
                                  {deployment.state === 'BUILDING' && (
                                    <span className="btn-spinner small" />
                                  )}
                                  {deployment.state === 'QUEUED' && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10"/>
                                      <polyline points="12 6 12 12 16 14"/>
                                    </svg>
                                  )}
                                  {!['READY', 'ERROR', 'BUILDING', 'QUEUED'].includes(deployment.state) && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10"/>
                                    </svg>
                                  )}
                                </span>
                                <a
                                  href={`https://${deployment.url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="vercel-deployment-url"
                                >
                                  {deployment.url || deployment.name}
                                </a>
                              </div>
                              <div className="vercel-deployment-meta">
                                <span>{deployment.name}</span>
                                <span>{new Date(deployment.created).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="vercel-deployment-actions">
                              {deployment.state === 'BUILDING' || deployment.state === 'QUEUED' ? (
                                <button
                                  className="vercel-deployment-btn cancel"
                                  onClick={() => cancelVercelDeployment(deployment.uid)}
                                  title="Cancel deployment"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="6" y="6" width="12" height="12"/>
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  className="vercel-deployment-btn delete"
                                  onClick={() => deleteVercelDeployment(deployment.uid)}
                                  disabled={deletingDeployment === deployment.uid}
                                  title="Delete deployment"
                                >
                                  {deletingDeployment === deployment.uid ? (
                                    <span className="btn-spinner small" />
                                  ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6"/>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="code-modal-actions">
                    <button
                      className="code-modal-btn"
                      onClick={() => loadVercelDeployments()}
                      disabled={vercelDeploymentsLoading}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                      </svg>
                      Refresh
                    </button>
                    <button
                      className="code-modal-btn primary"
                      onClick={() => setShowVercelDeployments(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {/* Deep Research Page */}
        <div className={`chat-view ${showDeepResearchPage && !showSettingsPage && !showGalleryPage && !showKnowledgeBasePage ? 'slide-in' : 'slide-out'}`}>
          {showDeepResearchPage && !showSettingsPage && !showGalleryPage && !showKnowledgeBasePage && (
            <div className="deep-research-header">
              <button className="deep-research-back-btn" onClick={() => setShowDeepResearchPage(false)} title="Back to Chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5"/>
                  <path d="M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <span className="deep-research-title">Deep Research</span>
            </div>
          )}
          {showDeepResearchPage && !showSettingsPage && !showGalleryPage && !showKnowledgeBasePage && !sidebarOpen && (
            <button className="open-sidebar" onClick={() => setSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>
          )}

          <div className="chat-container">
            {deepResearchMessages.length === 0 ? (
              <div className="welcome-screen">
                <div className="logo">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"/>
                  </svg>
                </div>
                <h1>Deep Research</h1>
              </div>
            ) : (
              <div className="messages">
                {deepResearchRenderedMessages.map(message => (
                  <div key={message.id} className={`message ${message.role}`}>
                    {message.role === 'assistant' && (
                      <div className="message-avatar">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="assistant-avatar">
                          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729z"/>
                        </svg>
                      </div>
                    )}
                    <div className="message-content">
                      {message.role === 'user' ? (
                        <div className="user-message-wrapper">
                          <div className="user-message-bubble">
                            <span className="user-message-text">{message.content}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="message-role">Deep Research</div>
                          <div
                            className="message-text formatted-response"
                            dangerouslySetInnerHTML={{ __html: message.html || formatMarkdown(message.content) }}
                          />
                          <div className="message-actions">
                            <button 
                              className={`message-action-btn ${copiedMessageId === message.id ? 'active' : ''}`}
                              title="Copy"
                              onClick={() => handleCopy(message.content, message.id)}
                            >
                              {copiedMessageId === message.id ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              )}
                            </button>
                            <button 
                              type="button"
                              className={`message-action-btn ${reactions[message.id] === 'liked' ? 'active liked' : ''}`}
                              title="Good response"
                              onPointerDown={(e) => {
                                e.preventDefault()
                                handleReaction(message.id, 'liked')
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill={reactions[message.id] === 'liked' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                              </svg>
                            </button>
                            <button 
                              type="button"
                              className={`message-action-btn ${reactions[message.id] === 'disliked' ? 'active disliked' : ''}`}
                              title="Bad response"
                              onPointerDown={(e) => {
                                e.preventDefault()
                                handleReaction(message.id, 'disliked')
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill={reactions[message.id] === 'disliked' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                              </svg>
                            </button>
                            <button 
                              className="message-action-btn" 
                              title="Share"
                              onClick={() => handleShare(message.content)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {deepResearchTyping && (
                  <div className="message assistant">
                    <div className="message-avatar">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="assistant-avatar">
                        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729z"/>
                      </svg>
                    </div>
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={deepResearchEndRef} />
              </div>
            )}

            <div className="input-area">
              <form
                className="input-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleDeepResearchSubmit()
                }}
              >
                <div className="input-wrapper">
                  {/* Attached Files Preview */}
                  {deepResearchFiles.length > 0 && (
                    <div className={`attached-files ${deepResearchProcessingFiles ? 'uploading' : ''}`}>
                      {deepResearchProcessingFiles && (
                        <div className="attached-files-uploading">
                          <div className="upload-spinner"></div>
                          <span>Processing files...</span>
                        </div>
                      )}
                      {deepResearchFiles.map(file => (
                        <div key={file.id} className="attached-file">
                          {file.preview ? (
                            <img src={file.preview} alt={file.name} className="file-preview-image" />
                          ) : (
                            <div className="file-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                          )}
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <button 
                            type="button" 
                            className="remove-file-btn"
                            onClick={() => removeDeepResearchFile(file.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <ChatTextarea
                    externalValue={deepResearchInput}
                    onValueChange={setDeepResearchInput}
                    onSubmit={handleDeepResearchSubmit}
                    placeholder={deepResearchProcessingFiles ? "Processing files..." : "Ask a research question..."}
                    disabled={deepResearchTyping || deepResearchProcessingFiles}
                  />
                  <div className="input-bottom-bar">
                    <div className="input-actions-left">
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => {
                          setUploadModalTarget('deepResearch')
                          setShowUploadModal(true)
                        }}
                        title="Attach files"
                        disabled={deepResearchTyping}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                      </button>
                    </div>
                    <div className="input-actions-right">
                      {deepResearchTyping ? (
                        <button
                          type="button"
                          className="send-btn stop"
                          onClick={stopDeepResearch}
                          title="Stop generating"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="2"/>
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="send-btn"
                          disabled={(!deepResearchInput.trim() && deepResearchFiles.length === 0) || deepResearchProcessingFiles}
                          title="Send message"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>
              <p className="disclaimer">AI can make mistakes. Please double-check responses.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Code Canvas Panel - Only visible when code is added */}
      <div className={`code-canvas ${canvasOpen ? 'open' : ''}`}>
        <div className="code-canvas-header">
          <div className="code-canvas-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            <span>Code Canvas</span>
            <span className="code-canvas-lang">{canvasActiveTab}</span>
          </div>
          <div className="code-canvas-actions">
            <button
              className="canvas-action-btn canvas-run-btn"
              onClick={runCanvasCode}
              title="Run & Preview"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Run
            </button>
            <button
              className="canvas-action-btn canvas-clear-btn"
              onClick={clearCanvas}
              title="Clear & Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="code-canvas-tabs">
          {['html', 'css', 'js'].map((t) => (
            <button
              key={t}
              type="button"
              className={`code-canvas-tab ${canvasActiveTab === t ? 'active' : ''}`}
              onClick={() => setCanvasActiveTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="code-canvas-editor">
          <div className="code-canvas-editor-wrap">
            <pre className="code-canvas-highlight" ref={canvasHighlightRef}>
              <code dangerouslySetInnerHTML={{ __html: highlightedCanvasHtml || '&nbsp;' }} />
            </pre>
            <textarea
              ref={canvasEditorRef}
              value={activeCanvasCode}
              onChange={(e) => {
                setCanvasFiles((prev) => ({ ...prev, [canvasActiveTab]: e.target.value }))
              }}
              onScroll={syncCanvasScroll}
              placeholder={
                canvasActiveTab === 'html'
                  ? "Add HTML here (or click '+' on an HTML block)..."
                  : canvasActiveTab === 'css'
                    ? "Add CSS here (or click '+' on a CSS block)..."
                    : "Add JS here (or click '+' on a JS block)..."
              }
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* Preview Modal - Full Screen */}
      {previewOpen && (
        <div className="preview-modal-overlay">
          <div className="preview-modal">
            <div className="preview-modal-header">
              <div className="preview-modal-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>Preview</span>
                <span className="preview-modal-lang">combined</span>
              </div>
              <div className="preview-modal-actions">
                <button
                  className="preview-modal-refresh"
                  onClick={runCanvasCode}
                  title="Refresh Preview"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </button>
                <button
                  className="preview-modal-close"
                  onClick={() => setPreviewOpen(false)}
                  title="Close Preview"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <iframe
              ref={canvasIframeRef}
              title="Code Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (() => {
        const modalFiles = uploadModalTarget === 'deepResearch' ? deepResearchFiles : attachedFiles
        const setModalFiles = uploadModalTarget === 'deepResearch' ? setDeepResearchFiles : setAttachedFiles
        const removeModalFile = uploadModalTarget === 'deepResearch' ? removeDeepResearchFile : removeAttachedFile
        return (
        <div className="upload-modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="upload-modal-header">
              <h2>{uploadModalTarget === 'deepResearch' ? 'Upload to Research' : 'Upload Documents'}</h2>
              <button 
                className="upload-modal-close"
                onClick={() => setShowUploadModal(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="upload-modal-content">
              {/* Drag and Drop Zone */}
              <div 
                className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="upload-dropzone-content">
                  <div className="upload-dropzone-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p className="upload-dropzone-text">
                    Drag & drop files here, or click to browse
                  </p>
                  <p className="upload-dropzone-subtext">
                    Supports PDFs, images, documents, and code files (max 10MB each)
                  </p>
                   <input
                     type="file"
                     ref={fileInputRef}
                     onChange={handleFileSelect}
                     multiple
                     accept="image/*,.pdf,.doc,.docx,.txt,.json,.csv,.zip,.rar"
                     className="upload-file-input"
                   />
                  <button 
                    className="upload-browse-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Files
                  </button>
                </div>
              </div>

              {/* Attached Files List */}
              {modalFiles.length > 0 && (
                <div className="upload-files-list">
                  <div className="upload-files-header">
                    <span className="upload-files-count">
                      {modalFiles.length} file{modalFiles.length > 1 ? 's' : ''} selected
                    </span>
                    <button 
                      className="upload-clear-all"
                      onClick={() => {
                        modalFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
                        setModalFiles([])
                        if (uploadModalTarget !== 'deepResearch') {
                          setPreProcessedOcr({ ocrContext: '', postedMessage: '' })
                        }
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="upload-files-grid">
                    {modalFiles.map(file => (
                      <div key={file.id} className="upload-file-item">
                        <div className="upload-file-preview">
                          {file.preview ? (
                            <img src={file.preview} alt={file.name} />
                          ) : (
                            <div className={`upload-file-icon ${getFileIcon(file.type)}`}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="upload-file-info">
                          <span className="upload-file-name">{file.name}</span>
                          <span className="upload-file-size">{formatFileSize(file.size)}</span>
                        </div>
                        <button 
                          className="upload-file-remove"
                          onClick={() => removeModalFile(file.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Actions */}
              {modalFiles.length > 0 && (
                <div className="upload-modal-actions">
                  <button 
                    className="upload-cancel-btn"
                    onClick={() => setShowUploadModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="upload-confirm-btn"
                    onClick={() => setShowUploadModal(false)}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )})()}

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <div className="modal-overlay" onClick={() => setShowCreateProjectModal(false)}>
          <div className="create-project-modal" onClick={(e) => e.stopPropagation()}>
            <div className="create-project-header">
              <h2>Create project</h2>
              <div className="create-project-header-actions">
                <button
                  className="modal-close-btn"
                  onClick={() => setShowCreateProjectModal(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="create-project-content">
              <div className="project-name-input-wrapper">
                <div 
                  className="project-color-picker"
                  style={{ backgroundColor: newProjectColor }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <input
                    type="color"
                    value={newProjectColor}
                    onChange={(e) => setNewProjectColor(e.target.value)}
                    className="color-input-hidden"
                  />
                </div>
                <input
                  type="text"
                  className="project-name-input"
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="project-color-presets">
                {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'].map(color => (
                  <button
                    key={color}
                    className={`color-preset ${newProjectColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewProjectColor(color)}
                  />
                ))}
              </div>

              <div className="project-info-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
                <p>
                  Projects keep chats, files, and custom instructions in one place. 
                  Use them for ongoing work, or just to keep things tidy.
                </p>
              </div>

              <div className="project-instructions-section">
                <label>Custom instructions (optional)</label>
                <textarea
                  className="project-instructions-input"
                  placeholder="Add instructions that will apply to all chats in this project..."
                  value={newProjectInstructions}
                  onChange={(e) => setNewProjectInstructions(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="create-project-footer">
              <button
                className="create-project-btn-primary"
                onClick={createProject}
                disabled={!newProjectName.trim()}
              >
                Create project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfilePage && (
        <div className="profile-modal-overlay" onClick={() => setShowProfilePage(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-header">
              <h2>Your Profile</h2>
              <button
                className="profile-modal-close"
                onClick={() => setShowProfilePage(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="profile-modal-content">
              <div className="profile-avatar-section">
                <div className="profile-avatar-large">{user.avatar}</div>
                <p className="profile-email">{user.email}</p>
              </div>

              <div className="profile-form">
                <div className="profile-field">
                  <label htmlFor="profile-name">Display Name</label>
                  <input
                    id="profile-name"
                    type="text"
                    placeholder="How should agents address you?"
                    value={profileDraft.display_name}
                    onChange={(e) =>
                      setProfileDraft((d) => ({ ...d, display_name: e.target.value }))
                    }
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="profile-role">Role / Title</label>
                  <input
                    id="profile-role"
                    type="text"
                    placeholder="e.g. Software Engineer, Designer, Student"
                    value={profileDraft.role}
                    onChange={(e) =>
                      setProfileDraft((d) => ({ ...d, role: e.target.value }))
                    }
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="profile-timezone">Timezone</label>
                  <input
                    id="profile-timezone"
                    type="text"
                    placeholder="e.g. EST, PST, UTC+1"
                    value={profileDraft.timezone}
                    onChange={(e) =>
                      setProfileDraft((d) => ({ ...d, timezone: e.target.value }))
                    }
                  />
                </div>

                <div className="profile-field">
                  <label htmlFor="profile-about">About You</label>
                  <textarea
                    id="profile-about"
                    placeholder="Share anything you'd like agents to know about you (interests, preferences, context)..."
                    rows={4}
                    value={profileDraft.about}
                    onChange={(e) =>
                      setProfileDraft((d) => ({ ...d, about: e.target.value }))
                    }
                  />
                </div>

                {profileSaveError && (
                  <p className="profile-error">{profileSaveError}</p>
                )}

                <div className="profile-actions">
                  <button
                    className="profile-cancel-btn"
                    onClick={() => setShowProfilePage(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="profile-save-btn"
                    onClick={async () => {
                      await saveUserProfile()
                      if (profileSaveState !== 'error') setShowProfilePage(false)
                    }}
                    disabled={profileSaveState === 'saving'}
                  >
                    {profileSaveState === 'saving' ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>

              <p className="profile-hint">
                This information helps agents personalize responses and address you by name.
              </p>

              <div className="profile-logout-section">
                <button
                  className="profile-logout-btn"
                  onClick={async () => {
                    await supabase.auth.signOut()
                    setShowProfilePage(false)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Confirmation Modal */}
      {deleteChatModal && (
        <div className="delete-chat-modal-overlay" onClick={() => setDeleteChatModal(null)}>
          <div className="delete-chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-chat-modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </div>
            <h2>Delete Chat?</h2>
            <p className="delete-chat-modal-text">
              Are you sure you want to delete "<strong>{deleteChatModal.title}</strong>"? This action cannot be undone.
            </p>
            <div className="delete-chat-modal-actions">
              <button 
                className="delete-chat-modal-btn cancel"
                onClick={() => setDeleteChatModal(null)}
              >
                Cancel
              </button>
              <button 
                className="delete-chat-modal-btn confirm"
                onClick={() => {
                  deleteConversation(deleteChatModal.id)
                  setDeleteChatModal(null)
                  showToast('Chat deleted')
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {imagePreviewModal && (
        <div className="image-preview-overlay" onClick={() => setImagePreviewModal(null)}>
          <div className="image-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="image-preview-close" onClick={() => setImagePreviewModal(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <img src={imagePreviewModal.url} alt={imagePreviewModal.prompt} className="image-preview-img" />
            <div className="image-preview-caption">{imagePreviewModal.prompt}</div>
          </div>
        </div>
      )}

      {/* Deep Research Modal */}
      {showDeepResearchModal && (
        <div className="deep-research-modal-overlay" onClick={() => setShowDeepResearchModal(false)}>
          <div className="deep-research-modal" onClick={(e) => e.stopPropagation()}>
            <div className="deep-research-modal-header">
              <h2>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <path d="M11 7v4l3 2"/>
                </svg>
                Deep Research
              </h2>
              <button className="deep-research-modal-close" onClick={() => setShowDeepResearchModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="deep-research-modal-body">
              <button 
                className="deep-research-new-btn"
                onClick={() => {
                  createNewDeepResearch()
                  setShowDeepResearchModal(false)
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Research
              </button>
              
              {deepResearchConversations.length > 0 ? (
                <div className="deep-research-list">
                  {deepResearchConversations.map(conv => (
                    <div
                      key={conv.id}
                      className={`deep-research-item ${conv.id === activeDeepResearchId ? 'active' : ''}`}
                      onClick={() => {
                        loadDeepResearchConversation(conv.id)
                        setShowDeepResearchModal(false)
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <span className="deep-research-item-title">{conv.title}</span>
                      <button
                        className="deep-research-item-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteDeepResearchConversation(conv.id)
                        }}
                        title="Delete"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="deep-research-empty">
                  <p>No research conversations yet.</p>
                  <p>Start a new research to explore topics in depth.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
    </div>
  )

  if (!isSupabaseConfigured) return appBody

  // If Supabase is configured, require auth before showing the app
  return (
    <AuthGate onUser={setAuthUser}>
      {appBody}
    </AuthGate>
  )
}

export default App
