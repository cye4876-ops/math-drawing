<script lang="ts">
  /** 三栏工作台（v3.10）：最左侧工作区导航轨，替代顶部平铺的 9 个标签 */
  import type { Component } from 'svelte'
  import type { AppMode } from './modes'
  import { MODE_LABELS } from './modes'
  import FunctionSquare from '@lucide/svelte/icons/function-square'
  import Waypoints from '@lucide/svelte/icons/waypoints'
  import FlaskConical from '@lucide/svelte/icons/flask-conical'
  import Network from '@lucide/svelte/icons/network'
  import ChartColumn from '@lucide/svelte/icons/chart-column'
  import Box from '@lucide/svelte/icons/box'
  import Sigma from '@lucide/svelte/icons/sigma'
  import Grid2x2 from '@lucide/svelte/icons/grid-2x2'
  import NotebookText from '@lucide/svelte/icons/notebook-text'

  interface ModeItem {
    id: AppMode
    icon: Component
  }

  const MODES: ModeItem[] = [
    { id: 'plot', icon: FunctionSquare },
    { id: 'graph', icon: Waypoints },
    { id: 'lab', icon: FlaskConical },
    { id: 'hyper', icon: Network },
    { id: 'stats', icon: ChartColumn },
    { id: 'space', icon: Box },
    { id: 'advanced', icon: Sigma },
    { id: 'matrix', icon: Grid2x2 },
    { id: 'notebook', icon: NotebookText },
  ]

  let {
    mode,
    onModeChange,
  }: {
    mode: AppMode
    onModeChange: (mode: AppMode) => void
  } = $props()
</script>

<div class="workspace-rail" role="tablist" aria-label="工作区" data-testid="workspace-rail">
  {#each MODES as item (item.id)}
    {@const Icon = item.icon}
    <button
      type="button"
      role="tab"
      data-testid={`mode-${item.id}`}
      aria-selected={mode === item.id}
      class:active={mode === item.id}
      title={MODE_LABELS[item.id]}
      onclick={() => onModeChange(item.id)}
    >
      <Icon size={19} strokeWidth={1.8} />
      <span>{MODE_LABELS[item.id]}</span>
    </button>
  {/each}
</div>

<style>
  .workspace-rail {
    width: 86px;
    flex: 0 0 86px;
    z-index: 12;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 6px;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-chrome);
    border-right: 1px solid var(--border);
  }

  .workspace-rail button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 56px;
    padding: 7px 2px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: none;
    color: var(--text-dim);
    font: inherit;
    font-size: 10.5px;
    line-height: 1.15;
    text-align: center;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .workspace-rail button:hover {
    background: var(--bg);
    color: var(--text);
  }

  .workspace-rail button.active {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
    font-weight: 650;
    box-shadow: inset 2px 0 0 var(--accent);
  }

  @media (max-width: 920px) {
    .workspace-rail {
      width: 100%;
      flex: 0 0 auto;
      flex-direction: row;
      gap: 4px;
      padding: 5px 6px;
      overflow-x: auto;
      overflow-y: hidden;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }

    .workspace-rail button {
      flex: 0 0 auto;
      flex-direction: row;
      gap: 6px;
      min-height: 34px;
      padding: 5px 10px;
      font-size: 11px;
      white-space: nowrap;
    }

    .workspace-rail button.active {
      box-shadow: inset 0 -2px 0 var(--accent);
    }
  }
</style>
