import type { StatsMatch } from './statsAggregation'

const WIDTH = 1200
const HEIGHT = 630
const FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif'
/** 数字用站内展示字体（DIN/Bahnschrift），比分更具竞技感；缺失时回退无衬线。 */
const NUM_STACK = '"DIN Alternate", "Bahnschrift", Arial, sans-serif'
/** 夜场配色：午夜蓝底 + 体育场暖光，青色辅助 + 暖金色比分。 */
const NAVY_TOP = '#06121f'
const NAVY_MID = '#0a2436'
const NAVY_BOTTOM = '#0d3246'
const CYAN = '#69c9ff'
const AMBER = '#ffb04d'

/** 十六进制色转 rgba，让主题色常量能带透明度使用。 */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 按可用宽度收缩字号，避免长队名压到比分。 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  minSize = 26,
) {
  let current = size
  do {
    ctx.font = `700 ${current}px ${FONT_STACK}`
    if (ctx.measureText(text).width <= maxWidth) return current
    current -= 2
  } while (current > minSize)
  return minSize
}

/** 圆角矩形路径（兼容未实现 ctx.roundRect 的旧内核）。 */
function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 午夜蓝球场底 + 顶部暖光 + 场地标线，整体构成海报的空间层次。 */
function drawBackground(ctx: CanvasRenderingContext2D) {
  // 主底：午夜蓝斜向渐变，左上深、右下亮，模拟夜场从暗到亮的航拍视角。
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  bg.addColorStop(0, NAVY_TOP)
  bg.addColorStop(0.55, NAVY_MID)
  bg.addColorStop(1, NAVY_BOTTOM)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 右上角体育场暖光（灯光塔）与左下角冷色回弹，一暖一冷拉开夜场纵深。
  const floodlight = ctx.createRadialGradient(WIDTH * 0.9, -40, 0, WIDTH * 0.9, -40, 600)
  floodlight.addColorStop(0, rgba(AMBER, 0.16))
  floodlight.addColorStop(1, rgba(AMBER, 0))
  ctx.fillStyle = floodlight
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const bounce = ctx.createRadialGradient(80, HEIGHT + 90, 0, 80, HEIGHT + 90, 620)
  bounce.addColorStop(0, rgba(CYAN, 0.15))
  bounce.addColorStop(1, rgba(CYAN, 0))
  ctx.fillStyle = bounce
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 中圈 + 中线 + 四角弧，冷青线压到极低的透明度，作为背景纹理存在。
  ctx.strokeStyle = 'rgba(150, 205, 245, 0.1)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2, 0)
  ctx.lineTo(WIDTH / 2, 236)
  ctx.moveTo(WIDTH / 2, 412)
  ctx.lineTo(WIDTH / 2, HEIGHT)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(WIDTH / 2, HEIGHT / 2, 150, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2 - 34, HEIGHT / 2)
  ctx.lineTo(WIDTH / 2 + 34, HEIGHT / 2)
  ctx.stroke()
  const corners: Array<[number, number, number]> = [
    [0, 0, 0],
    [WIDTH, 0, Math.PI / 2],
    [WIDTH, HEIGHT, Math.PI],
    [0, HEIGHT, Math.PI * 1.5],
  ]
  corners.forEach(([x, y, start]) => {
    ctx.beginPath()
    ctx.arc(x, y, 90, start, start + Math.PI / 2)
    ctx.stroke()
  })

  // 底部渐隐：压低画面边缘，把视线收拢到中部比分与队名上。
  const shade = ctx.createLinearGradient(0, HEIGHT * 0.55, 0, HEIGHT)
  shade.addColorStop(0, 'rgba(3, 10, 18, 0)')
  shade.addColorStop(1, 'rgba(3, 10, 18, 0.55)')
  ctx.fillStyle = shade
  ctx.fillRect(0, HEIGHT * 0.55, WIDTH, HEIGHT * 0.45)
}

/** 测量逐字符加字距后的总宽（textAlign 需为 left，且不落笔）。 */
function measureTrackedWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  track: number,
): number {
  const chars = Array.from(word)
  let total = 0
  for (const char of chars) total += ctx.measureText(char).width + track
  return total - track
}

/** 逐字符手绘字距，跨浏览器一致（不依赖 ctx.letterSpacing）。 */
function drawTrackedWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  x: number,
  y: number,
  track: number,
): void {
  const chars = Array.from(word)
  let cursor = x
  for (const char of chars) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + track
  }
}

/** 顶部眉标：MATCH REPORT 分词绘制，词距自控，避免 letter-spacing 尾随空隙。 */
function drawKicker(ctx: CanvasRenderingContext2D) {
  const y = 76
  ctx.save()
  ctx.font = `700 21px ${FONT_STACK}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = rgba(CYAN, 0.95)
  const track = 7
  const wordGap = 34
  const first = measureTrackedWord(ctx, 'MATCH', track)
  const second = measureTrackedWord(ctx, 'REPORT', track)
  const labelWidth = first + wordGap + second
  const labelStart = WIDTH / 2 - labelWidth / 2
  drawTrackedWord(ctx, 'MATCH', labelStart, y, track)
  drawTrackedWord(ctx, 'REPORT', labelStart + first + wordGap, y, track)

  const gap = 28
  const lineLen = Math.max(90, (WIDTH - labelWidth) / 2 - gap - 140)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)'
  ctx.lineWidth = 1.5
  const leftEnd = WIDTH / 2 - labelWidth / 2 - gap
  const rightStart = WIDTH / 2 + labelWidth / 2 + gap
  ctx.beginPath()
  ctx.moveTo(leftEnd - lineLen, y)
  ctx.lineTo(leftEnd, y)
  ctx.moveTo(rightStart, y)
  ctx.lineTo(rightStart + lineLen, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(leftEnd - lineLen - 10, y, 3, 0, Math.PI * 2)
  ctx.arc(rightStart + lineLen + 10, y, 3, 0, Math.PI * 2)
  ctx.fillStyle = rgba(AMBER, 0.9)
  ctx.fill()
  ctx.restore()
}

function drawTeamName(
  ctx: CanvasRenderingContext2D,
  name: string,
  centerX: number,
  y: number,
) {
  const size = fitText(ctx, name, 460, 34, 22)
  ctx.save()
  ctx.shadowColor = 'rgba(3, 10, 20, 0.45)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#f3f8fd'
  ctx.font = `700 ${size}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, centerX, y)
  ctx.restore()
  // 队名下的短强调条：暖金色，给两侧文字块一个视觉锚点。
  ctx.fillStyle = rgba(AMBER, 0.8)
  ctx.fillRect(centerX - 26, y + size / 2 + 18, 52, 4)
}

/** 比分：数字大号居中、冒号缩小上浮，构成“两层”的比分排版。 */
function drawScore(
  ctx: CanvasRenderingContext2D,
  homeScore: number,
  awayScore: number,
  centerX: number,
  y: number,
) {
  const digitFont = (size: number) => `800 ${size}px ${NUM_STACK}`
  const digitSize = 168
  const colonSize = 112

  ctx.textBaseline = 'middle'
  ctx.font = digitFont(digitSize)
  const homeText = String(homeScore)
  const awayText = String(awayScore)
  const homeW = ctx.measureText(homeText).width
  const awayW = ctx.measureText(awayText).width
  const sideGap = 44
  const colonW = measureTrackedWord(ctx, ':', 0)
  const totalW = homeW + awayW + colonW + sideGap * 2

  ctx.save()
  ctx.shadowColor = 'rgba(3, 10, 20, 0.5)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 4
  // 暖金纵向渐变：数字上亮下深，像被体育场灯光从上方打亮。
  const digitGradient = ctx.createLinearGradient(0, y - digitSize / 2, 0, y + digitSize / 2)
  digitGradient.addColorStop(0, '#ffd994')
  digitGradient.addColorStop(1, '#ff9e33')
  ctx.fillStyle = digitGradient
  ctx.textAlign = 'left'
  ctx.font = digitFont(digitSize)
  const homeX = centerX - totalW / 2
  const awayX = centerX + totalW / 2 - awayW
  ctx.fillText(homeText, homeX, y)
  ctx.fillText(awayText, awayX, y)
  // 冒号水平中点取“左数字右缘”与“右数字左缘”的正中，避免视觉偏移。
  const colonCenterX = (homeX + homeW + awayX) / 2
  ctx.font = digitFont(colonSize)
  ctx.fillStyle = 'rgba(190, 226, 255, 0.6)'
  drawTrackedWord(ctx, ':', colonCenterX - colonW / 2, y - 2, 0)
  ctx.restore()
}

/** 组别/赛事名胶囊：描边圆角条，承接被卡片标题让出的信息。 */
function drawChip(ctx: CanvasRenderingContext2D, text: string, shift = 0) {
  ctx.save()
  try {
    ctx.letterSpacing = '3px'
  } catch {
    /* 兼容旧内核 */
  }
  ctx.font = `600 22px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = text.trim()
  const textW = ctx.measureText(label).width
  const padX = 30
  const h = 48
  const w = textW + padX * 2
  const x = WIDTH / 2 - w / 2
  const y = 428 + shift
  pathRoundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = 'rgba(7, 16, 30, 0.45)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(140, 205, 255, 0.4)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(240, 248, 255, 0.96)'
  ctx.fillText(label, WIDTH / 2, y + h / 2 + 1)
  ctx.restore()
}

/**
 * 用赛果数据绘制封面（队名、比分、组别），供自动快讯上传为 CMS 封面。
 *
 * 版式：午夜蓝球场底 + 顶部 MATCH REPORT 眉标，队名分居左右并压暖金短条，
 * 比分以暖金渐变 DIN 数字居中放大，组别/赛事做胶囊承接身份信息。
 * 日期与赛事名不再画进海报：卡片 meta 已承载日期，海报只保留比分与对阵，
 * 与卡片标题（结论句）、摘要（进球球员）各司其职，互不重复。
 * 无 DOM（单元测试/SSR）或浏览器不支持 canvas 导出时返回 null，由调用方降级。
 */
export function renderMatchCoverFile(match: StatsMatch): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)

  drawBackground(ctx)
  drawKicker(ctx)

  const home = match.homeTeamName || '主队'
  const away = match.awayTeamName || '客队'
  // 没有组别胶囊时中部内容上移居中，避免海报重心偏上。
  const group = (match.groupName || '').trim()
  const event = (match.eventName || '').trim()
  const chipText = group || event
  const shift = chipText ? 0 : 26
  drawTeamName(ctx, home, WIDTH * 0.26, 218 + shift)
  drawTeamName(ctx, away, WIDTH * 0.74, 218 + shift)

  drawScore(ctx, match.homeScore ?? 0, match.awayScore ?? 0, WIDTH / 2, 330 + shift)

  if (chipText) drawChip(ctx, chipText, shift)

  // JPEG 体积约为同图 PNG 的十分之一，门户头图清晰度足够，且 CMS 封面支持 JPG。
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null)
        resolve(new File([blob], `match-${match.id || 'cover'}.jpg`, { type: 'image/jpeg' }))
      },
    'image/jpeg',
      0.9,
    )
  })
}
