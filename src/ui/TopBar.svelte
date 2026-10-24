<script lang="ts">
  /** 三栏工作台（v3.10）：顶部项目栏，只保留品牌、当前工作区和全局操作 */
  import type { AppStore } from '../state/store'
  import type { AppMode } from './modes'
  import { MODE_LABELS } from './modes'
  import { themeState, toggleTheme } from './theme.svelte'
  import { togglePresentation } from '../teaching/presentation.svelte'
  import FunctionSquare from '@lucide/svelte/icons/function-square'
  import InspectionPanel from '@lucide/svelte/icons/inspection-panel'
  import Keyboard from '@lucide/svelte/icons/keyboard'
  import MonitorPlay from '@lucide/svelte/icons/monitor-play'
  import Moon from '@lucide/svelte/icons/moon'
  import PanelRight from '@lucide/svelte/icons/panel-right'
  import Redo2 from '@lucide/svelte/icons/redo-2'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Sun from '@lucide/svelte/icons/sun'
  import Undo2 from '@lucide/svelte/icons/undo-2'

  let {
    store,
    canUndo,
    canRedo,
    mode,
    sidebarCollapsed,
    onToggleSidebar,
    inspectorCollapsed,
    onToggleInspector,
    onOpenExamples,
    onOpenShortcuts,
  }: {
    store: AppStore
    canUndo: boolean
    canRedo: boolean
    mode: AppMode
    sidebarCollapsed: boolean
    onToggleSidebar: () => void
    inspectorCollapsed: boolean
    onToggleInspector: () => void
    onOpenExamples: () => void
    onOpenShortcuts: () => void
  } = $props()
</script>

<header class="topbar" role="toolbar" aria-label="项目工具条">
  <div class="brand">
    <span class="brand-mark"><FunctionSquare size={15} strokeWidth={2.2} /></span>
    <span class="brand-name">Math Drawing</span>
  </div>
  <div class="workspace-chip" data-testid="current-workspace">
    <span>工作区</span>
    <strong>{MODE_LABELS[mode]}</strong>
  </div>
  <div class="top-actions">
    <button
      type="button"
      class="ibtn"
      data-testid="open-examples"
      title="示例项目：从示例开始"
      onclick={onOpenExamples}><Sparkles size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="shortcuts-help"
      title="快捷键提示"
      onclick={onOpenShortcuts}><Keyboard size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="enter-presentation"
      title="课堂演示模式（放大展示，Esc 退出）"
      onclick={() => void togglePresentation()}><MonitorPlay size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="toggle-theme"
      title="切换浅色 / 深色主题"
      onclick={toggleTheme}
      >{#if themeState.theme === 'light'}<Moon size={17} />{:else}<Sun size={17} />{/if}</button
    >
    <span class="divider"></span>
    <button
      type="button"
      class="ibtn"
      data-testid="undo"
      title="撤销（Ctrl+Z）"
      disabled={!canUndo}
      onclick={() => store.undo()}><Undo2 size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="redo"
      title="重做（Ctrl+Shift+Z）"
      disabled={!canRedo}
      onclick={() => store.redo()}><Redo2 size={17} /></button
    >
    <span class="divider"></span>
    <button
      type="button"
      class="ibtn labeled"
      data-testid="toggle-sidebar"
      class:active={sidebarCollapsed}
      aria-expanded={!sidebarCollapsed}
      title={sidebarCollapsed ? '展开编辑面板' : '收起编辑面板'}
      onclick={onToggleSidebar}
      ><PanelRight size={17} /><span class="toggle-label">编辑栏</span></button
    >
    <button
      type="button"
      class="ibtn labeled"
      data-testid="toggle-inspector"
      class:active={inspectorCollapsed}
      aria-expanded={!inspectorCollapsed}
      title={inspectorCollapsed ? '展开检查器' : '收起检查器'}
      onclick={onToggleInspector}
      ><InspectionPanel size={17} /><span class="toggle-label">检查器</span></button
    >
  </div>
</header>

<style>
  .topbar {
    position: relative;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 7px 12px;
    background: var(--bg-chrome);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  .brand-mark {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
    box-shadow: 0 1px 3px rgb(37 99 235 / 40%);
  }

  .brand-name {
    font-weight: 650;
    font-size: 13.5px;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .workspace-chip {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg);
    color: var(--text-dim);
    font-size: 11px;
    white-space: nowrap;
  }

  .workspace-chip strong {
    color: var(--text);
    font-size: 13px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .top-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .ibtn {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    border: none;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
  }

  .ibtn.labeled {
    width: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
  }

  .toggle-label {
    font-size: 11px;
    white-space: nowrap;
  }

  .ibtn:hover:not(:disabled) {
    background: var(--bg);
    color: var(--text);
  }

  .ibtn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ibtn.active {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 6px;
    flex: none;
  }

  @media (max-width: 1100px) {
    .toggle-label {
      display: none;
    }

    .ibtn.labeled {
      width: 32px;
      padding: 0;
    }
  }

  @media (max-width: 680px) {
    .topbar {
      flex-wrap: wrap;
      gap: 6px;
    }

    .brand-name {
      display: none;
    }

    .workspace-chip {
      flex: 1;
      min-width: 120px;
    }

    .divider {
      margin: 0 3px;
    }
  }
</style>
