import { describe, expect, it } from 'vitest'
import { renderAnswerMarkdown } from './answerMarkdown'

describe('renderAnswerMarkdown', () => {
  it('把小标题渲染成标题而不是原样输出井号', () => {
    const html = renderAnswerMarkdown('## 一、总则（第一条至第三条）')
    expect(html).toBe('<h4>一、总则（第一条至第三条）</h4>')
    expect(html).not.toContain('#')
  })

  it('加粗与分点渲染成 strong / li', () => {
    const html = renderAnswerMarkdown('- **制定目的**：规范全省青少年校园足球竞赛组织工作。')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>制定目的</strong>')
    expect(html).not.toContain('**')
  })

  it('有序列表与段落换行', () => {
    const html = renderAnswerMarkdown('1. 在线填报报名单\n2. 上传盖章报名表\n\n以上为平台办理规则。')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>在线填报报名单</li>')
    expect(html).toContain('<p>以上为平台办理规则。</p>')
  })

  it('列表项折行并入上一条', () => {
    const html = renderAnswerMarkdown('- 报名附件只有球队报名表与名单、学籍证明\n  两类材料')
    expect(html).toBe('<ul><li>报名附件只有球队报名表与名单、学籍证明 两类材料</li></ul>')
  })

  it('转义模型输出里的 HTML，避免执行标签', () => {
    const html = renderAnswerMarkdown('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  it('空答复返回空串', () => {
    expect(renderAnswerMarkdown('')).toBe('')
    expect(renderAnswerMarkdown(undefined)).toBe('')
  })
})
