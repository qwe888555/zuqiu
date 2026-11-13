import { describe, expect, it } from 'vitest'
import { normalizeLivePlaylist } from './hls'

const playlist = [
  '#EXTM3U',
  '#EXT-X-VERSION:10',
  '#EXT-X-TARGETDURATION:14',
  '#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=0.58500',
  '#EXT-X-PART-INF:PART-TARGET=0.23400',
  '#EXT-X-MEDIA-SEQUENCE:120',
  '#EXT-X-MAP:URI="run_video1_init.mp4?session=s"',
  '#EXT-X-GAP',
  '#EXTINF:8.33000,',
  'run_video1_gap.mp4?session=s',
  '#EXTINF:8.33356,',
  'run_video1_seg120.mp4?session=s',
  '#EXT-X-PART:DURATION=0.23367,URI="run_video1_part1.mp4?session=s"',
  '#EXT-X-GAP',
  '#EXTINF:8.33322,',
  'run_video1_seg121.mp4?session=s',
  '#EXTINF:8.33322,',
  'run_video1_seg122.mp4?session=s',
  '#EXT-X-PART:DURATION=0.20000,URI="run_video1_part2.mp4?session=s"',
].join('\n')

describe('normalizeLivePlaylist', () => {
  it('strips LL-HLS tags that trigger blocking reloads', () => {
    const text = normalizeLivePlaylist(playlist)
    expect(text).not.toContain('#EXT-X-SERVER-CONTROL')
    expect(text).not.toContain('#EXT-X-PART-INF')
    expect(text).not.toContain('#EXT-X-PART:')
  })

  it('drops only leading GAP placeholders and keeps segment numbering aligned', () => {
    const text = normalizeLivePlaylist(playlist)
    const lines = text.split('\n')
    // 开头占位的 GAP 三元组被移除，媒体序号 +1。
    expect(text).not.toContain('run_video1_gap.mp4')
    expect(lines).toContain('#EXT-X-MEDIA-SEQUENCE:121')
    // 正常分片之后的 GAP 必须保留，否则后续分片序号会错位。
    expect(text).toContain('#EXT-X-GAP')
  })

  it('tightens an oversized TARGETDURATION to the real segment length', () => {
    const text = normalizeLivePlaylist(playlist)
    expect(text).toContain('#EXT-X-TARGETDURATION:9')
  })

  it('leaves non-playlist responses untouched', () => {
    expect(normalizeLivePlaylist('{"code":"NOT_FOUND"}')).toBe('{"code":"NOT_FOUND"}')
  })
})
