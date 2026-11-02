import dayjs from 'dayjs'
import type { Organization, PersonKind } from '../api/types'

export type PersonImportStatus = 'READY' | 'ERROR' | 'SUCCESS' | 'FAILED'
export type PersonImportGender = 'MALE' | 'FEMALE' | 'UNSPECIFIED' | ''

export interface PersonImportRow {
  /** Excel 中的实际行号，含表头。 */
  rowNumber: number
  realName: string
  idNumber: string
  maskedIdNumber: string
  phone: string
  kind: PersonKind | ''
  schoolOrgId: string
  schoolName: string
  education: string
  gender: PersonImportGender
  birthDate: string
  errors: string[]
  status: PersonImportStatus
  serverMessage?: string
}

export interface ParsedPersonImport {
  rows: PersonImportRow[]
  /** 表头或整份文件级错误；存在时 rows 为空，不应导入。 */
  headerErrors: string[]
}

export const PERSON_IMPORT_MAX_ROWS = 500

export const PERSON_IMPORT_TEMPLATE_HEADERS = [
  '姓名',
  '身份证号',
  '手机号',
  '人员类型',
  '学校（编码或全称）',
  '学历',
  '性别',
  '出生日期',
]

type ImportField =
  | 'realName'
  | 'idNumber'
  | 'phone'
  | 'kind'
  | 'school'
  | 'education'
  | 'gender'
  | 'birthDate'

const FIELD_ALIASES: Record<ImportField, string[]> = {
  realName: ['姓名', '真实姓名'],
  idNumber: ['身份证号', '身份证号码', '证件号', '证件号码'],
  phone: ['手机号', '手机号码', '联系电话', '电话'],
  kind: ['人员类型', '身份类型', '人员身份', '类型'],
  school: ['学校', '学校单位', '所属学校', '学校编码或全称'],
  education: ['学历'],
  gender: ['性别'],
  birthDate: ['出生日期', '生日'],
}

const REQUIRED_FIELDS: ImportField[] = ['realName', 'idNumber', 'phone', 'kind', 'school']

const REQUIRED_FIELD_LABELS: Record<ImportField, string> = {
  realName: '姓名',
  idNumber: '身份证号',
  phone: '手机号',
  kind: '人员类型',
  school: '学校',
  education: '学历',
  gender: '性别',
  birthDate: '出生日期',
}

const HEADER_FIELD_MAP = new Map<string, ImportField>()
for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[ImportField, string[]]>) {
  for (const alias of aliases) HEADER_FIELD_MAP.set(normalizeHeader(alias), field)
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s（）()/]/g, '')
    .toLowerCase()
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD')
  return String(value).trim()
}

function maskIdNumber(idNumber: string): string {
  if (idNumber.length <= 10) return idNumber
  return `${idNumber.slice(0, 6)}${'*'.repeat(idNumber.length - 10)}${idNumber.slice(-4)}`
}

function normalizeKind(value: string): { kind: PersonKind | ''; error?: string } {
  const text = value.trim().toUpperCase()
  if (!text) return { kind: '', error: '请填写人员类型' }
  if (['运动员', '球员', 'ATHLETE'].includes(text)) return { kind: 'ATHLETE' }
  if (['教练员', '教练', 'COACH'].includes(text)) return { kind: 'COACH' }
  return { kind: '', error: '人员类型只能填写「运动员」或「教练员」' }
}

function normalizeGender(value: string): PersonImportGender {
  const text = value.trim().toUpperCase()
  if (!text) return ''
  if (['男', 'M', 'MALE'].includes(text)) return 'MALE'
  if (['女', 'F', 'FEMALE'].includes(text)) return 'FEMALE'
  if (['未说明', 'UNSPECIFIED'].includes(text)) return 'UNSPECIFIED'
  return ''
}

function validDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    year >= 1900 &&
    year <= 2100
  )
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeBirthDate(value: unknown): { value: string; error?: string } {
  if (value === null || value === undefined || value === '') return { value: '' }
  if (value instanceof Date) return { value: dayjs(value).format('YYYY-MM-DD') }
  if (typeof value === 'number') {
    // Excel 日期序列号；cellDates 未生效时兜底。1899-12-30 是 Excel 的日期原点。
    const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(value)))
    if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) {
      return { value: '', error: '出生日期超出可识别范围' }
    }
    return { value: dayjs(date).format('YYYY-MM-DD') }
  }
  const text = String(value).trim()
  if (!text) return { value: '' }
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4))
    const month = Number(text.slice(4, 6))
    const day = Number(text.slice(6, 8))
    if (validDateParts(year, month, day)) return { value: formatDateParts(year, month, day) }
    return { value: '', error: '出生日期不是有效日期' }
  }
  const matched = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(text)
  if (!matched) return { value: '', error: '出生日期格式应为 YYYY-MM-DD' }
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (!validDateParts(year, month, day)) return { value: '', error: '出生日期不是有效日期' }
  return { value: formatDateParts(year, month, day) }
}

function birthDateFromId(idNumber: string): string {
  if (!/^\d{17}[\dX]$/.test(idNumber)) return ''
  const year = Number(idNumber.slice(6, 10))
  const month = Number(idNumber.slice(10, 12))
  const day = Number(idNumber.slice(12, 14))
  return validDateParts(year, month, day) ? formatDateParts(year, month, day) : ''
}

function genderFromId(idNumber: string): PersonImportGender {
  if (!/^\d{17}[\dX]$/.test(idNumber)) return ''
  return Number(idNumber.charAt(16)) % 2 ? 'MALE' : 'FEMALE'
}

export function resolvePersonSchool(
  value: string,
  orgs: readonly Organization[],
): { org?: Organization; error?: string } {
  const text = value.trim()
  if (!text) return { error: '请填写学校' }
  const schools = orgs.filter(
    (org) => org.enabled && (org.orgType === 'SCHOOL' || org.orgType === 'UNIVERSITY'),
  )
  const byCode = schools.find(
    (org) => org.code && org.code.trim().toLowerCase() === text.toLowerCase(),
  )
  if (byCode) return { org: byCode }
  const byName = schools.filter((org) => org.name.trim() === text)
  if (byName.length === 1) return { org: byName[0] }
  if (byName.length > 1) {
    return { error: `存在 ${byName.length} 所同名学校，请改填组织编码` }
  }
  return { error: `未找到学校「${text}」，请核对名称或组织编码` }
}

function toRow(
  raw: Partial<Record<ImportField, unknown>>,
  rowNumber: number,
  orgs: readonly Organization[],
  seenIds: Map<string, number>,
): PersonImportRow {
  const errors: string[] = []
  const realName = cellText(raw.realName).replace(/\s+/g, ' ')
  if (!realName) errors.push('请填写姓名')
  const idRaw = raw.idNumber
  const idNumber = cellText(idRaw).toUpperCase().replace(/\s/g, '')
  if (!idNumber) {
    errors.push('请填写身份证号')
  } else if (typeof idRaw === 'number') {
    errors.push('身份证号被 Excel 识别为数字，可能已丢失精度；请把该列设为文本后重填')
  } else if (!/^\d{17}[\dX]$/.test(idNumber)) {
    errors.push('身份证号应为 18 位，末位可为 X')
  }
  if (idNumber) {
    const firstRow = seenIds.get(idNumber)
    if (firstRow !== undefined) {
      errors.push(`身份证号与第 ${firstRow} 行重复`)
    } else {
      seenIds.set(idNumber, rowNumber)
    }
  }

  const phone = cellText(raw.phone).replace(/[\s-]/g, '')
  if (!phone) errors.push('请填写手机号')
  else if (!/^1[3-9]\d{9}$/.test(phone)) errors.push('手机号应为 11 位有效号码')

  const kind = normalizeKind(cellText(raw.kind))
  if (kind.error) errors.push(kind.error)

  const school = resolvePersonSchool(cellText(raw.school), orgs)
  if (school.error) errors.push(school.error)

  const gender = normalizeGender(cellText(raw.gender))
  const birthDate = normalizeBirthDate(raw.birthDate)
  if (birthDate.error) errors.push(birthDate.error)

  return {
    rowNumber,
    realName,
    idNumber,
    maskedIdNumber: maskIdNumber(idNumber),
    phone,
    kind: kind.kind,
    schoolOrgId: school.org?.id || '',
    schoolName: school.org?.name || cellText(raw.school),
    education: cellText(raw.education),
    // 文件未填性别/出生日期时，从身份证推导；推导失败则保持空白。
    gender: gender || genderFromId(idNumber),
    birthDate: birthDate.value || birthDateFromId(idNumber),
    errors,
    status: errors.length ? 'ERROR' : 'READY',
  }
}

/**
 * 解析 Excel 的二维单元格数组（sheet_to_json header:1）。
 * 表头缺失或超过行数上限时返回 headerErrors 与空 rows，整份文件不进入导入。
 */
function mapHeaderRow(row: readonly unknown[]): Map<ImportField, number> {
  const mapped = new Map<ImportField, number>()
  row.forEach((cell, index) => {
    const field = HEADER_FIELD_MAP.get(normalizeHeader(cell))
    if (field && !mapped.has(field)) mapped.set(field, index)
  })
  return mapped
}

export function parsePersonImportRows(
  matrix: readonly unknown[][],
  orgs: readonly Organization[],
): ParsedPersonImport {
  // 兼容表格上方带标题行/说明行的文件：在前 20 行里选择识别字段最多的一行作为表头。
  let headerIndex = -1
  let indexByField = new Map<ImportField, number>()
  matrix.slice(0, 20).forEach((row, index) => {
    const mapped = mapHeaderRow(row)
    if (mapped.size >= 2 && mapped.size > indexByField.size) {
      headerIndex = index
      indexByField = mapped
    }
  })
  if (headerIndex < 0) {
    headerIndex = matrix.findIndex((row) => row.some((cell) => cellText(cell) !== ''))
    if (headerIndex < 0) {
      return { rows: [], headerErrors: ['工作簿为空，请使用模板填写人员名单'] }
    }
    indexByField = mapHeaderRow(matrix[headerIndex])
  }

  const missing = REQUIRED_FIELDS.filter((field) => !indexByField.has(field))
  if (missing.length) {
    return {
      rows: [],
      headerErrors: [
        `缺少必填列：${missing.map((field) => REQUIRED_FIELD_LABELS[field]).join('、')}`,
        `当前模板列：${PERSON_IMPORT_TEMPLATE_HEADERS.join('、')}`,
      ],
    }
  }

  const dataRows = matrix.slice(headerIndex + 1)
  const nonEmptyRows = dataRows.filter((row) => row.some((cell) => cellText(cell) !== ''))
  if (nonEmptyRows.length > PERSON_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      headerErrors: [`单批最多 ${PERSON_IMPORT_MAX_ROWS} 行，当前文件有 ${nonEmptyRows.length} 行`],
    }
  }

  const seenIds = new Map<string, number>()
  const rows: PersonImportRow[] = []
  dataRows.forEach((cells, index) => {
    if (!cells.some((cell) => cellText(cell) !== '')) return
    const raw: Partial<Record<ImportField, unknown>> = {}
    for (const [field, cellIndex] of indexByField) raw[field] = cells[cellIndex]
    rows.push(toRow(raw, headerIndex + index + 2, orgs, seenIds))
  })

  return { rows, headerErrors: [] }
}

/** 只提交后端 PersonCreate 接受的字段；空值省略，避免把“未填写”写成空串。 */
export function buildPersonImportPayload(row: PersonImportRow): Record<string, unknown> {
  if (!row.kind) throw new Error('人员类型缺失，不能导入')
  return {
    realName: row.realName,
    kinds: [row.kind],
    idNumber: row.idNumber,
    phone: row.phone,
    schoolOrgId: row.schoolOrgId,
    ...(row.gender ? { gender: row.gender } : {}),
    ...(row.birthDate ? { birthDate: row.birthDate } : {}),
    ...(row.education ? { education: row.education } : {}),
  }
}
