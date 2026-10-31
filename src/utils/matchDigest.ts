import dayjs from 'dayjs'
import { contentApi } from '../api'
import type { Content, MatchEvent } from '../api/types'
import type { StatsMatch } from './statsAggregation'

function escapeHtml(value?: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function minuteText(event: MatchEvent): string {
  if (typeof event.minute !== 'number') return ''
  return event.stoppageMinute ? `${event.minute}+${event.stoppageMinute} 分钟` : `${event.minute} 分钟`
}

export interface MatchDigestDraft {
  title: string
  summary: string
  bodyHtml: string
  eventId?: string
  groupId?: string
}

/** 生成赛果快讯草稿：比分、进球时间线、红黄牌与比赛信息。 */
export function buildMatchDigest(match: StatsMatch, events: readonly MatchEvent[] = []): MatchDigestDraft {
  const home = match.homeTeamName || '主队'
  const away = match.awayTeamName || '客队'
  const homeScore = match.homeScore ?? 0
  const awayScore = match.awayScore ?? 0
  const score = `${homeScore}:${awayScore}`
  const stage = match.groupName || match.eventId || ''
  const kickoff = match.kickoffAt ? dayjs(match.kickoffAt).format('YYYY-MM-DD') : ''
  const titleSuffix = stage || kickoff
  const title = `赛果快讯｜${home} ${score} ${away}${titleSuffix ? `（${titleSuffix}）` : ''}`

  const goals = [...events]
    .filter((event) => event.eventType === 'GOAL')
    .sort((a, b) => (a.minute || 0) - (b.minute || 0))
  const cards = [...events]
    .filter(
      (event) =>
        event.eventType === 'PENALTY' &&
        (event.penaltyType === 'YELLOW_CARD' || event.penaltyType === 'RED_CARD'),
    )
    .sort((a, b) => (a.minute || 0) - (b.minute || 0))

  const goalItems = goals
    .map((event) => {
      const who = event.scorerName || event.athleteName || '未知球员'
      const team = event.teamName ? `（${event.teamName}）` : ''
      const own = event.ownGoal ? ' [乌龙球]' : ''
      return `<li>${minuteText(event)} ${escapeHtml(who)}${escapeHtml(team)}${own}</li>`
    })
    .join('')
  const cardItems = cards
    .map((event) => {
      const kind = event.penaltyType === 'RED_CARD' ? '红牌' : '黄牌'
      const team = event.teamName ? `（${event.teamName}）` : ''
      const reason = event.reason ? `：${escapeHtml(event.reason)}` : ''
      return `<li>${minuteText(event)} ${kind} ${escapeHtml(event.athleteName || '未知球员')}${escapeHtml(team)}${reason}</li>`
    })
    .join('')

  const meta = [
    match.eventId ? `赛事编号：${escapeHtml(match.eventId)}` : '',
    match.groupName ? `组别：${escapeHtml(match.groupName)}` : '',
    match.kickoffAt ? `开球时间：${dayjs(match.kickoffAt).format('YYYY-MM-DD HH:mm')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const scorerSummary = goals.length
    ? goals
        .filter((event) => !event.ownGoal)
        .map((event) => event.scorerName || event.athleteName || '未知球员')
        .join('、')
    : ''
  const summary = `${home} ${score} ${away}。${scorerSummary ? `进球球员：${scorerSummary}。` : ''}`.slice(0, 160)

  const bodyHtml = [
    `<p><strong>${escapeHtml(home)} ${score} ${escapeHtml(away)}</strong></p>`,
    meta ? `<p>${meta}</p>` : '',
    `<h3>进球时间线</h3>`,
    goalItems ? `<ul>${goalItems}</ul>` : '<p>本场暂无进球记录。</p>',
    cards.length ? `<h3>红黄牌</h3><ul>${cardItems}</ul>` : '<p>本场暂无红黄牌记录。</p>',
    '<p><small>本快讯由赛事记录台赛果自动生成，最终结果以组委会公告为准。</small></p>',
  ]
    .filter(Boolean)
    .join('')

  return {
    title,
    summary,
    bodyHtml,
    eventId: match.eventId,
    groupId: match.groupId,
  }
}

export interface PublishDigestResult {
  created: boolean
  content?: Content
}

/**
 * 发布赛果快讯：按“赛事 + NEWS + 标题”去重，避免重复发布同一场赛果。
 * 调用方需具备 content.manage 权限；本函数不做权限判断。
 */
export async function publishMatchDigest(
  match: StatsMatch,
  events: readonly MatchEvent[] = [],
): Promise<PublishDigestResult> {
  const draft = buildMatchDigest(match, events)
  const existing = await contentApi.list({
    eventId: draft.eventId,
    contentType: 'NEWS',
    keyword: draft.title,
    page: 1,
    pageSize: 20,
  })
  const duplicated = (existing.items || []).some(
    (item) => item.contentType === 'NEWS' && item.title.trim() === draft.title.trim(),
  )
  if (duplicated) return { created: false }

  const created = await contentApi.create({
    contentType: 'NEWS',
    title: draft.title,
    summary: draft.summary,
    bodyHtml: draft.bodyHtml,
    eventId: draft.eventId,
    groupId: draft.groupId,
  })
  const content = await contentApi.publish(created.id, created.version)
  return { created: true, content }
}
