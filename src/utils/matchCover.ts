import type { StatsMatch } from './statsAggregation'

const WIDTH = 1200
const HEIGHT = 630
const FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif'
/** 数字用站内展示字体（DIN/Bahnschrift），比分更具竞技感；缺失时回退无衬线。 */
const NUM_STACK = '"DIN Alternate", "Bahnschrift", Arial, sans-serif'
const LIME = '#c8f36a'

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

/** 深绿球场底 + 顶部亮部 + 场地标线，整体构成海报的空间层次。 */
function drawBackground(ctx: CanvasRenderingContext2D) {
  // 主底：斜向深绿渐变，左深右亮，给画面一个明确的光源方向。
  const bg = ctx.createLinearGradient(0, HEIGHT * 0.1, WIDTH, HEIGHT)
  bg.addColorStop(0, '#04241b')
  bg.addColorStop(0.52, '#09432f')
  bg.addColorStop(1, '#0d573c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 右上角柠檬绿泛光与左下角场地绿反弹，一暖一冷拉开纵深。
  const glow = ctx.createRadialGradient(WIDTH * 0.88, -60, 0, WIDTH * 0.88, -60, 560)
  glow.addColorStop(0, 'rgba(200, 243, 106, 0.22)')
  glow.addColorStop(1, 'rgba(200, 243, 106, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const bounce = ctx.createRadialGradient(60, HEIGHT + 80, 0, 60, HEIGHT + 80, 640)
  bounce.addColorStop(0, 'rgba(26, 167, 122, 0.28)')
  bounce.addColorStop(1, 'rgba(26, 167, 122, 0)')
  ctx.fillStyle = bounce
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 中圈 + 中线 + 四角弧，线宽与透明度都压低，作为背景纹理存在。
  ctx.strokeStyle = 'rgba(226, 248, 234, 0.09)'
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

  // 底部压暗：托住海报下缘的日期与赛事名。
  const shade = ctx.createLinearGradient(0, HEIGHT * 0.55, 0, HEIGHT)
  shade.addColorStop(0, 'rgba(4, 31, 23, 0)')
  shade.addColorStop(1, 'rgba(4, 31, 23, 0.6)')
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
  ctx.fillStyle = 'rgba(200, 243, 106, 0.95)'
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
  ctx.fillStyle = 'rgba(200, 243, 106, 0.85)'
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
  ctx.shadowColor = 'rgba(3, 22, 16, 0.4)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#f4fbf6'
  ctx.font = `700 ${size}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, centerX, y)
  ctx.restore()
  // 队名下的短荧光条：给两侧文字块一个视觉锚点。
  ctx.fillStyle = 'rgba(200, 243, 106, 0.75)'
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
  ctx.shadowColor = 'rgba(3, 22, 16, 0.45)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 4
  ctx.fillStyle = LIME
  ctx.textAlign = 'left'
  ctx.font = digitFont(digitSize)
  const homeX = centerX - totalW / 2
  const awayX = centerX + totalW / 2 - awayW
  ctx.fillText(homeText, homeX, y)
  ctx.fillText(awayText, awayX, y)
  // 冒号水平中点取“左数字右缘”与“右数字左缘”的正中，避免视觉偏移。
  const colonCenterX = (homeX + homeW + awayX) / 2
  ctx.font = digitFont(colonSize)
  ctx.fillStyle = 'rgba(244, 251, 246, 0.55)'
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
  ctx.fillStyle = 'rgba(5, 35, 26, 0.4)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(226, 248, 234, 0.34)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(238, 250, 243, 0.92)'
  ctx.fillText(label, WIDTH / 2, y + h / 2 + 1)
  ctx.restore()
}

/** 底部信息条：左日期、右赛事名，极淡的一行，不与中部信息竞争。 */
function drawFooter(ctx: CanvasRenderingContext2D, date: string, eventName: string) {
  const lineY = HEIGHT - 76
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(64, lineY)
  ctx.lineTo(WIDTH - 64, lineY)
  ctx.stroke()

  ctx.font = `500 19px ${FONT_STACK}`
  ctx.textBaseline = 'middle'
  try {
    ctx.letterSpacing = '1px'
  } catch {
    /* 兼容旧内核 */
  }
  ctx.fillStyle = 'rgba(212, 240, 222, 0.72)'
  ctx.textAlign = 'left'
  ctx.fillText(date, 64, lineY + 30)
  if (eventName) {
    ctx.textAlign = 'right'
    const label = eventName.length > 26 ? `${eventName.slice(0, 25)}…` : eventName
    ctx.fillText(label, WIDTH - 64, lineY + 30)
  }
  ctx.restore()
}

/**
 * 用赛果数据绘制封面（队名、比分、组别与日期），供自动快讯上传为 CMS 封面。
 *
 * 版式：球场深绿底 + 顶部 MATCH REPORT 眉标，队名分居左右并压荧光短条，
 * 比分以 DIN 数字居中放大，组别/赛事做成胶囊与底部信息条。
 * 门户卡片在海报下方仍展示标题一行，图内与文字互相呼应而非依赖关系。
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
  // 没有组别胶囊也没有底部信息时，中部内容整体下移，避免整个海报重心上浮。
  const group = (match.groupName || '').trim()
  const event = (match.eventName || '').trim()
  const chipText = group || event
  const shift = chipText || match.kickoffAt ? 0 : 26
  drawTeamName(ctx, home, WIDTH * 0.26, 218 + shift)
  drawTeamName(ctx, away, WIDTH * 0.74, 218 + shift)

  drawScore(ctx, match.homeScore ?? 0, match.awayScore ?? 0, WIDTH / 2, 330 + shift)

  const footerRight = chipText === event ? group : event
  if (chipText) drawChip(ctx, chipText, shift)

  if (match.kickoffAt) {
    drawFooter(ctx, match.kickoffAt.slice(0, 10).replace(/-/g, '.'), footerRight)
  }

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
