<template>
  <div
    class="skeleton-page"
    role="status"
    aria-label="Loading workspace"
  >
    <span class="sr-only">Loading your receivables workspace…</span>
    <div class="skeleton skeleton-heading"></div>
    <div class="stat-grid">
      <div
        v-for="i in 4"
        :key="i"
        class="skeleton skeleton-stat"
      ></div>
    </div>
    <div class="dashboard-charts">
      <div class="skeleton skeleton-chart"></div>
      <div class="skeleton skeleton-chart"></div>
    </div>
    <div class="skeleton skeleton-table"></div>
  </div>
</template>

<style scoped lang="scss" src="./LoadingSkeleton.scss"></style>
