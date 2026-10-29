/**
 * 最小 CSV 解析器：支持引号、转义引号、CRLF 与 UTF-8 BOM。
 * 当前用于读取后端导出文件，不追求通用表格语义。
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.length > 0))
}

/** 将二维数据序列化为 CSV 文本（CRLF 行尾，按需加引号）。 */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? '' : String(cell)
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        })
        .join(','),
    )
    .join('\r\n')
}
