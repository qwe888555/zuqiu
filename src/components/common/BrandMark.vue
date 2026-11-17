<template>
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="var(--brand-700)" />
    <!-- 经典足球图腾：球轮廓 + 中央视五边形 + 自顶点放射的球缝线 -->
    <circle
      cx="20"
      cy="20.4"
      r="10.5"
      fill="none"
      stroke="var(--lime)"
      stroke-width="2"
    />
    <path
      d="M20 14.6L25.52 18.61 23.41 25.09 16.59 25.09 14.48 18.61Z"
      fill="var(--lime)"
    />
    <path
      d="M20 14.6V9.9M25.52 18.61L30 17.16M23.41 25.09L26.17 28.89M16.59 25.09L13.83 28.89M14.48 18.61L10 17.16"
      stroke="var(--lime)"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
