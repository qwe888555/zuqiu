/** 中国大陆 18 位身份证号校验（GB 11643 / ISO 7064 MOD 11-2）。 */

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const CHECK_CODES = '10X98765432'

/** 校验 18 位身份证格式与校验位。 */
export function isValidIdCard(value: string): boolean {
  const text = (value || '').trim().toUpperCase()
  if (!/^\d{17}[\dX]$/.test(text)) return false
  const total = WEIGHTS.reduce((sum, weight, index) => sum + Number(text[index]) * weight, 0)
  return CHECK_CODES[total % 11] === text[17]
}

/** 从身份证号解析出生日期（YYYY-MM-DD），非法返回 null。 */
export function idCardBirthDate(value: string): string | null {
  const text = (value || '').trim()
  if (!/^\d{17}[\dXx]$/.test(text)) return null
  const year = Number(text.slice(6, 10))
  const month = Number(text.slice(10, 12))
  const day = Number(text.slice(12, 14))
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${text.slice(6, 10)}-${text.slice(10, 12)}-${text.slice(12, 14)}`
}

/**
 * 姓名规范校验：长度 2-20，仅允许中文与姓名间隔号「·」，
 * 排除数字与除间隔号外的特殊符号（中文姓名为主）。
 */
export function isValidRealName(value: string): boolean {
  const text = (value || '').trim()
  return /^[\u4E00-\u9FA5·]{2,20}$/.test(text)
}

/**
 * 出生日期是否与身份证号第 7-14 位生日一致；未填出生日期或无法从
 * 身份证解析时视为一致（不强校验），避免误拦截。
 */
export function isBirthDateMatchIdCard(birthDate: string, idNumber: string): boolean {
  if (!birthDate) return true
  const fromId = idCardBirthDate(idNumber)
  return fromId === null || fromId === birthDate
}
