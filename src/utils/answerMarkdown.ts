/**
 * 政策问答答复的轻量排版：把模型输出的 Markdown 片段转成可读的 HTML。
 *
 * 只覆盖问答里实际会出现的语法——标题、加粗、列表、引用、分隔线，
 * 不支持表格与嵌套，避免引入第三方解析器；所有文本先转义再拼接，
 * 模型输出里的 HTML 标签不会被执行。
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char)
}

/** 行内语法：`代码`、**加粗**、*斜体*。转义后处理，替换进去的都是固定标签。 */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
}

const HEADING_RE = /^(#{1,6})\s*(.*)$/
const RULE_RE = /^(-{3,}|\*{3,}|_{3,})$/
const QUOTE_RE = /^>\s?(.*)$/
const ORDERED_RE = /^(\d{1,2})[.)、]\s+(.*)$/
const BULLET_RE = /^[-*•+]\s+(.*)$/
const TABLE_RE = /^\|.*\|$/

export function renderAnswerMarkdown(source?: string): string {
  const text = String(source ?? '').replace(/\r\n?/g, '\n')
  if (!text.trim()) return ''

  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItemIndex = -1
  let paragraph: string[] = []

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
      listItemIndex = -1
    }
  }

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${paragraph.map(inline).join('<br />')}</p>`)
    paragraph = []
  }

  const appendToList = (tag: 'ul' | 'ol', content: string) => {
    if (listType !== tag) {
      closeList()
      html.push(`<${tag}>`)
      listType = tag
    }
    html.push(`<li>${inline(content)}</li>`)
    listItemIndex = html.length - 1
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()

    if (!line) {
      flushParagraph()
      closeList()
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushParagraph()
      closeList()
      // 小窗只有 380px，一级标题也压到 h4 以下，避免字号撑破版面。
      const level = heading[1].length >= 3 ? 5 : 4
      html.push(`<h${level}>${inline(heading[2].replace(/\s*#+\s*$/, ''))}</h${level}>`)
      continue
    }

    if (RULE_RE.test(line)) {
      flushParagraph()
      closeList()
      html.push('<hr />')
      continue
    }

    const quote = QUOTE_RE.exec(line)
    if (quote) {
      flushParagraph()
      closeList()
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`)
      continue
    }

    // 模型偶尔会吐表格，问答小窗放不下，按普通文本整行保留。
    if (TABLE_RE.test(line)) {
      flushParagraph()
      closeList()
      paragraph.push(line)
      continue
    }

    const ordered = ORDERED_RE.exec(line)
    if (ordered) {
      flushParagraph()
      appendToList('ol', ordered[2])
      continue
    }

    const bullet = BULLET_RE.exec(line)
    if (bullet) {
      flushParagraph()
      appendToList('ul', bullet[1])
      continue
    }

    // 列表项的折行：并入上一条，避免一句话被拆成独立段落。
    if (listType && listItemIndex >= 0) {
      html[listItemIndex] = html[listItemIndex].replace(/<\/li>$/, ` ${inline(line)}</li>`)
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  closeList()
  return html.join('')
}
