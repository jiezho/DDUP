const DEFAULT_MAX_HEADER_BYTES = 64 * 1024
const DEFAULT_MAX_LINES = 256
const DEFAULT_MAX_DEPTH = 4

function splitInlineList(value) {
  const items = []
  let current = ''
  let quote = null
  for (const character of value) {
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character
      current += character
    } else if (character === ',' && !quote) {
      items.push(current)
      current = ''
    } else {
      current += character
    }
  }
  if (quote) throw new Error('unterminated quoted frontmatter value')
  items.push(current)
  return items
}

function parseScalar(value) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed)
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'")
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    return inner ? splitInlineList(inner).map(parseScalar) : []
  }
  if (trimmed === 'null' || trimmed === '~') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed)
  return trimmed
}

function nextMeaningfulLine(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim() && !lines[index].trimStart().startsWith('#')) return lines[index]
  }
  return null
}

function parseHeader(lines, maxDepth) {
  const root = Object.create(null)
  const stack = [{ indent: -1, value: root }]
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (line.includes('\t') || line.length > 512) throw new Error('unsafe frontmatter line')
    if (/(^|\s)(?:<<:|[&*][A-Za-z0-9_-]+)/u.test(line)) throw new Error('frontmatter aliases and merge keys are not supported')
    const indent = line.length - line.trimStart().length
    if (indent % 2 !== 0 || indent / 2 > maxDepth) throw new Error('frontmatter nesting is outside the safe subset')
    while (stack.at(-1).indent >= indent) stack.pop()
    const parent = stack.at(-1)?.value
    const trimmed = line.trim()
    const listMatch = trimmed.match(/^-\s+(.+)$/u)
    if (listMatch) {
      if (!Array.isArray(parent)) throw new Error('frontmatter list has no list parent')
      parent.push(parseScalar(listMatch[1]))
      continue
    }
    const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/u)
    if (!keyMatch || !parent || Array.isArray(parent)) throw new Error('frontmatter is outside the supported mapping subset')
    const [, key, rawValue = ''] = keyMatch
    if (Object.hasOwn(parent, key)) throw new Error('duplicate frontmatter key')
    if (rawValue.trim()) {
      parent[key] = parseScalar(rawValue)
      continue
    }
    const next = nextMeaningfulLine(lines, index + 1)
    const nextIndent = next ? next.length - next.trimStart().length : -1
    const container = next && nextIndent > indent && next.trim().startsWith('- ') ? [] : Object.create(null)
    parent[key] = container
    stack.push({ indent, value: container })
  }
  return root
}

export function parseSafeFrontmatter(input, {
  maxHeaderBytes = DEFAULT_MAX_HEADER_BYTES,
  maxLines = DEFAULT_MAX_LINES,
  maxDepth = DEFAULT_MAX_DEPTH,
} = {}) {
  const source = String(input || '').replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const lines = source.split('\n')
  if (lines[0] !== '---') return { data: Object.create(null), content: source }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---')
  if (closingIndex < 0 || closingIndex - 1 > maxLines) throw new Error('frontmatter delimiter or line budget is invalid')
  const headerLines = lines.slice(1, closingIndex)
  if (Buffer.byteLength(headerLines.join('\n'), 'utf8') > maxHeaderBytes) throw new Error('frontmatter exceeds the byte budget')
  return {
    data: parseHeader(headerLines, maxDepth),
    content: lines.slice(closingIndex + 1).join('\n'),
  }
}
