/**
 * 资讯默认配图：内容发布时封面为选填，没有配图时首屏头图用品牌图兜底，
 * 避免整块纯色文字卡显得像占位。列表小图仍按有无真实封面区分。
 */
export const DEFAULT_NEWS_COVER = `${import.meta.env.BASE_URL}images/news-default.svg`
