<script lang="ts">
  let { data } = $props();

  let expandedSlug = $state<string | null>(null);

  function toggle(slug: string) {
    expandedSlug = expandedSlug === slug ? null : slug;
  }

  function urgencyClass(days: number): 'critical' | 'low' | 'ok' {
    if (days < 14) return 'critical';
    if (days < 30) return 'low';
    return 'ok';
  }

  function urgencyLabel(days: number): string {
    if (days >= 999) return '∞';
    if (days < 1) return '<1d';
    if (days < 100) return `${Math.round(days)}d`;
    return `${Math.round(days)}d`;
  }

  // Sort by urgency (lowest days_until_stockout first)
  let sorted = $derived([...(data.items as any[])].sort((a, b) => {
    return (a.days_until_stockout ?? 999) - (b.days_until_stockout ?? 999);
  }));

  let criticalCount = $derived(sorted.filter((i: any) => (i.days_until_stockout ?? 999) < 14).length);
</script>

<header class="page-header">
  <h1>Inventory</h1>
  <div class="summary">
    <span class="summary-num">{sorted.length}</span>
    <span class="summary-label">items</span>
    {#if criticalCount > 0}
      <span class="summary-divider">·</span>
      <span class="summary-num critical">{criticalCount}</span>
      <span class="summary-label">critical</span>
    {/if}
  </div>
</header>

<div class="list">
  {#each sorted as item (item.slug)}
    {@const days = item.days_until_stockout ?? 999}
    {@const urgency = urgencyClass(days)}
    {@const isOpen = expandedSlug === item.slug}
    <div class="row" class:open={isOpen}>
      <button type="button" class="row-main" onclick={() => toggle(item.slug)}>
        <div class="row-info">
          <div class="row-name">{item.name}</div>
          <div class="row-meta">
            {#if item.daily_velocity > 0}
              {item.daily_velocity.toFixed(1)}/day
            {:else}
              No recent sales
            {/if}
          </div>
        </div>
        <div class="row-numbers">
          <div class="row-stock">{item.stock_count}</div>
          <div class="urgency-pill urgency-{urgency}">{urgencyLabel(days)}</div>
        </div>
      </button>

      {#if isOpen}
        <div class="row-detail">
          <div class="detail-grid">
            <div>
              <div class="detail-label">Daily velocity</div>
              <div class="detail-value">{item.daily_velocity ? item.daily_velocity.toFixed(2) : '0'}</div>
            </div>
            <div>
              <div class="detail-label">Days left</div>
              <div class="detail-value">{days >= 999 ? '∞' : Math.round(days)}</div>
            </div>
            <div>
              <div class="detail-label">Min threshold</div>
              <div class="detail-value">{item.min_threshold ?? 0}</div>
            </div>
            <div>
              <div class="detail-label">Total sold</div>
              <div class="detail-value">{item.total_sold ?? 0}</div>
            </div>
          </div>
          {#if item.sku}
            <div class="sku-line">SKU · {item.sku}</div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  {#if sorted.length === 0}
    <div class="empty">No inventory items.</div>
  {/if}
</div>

<style>
  .page-header {
    margin: 4px 0 18px 0;
  }
  .page-header h1 {
    margin: 0 0 4px 0;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: #f5f5f7;
  }
  .summary {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-size: 13px;
    color: #6e6e73;
  }
  .summary-num {
    font-weight: 700;
    color: #a1a1a6;
    font-feature-settings: 'tnum';
  }
  .summary-num.critical { color: #ff453a; }
  .summary-divider { color: #3a3a3c; }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    background: #161618;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .row.open {
    border-color: rgba(74, 158, 255, 0.3);
  }

  .row-main {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 16px 18px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
  }
  .row-main:active { background: rgba(255,255,255,0.03); }

  .row-info {
    flex: 1;
    min-width: 0;
  }
  .row-name {
    font-size: 15px;
    font-weight: 600;
    color: #f5f5f7;
    margin-bottom: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-meta {
    font-size: 12px;
    color: #6e6e73;
    font-weight: 500;
  }

  .row-numbers {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .row-stock {
    font-size: 24px;
    font-weight: 700;
    color: #f5f5f7;
    font-feature-settings: 'tnum';
    letter-spacing: -0.4px;
    min-width: 32px;
    text-align: right;
  }

  .urgency-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 9px;
    border-radius: 999px;
    font-feature-settings: 'tnum';
    min-width: 36px;
    text-align: center;
  }
  .urgency-critical { background: rgba(255, 69, 58, 0.18); color: #ff453a; }
  .urgency-low      { background: rgba(255, 214, 10, 0.18); color: #ffd60a; }
  .urgency-ok       { background: rgba(255,255,255,0.06); color: #6e6e73; }

  .row-detail {
    padding: 4px 18px 18px 18px;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 12px;
    margin: 12px 0 10px 0;
  }
  .detail-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    color: #6e6e73;
    font-weight: 600;
    margin-bottom: 3px;
  }
  .detail-value {
    font-size: 17px;
    font-weight: 600;
    color: #f5f5f7;
    font-feature-settings: 'tnum';
  }
  .sku-line {
    font-size: 11px;
    color: #6e6e73;
    margin-top: 6px;
    letter-spacing: 0.3px;
  }

  .empty {
    text-align: center;
    color: #6e6e73;
    padding: 60px 0;
    font-size: 14px;
  }
</style>
