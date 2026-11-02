import { describe, expect, it } from 'vitest'
import type { Organization } from '../api/types'
import {
  buildPersonImportPayload,
  parsePersonImportRows,
  PERSON_IMPORT_TEMPLATE_HEADERS,
  resolvePersonSchool,
} from './personImport'

const ORGS: Organization[] = [
  {
    id: 'org_cdqz',
    name: '成都七中',
    orgType: 'SCHOOL',
    code: 'CDQZ',
    enabled: true,
    version: 1,
  },
  {
    id: 'org_sy1',
    name: '实验学校',
    orgType: 'SCHOOL',
    code: 'SY001',
    enabled: true,
    version: 1,
  },
  {
    id: 'org_sy2',
    name: '实验学校',
    orgType: 'UNIVERSITY',
    code: 'SY002',
    enabled: true,
    version: 1,
  },
  {
    id: 'org_disabled',
    name: '停用学校',
    orgType: 'SCHOOL',
    code: 'OFF',
    enabled: false,
    version: 1,
  },
]

const HEADERS = ['姓名', '身份证号', '手机号', '人员类型', '学校（编码或全称）', '学历', '性别', '出生日期']

function matrix(...rows: unknown[][]): unknown[][] {
  return [HEADERS, ...rows]
}

describe('resolvePersonSchool', () => {
  it('按组织编码或唯一学校名称匹配', () => {
    expect(resolvePersonSchool('cdqz', ORGS).org?.id).toBe('org_cdqz')
    expect(resolvePersonSchool('成都七中', ORGS).org?.id).toBe('org_cdqz')
  })

  it('同名学校要求填写编码，停用学校不可用', () => {
    expect(resolvePersonSchool('实验学校', ORGS).error).toContain('同名学校')
    expect(resolvePersonSchool('SY002', ORGS).org?.id).toBe('org_sy2')
    expect(resolvePersonSchool('停用学校', ORGS).error).toContain('未找到')
  })
})

describe('parsePersonImportRows', () => {
  it('下载模板的表头都能被识别', () => {
    const parsed = parsePersonImportRows(
      [PERSON_IMPORT_TEMPLATE_HEADERS, ['张三', '510101201001011234', '13800000000', '运动员', 'CDQZ', '', '', '']],
      ORGS,
    )

    expect(parsed.headerErrors).toEqual([])
    expect(parsed.rows[0].status).toBe('READY')
  })

  it('表头上方有标题行时仍能找到表头', () => {
    const parsed = parsePersonImportRows(
      [
        ['2026 年秋季运动员名单'],
        [],
        PERSON_IMPORT_TEMPLATE_HEADERS,
        ['张三', '510101201001011234', '13800000000', '运动员', 'CDQZ', '', '', ''],
      ],
      ORGS,
    )

    expect(parsed.headerErrors).toEqual([])
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 4, realName: '张三', status: 'READY' })
  })

  it('解析有效行并从身份证推导性别与出生日期', () => {
    const parsed = parsePersonImportRows(
      matrix(['张三', '510101201001011234', '13800000000', '运动员', 'CDQZ', '', '', '']),
      ORGS,
    )

    expect(parsed.headerErrors).toEqual([])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2,
      realName: '张三',
      kind: 'ATHLETE',
      schoolOrgId: 'org_cdqz',
      gender: 'MALE',
      birthDate: '2010-01-01',
      status: 'READY',
      errors: [],
    })
    expect(parsed.rows[0].maskedIdNumber).toBe('510101********1234')
  })

  it('文件内重复身份证、手机号与人员类型会逐行报错', () => {
    const parsed = parsePersonImportRows(
      matrix(
        ['张三', '510101201001011234', '13800000000', '运动员', '成都七中', '', '', ''],
        ['李四', '510101201001011234', '1380000000', '替补', '成都七中', '', '', ''],
      ),
      ORGS,
    )

    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].status).toBe('READY')
    expect(parsed.rows[1].errors.join('；')).toContain('与第 2 行重复')
    expect(parsed.rows[1].errors.join('；')).toContain('手机号应为 11 位')
    expect(parsed.rows[1].errors.join('；')).toContain('人员类型只能填写')
  })

  it('身份证被 Excel 存成数字时拒绝导入，避免精度丢失', () => {
    const parsed = parsePersonImportRows(
      matrix(['张三', 510101201001011234, '13800000000', '运动员', 'CDQZ', '', '', '']),
      ORGS,
    )

    expect(parsed.rows[0].status).toBe('ERROR')
    expect(parsed.rows[0].errors.join('；')).toContain('识别为数字')
  })

  it('姓名为空或学校无法匹配时报错', () => {
    const parsed = parsePersonImportRows(
      matrix(['', '510101201001011234', '13800000000', '运动员', '不存在学校', '', '', '']),
      ORGS,
    )

    const errors = parsed.rows[0].errors.join('；')
    expect(errors).toContain('请填写姓名')
    expect(errors).toContain('未找到学校')
  })

  it('缺表头时整份文件不导入', () => {
    const parsed = parsePersonImportRows(
      [['姓名', '手机号'], ['张三', '13800000000']],
      ORGS,
    )

    expect(parsed.rows).toEqual([])
    expect(parsed.headerErrors[0]).toContain('缺少必填列')
  })

  it('出生日期支持常见分隔符，非法日期逐行报错', () => {
    const parsed = parsePersonImportRows(
      matrix(
        ['张三', '510101201001011234', '13800000000', '运动员', 'CDQZ', '', '', '2020/2/29'],
        ['李四', '510101201202024567', '13900000000', '运动员', 'CDQZ', '', '', '2021-02-29'],
      ),
      ORGS,
    )

    expect(parsed.rows[0].birthDate).toBe('2020-02-29')
    expect(parsed.rows[1].errors.join('；')).toContain('不是有效日期')
  })
})

describe('buildPersonImportPayload', () => {
  it('只提交 PersonCreate 接受的字段，空值省略', () => {
    const parsed = parsePersonImportRows(
      matrix(['张三', '510101201001011234', '13800000000', '教练员', 'CDQZ', '', '', '']),
      ORGS,
    )
    const payload = buildPersonImportPayload(parsed.rows[0])

    expect(payload).toMatchObject({
      realName: '张三',
      kinds: ['COACH'],
      idNumber: '510101201001011234',
      phone: '13800000000',
      schoolOrgId: 'org_cdqz',
      gender: 'MALE',
      birthDate: '2010-01-01',
    })
    expect(payload.education).toBeUndefined()
  })
})
