import type { StatsMatch } from './statsAggregation'

const WIDTH = 1200
const HEIGHT = 630
const FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif'

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

function drawPitch(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  bg.addColorStop(0, '#062a1f')
  bg.addColorStop(0.55, '#0e4630')
  bg.addColorStop(1, '#176b43')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const glow = ctx.createRadialGradient(WIDTH * 0.82, HEIGHT * 0.08, 0, WIDTH * 0.82, HEIGHT * 0.08, 560)
  glow.addColorStop(0, 'rgba(155, 232, 119, 0.26)')
  glow.addColorStop(1, 'rgba(155, 232, 119, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 场地元素只保留中圈与中线，压低存在感，不与文字抢注意力。
  ctx.strokeStyle = 'rgba(226, 248, 234, 0.08)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2, 44)
  ctx.lineTo(WIDTH / 2, HEIGHT - 44)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(WIDTH / 2, HEIGHT / 2, 120, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * 用赛果数据绘制封面（比分、队名、日期），供自动快讯上传为 CMS 封面。
 *
 * 海报式留白版式：卡片标题/组别由门户承载，封面只保留日期、队名、比分；
 * 队名分居左右半场远端、比分以更大间距独占中轴，其余区域全部留白，
 * 避免图内文字与门户叠放的标题挤在一起。
 * 无 DOM（单元测试/SSR）或浏览器不支持 canvas 导出时返回 null，由调用方降级。
 */
export function renderMatchCoverFile(match: StatsMatch): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)

  drawPitch(ctx)
  if (match.kickoffAt) {
    ctx.fillStyle = 'rgba(201, 239, 215, 0.68)'
    ctx.font = `500 20px ${FONT_STACK}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(match.kickoffAt.slice(0, 10), WIDTH - 64, 72)
  }

  // 队名分居左右半场中轴，互不相邻；比分其下拉开大间距，构成两层稀疏信息。
  const home = match.homeTeamName || '主队'
  const away = match.awayTeamName || '客队'
  ctx.shadowColor = 'rgba(3, 22, 16, 0.35)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2

  const homeSize = fitText(ctx, home, 470, 30, 20)
  ctx.fillStyle = '#f3fbf6'
  ctx.font = `700 ${homeSize}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(home, WIDTH * 0.25, 196)

  const awaySize = fitText(ctx, away, 470, 30, 20)
  ctx.fillStyle = '#f3fbf6'
  ctx.font = `700 ${awaySize}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(away, WIDTH * 0.75, 196)

  ctx.shadowColor = 'rgba(3, 22, 16, 0.45)'
  ctx.shadowBlur = 14
  const score = `${match.homeScore ?? 0} : ${match.awayScore ?? 0}`
  ctx.fillStyle = '#9be877'
  ctx.font = `800 150px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(score, WIDTH / 2, 330)
  ctx.shadowColor = 'transparent'

  const shade = ctx.createLinearGradient(0, HEIGHT * 0.52, 0, HEIGHT)
  shade.addColorStop(0, 'rgba(4, 31, 23, 0)')
  shade.addColorStop(1, 'rgba(4, 31, 23, 0.45)')
  ctx.fillStyle = shade
  ctx.fillRect(0, HEIGHT * 0.52, WIDTH, HEIGHT * 0.48)

  // JPEG 体积约为同图 PNG 的十分之一，门户头图清晰度足够，且 CMS 封面支持 JPG。
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null)
        resolve(new File([blob], `match-${match.id || 'cover'}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.86,
    )
  })
}
