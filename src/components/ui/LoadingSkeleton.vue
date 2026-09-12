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

<style scoped lang="scss">
  @use '../../styles/tokens' as *;

  .skeleton {
    background: linear-gradient(100deg, $surface-muted 20%, $surface-soft 40%, $surface-muted 60%);
    background-size: 200% 100%;
    animation: shimmer 1.6s ease-in-out infinite;
    border-radius: 9px;
  }

  .skeleton-heading {
    height: 55px;
    width: 48%;
    margin-bottom: 35px;
  }

  .skeleton-stat {
    height: 142px;
  }

  .skeleton-chart {
    height: 350px;
  }

  .skeleton-table {
    height: 330px;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 24px;
  }
  .dashboard-charts {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }
  @media (max-width: 1000px) {
    .stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .dashboard-charts {
      grid-template-columns: 1fr;
    }
  }
</style>
