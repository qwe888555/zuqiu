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

  const glow = ctx.createRadialGradient(WIDTH * 0.82, HEIGHT * 0.1, 0, WIDTH * 0.82, HEIGHT * 0.1, 520)
  glow.addColorStop(0, 'rgba(155, 232, 119, 0.28)')
  glow.addColorStop(1, 'rgba(155, 232, 119, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.strokeStyle = 'rgba(226, 248, 234, 0.15)'
  ctx.lineWidth = 3
  ctx.strokeRect(52, 44, WIDTH - 104, HEIGHT - 88)
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2, 44)
  ctx.lineTo(WIDTH / 2, HEIGHT - 44)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(WIDTH / 2, HEIGHT / 2, 108, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(WIDTH / 2, HEIGHT / 2, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(226, 248, 234, 0.4)'
  ctx.fill()
  ctx.strokeRect(52, 172, 150, 286)
  ctx.strokeRect(WIDTH - 202, 172, 150, 286)
}


/**
 * 用赛果数据绘制封面（比分、队名、组别、日期），供自动快讯上传为 CMS 封面。
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

  // 关键信息集中在上半部：门户头图会在下半部叠加标题，避免比分被文字盖住。
  ctx.shadowColor = 'rgba(3, 22, 16, 0.45)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 2
  ctx.fillStyle = 'rgba(201, 239, 215, 0.78)'
  ctx.font = `600 20px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('MATCH REPORT', WIDTH / 2, 92)

  const home = match.homeTeamName || '主队'
  const away = match.awayTeamName || '客队'
  const homeSize = fitText(ctx, home, 470, 34, 22)
  ctx.fillStyle = '#f3fbf6'
  ctx.font = `700 ${homeSize}px ${FONT_STACK}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(home, 552, 166)

  const awaySize = fitText(ctx, away, 470, 34, 22)
  ctx.fillStyle = '#f3fbf6'
  ctx.font = `700 ${awaySize}px ${FONT_STACK}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(away, 648, 166)

  const score = `${match.homeScore ?? 0} : ${match.awayScore ?? 0}`
  ctx.fillStyle = '#9be877'
  ctx.font = `800 104px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(score, WIDTH / 2, 258)
  ctx.shadowColor = 'transparent'

  if (match.groupName) {
    ctx.fillStyle = 'rgba(201, 239, 215, 0.92)'
    ctx.font = `500 24px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(match.groupName, WIDTH / 2, 320)
  }

  const shade = ctx.createLinearGradient(0, HEIGHT * 0.45, 0, HEIGHT)
  shade.addColorStop(0, 'rgba(4, 31, 23, 0)')
  shade.addColorStop(1, 'rgba(4, 31, 23, 0.4)')
  ctx.fillStyle = shade
  ctx.fillRect(0, HEIGHT * 0.45, WIDTH, HEIGHT * 0.55)

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
