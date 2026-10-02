<script lang="ts">
  /**
   * Cayley 乘法表（v2.2）：交互式有限群/运算表。
   * - hover 高亮行列；点击单元格显示 a·b = c；
   * - markNonCommuting：红框标出首个非交换对的两个对称格；
   * - markCenter：中心元素标签下划线；highlightRows/Cols：按标签高亮行列。
   */
  import type { FiniteTable } from '../algebra/groups'

  let {
    table,
    markNonCommuting = false,
    markCenter = false,
    highlightRows = [],
    highlightCols = [],
    oncell,
  }: {
    table: FiniteTable
    markNonCommuting?: boolean
    markCenter?: boolean
    highlightRows?: string[]
    highlightCols?: string[]
    oncell?: (a: number, b: number) => void
  } = $props()

  let hoverRow = $state(-1)
  let hoverCol = $state(-1)
  let selected = $state<{ a: number; b: number } | null>(null)

  const size = $derived(table.elements.length)
  const indexRange = $derived(Array.from({ length: table.elements.length }, (_, index) => index))

  const label = (index: number): string => table.elements[index] ?? '?'

  const pair = $derived.by<[number, number] | null>(() => {
    if (!markNonCommuting) return null
    for (let a = 0; a < size; a++) {
      for (let b = a + 1; b < size; b++) {
        if (table.table[a]?.[b] !== table.table[b]?.[a]) return [a, b]
      }
    }
    return null
  })

  const centerList = $derived.by(() => {
    const list: number[] = []
    if (!markCenter) return list
    for (let a = 0; a < size; a++) {
      let central = true
      for (let b = 0; b < size; b++) {
        if (table.table[a]?.[b] !== table.table[b]?.[a]) {
          central = false
          break
        }
      }
      if (central) list.push(a)
    }
    return list
  })

  const rowList = $derived(
    highlightRows.map((text) => table.elements.indexOf(text)).filter((i) => i >= 0),
  )
  const colList = $derived(
    highlightCols.map((text) => table.elements.indexOf(text)).filter((i) => i >= 0),
  )

  const caption = $derived.by(() => {
    if (selected) {
      const { a, b } = selected
      const product = table.table[a]?.[b]
      const productText = product === undefined ? '?' : label(product)
      return `${label(a)} · ${label(b)} = ${productText}`
    }
    if (pair) {
      const [a, b] = pair
      const ab = table.table[a]?.[b]
      const ba = table.table[b]?.[a]
      const abText = ab === undefined ? '?' : label(ab)
      const baText = ba === undefined ? '?' : label(ba)
      return `非交换：${label(a)} · ${label(b)} = ${abText} ≠ ${baText} = ${label(b)} · ${label(a)}`
    }
    if (markCenter) return `下划线标签 = 中心元素（共 ${centerList.length} 个）`
    return '悬停高亮行列；点击单元格查看乘积'
  })

  function isNonCommuting(a: number, b: number): boolean {
    return pair !== null && ((pair[0] === a && pair[1] === b) || (pair[1] === a && pair[0] === b))
  }
</script>

<div class="cayley" data-testid={`alg-table-${table.id}`}>
  <table>
    <thead>
      <tr>
        <th class="corner">·</th>
        {#each indexRange as j (j)}
          <th class:center={centerList.includes(j)} class:col-highlight={colList.includes(j)}
            >{label(j)}</th
          >
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each indexRange as i (i)}
        <tr>
          <th class:center={centerList.includes(i)} class:row-highlight={rowList.includes(i)}
            >{label(i)}</th
          >
          {#each indexRange as j (j)}
            {@const product = table.table[i]?.[j]}
            <td
              class:hover={hoverRow === i || hoverCol === j}
              class:col-highlight={colList.includes(j)}
              class:row-highlight={rowList.includes(i)}
              class:noncommuting={isNonCommuting(i, j)}
              class:selected={selected?.a === i && selected?.b === j}
              data-noncommuting={isNonCommuting(i, j) ? 'true' : undefined}
              onmouseenter={() => {
                hoverRow = i
                hoverCol = j
              }}
              onmouseleave={() => {
                hoverRow = -1
                hoverCol = -1
              }}
              onclick={() => {
                selected = { a: i, b: j }
                oncell?.(i, j)
              }}
            >
              {product === undefined ? '?' : table.elements[product]}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="cayley-caption" data-testid={`alg-caption-${table.id}`}>{caption}</div>
</div>

<style>
  .cayley {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  table {
    border-collapse: collapse;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
  }
  th,
  td {
    width: 26px;
    height: 24px;
    text-align: center;
    border: 1px solid #26324a;
    color: #c7d4ea;
    padding: 0 2px;
    cursor: default;
    white-space: nowrap;
  }
  th {
    background: #131b2c;
    color: #8fa3c2;
    font-weight: 600;
    cursor: default;
  }
  th.corner {
    color: #5c6b8a;
  }
  th.center {
    color: #3b82f6;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  th.row-highlight,
  th.col-highlight {
    color: #f59e0b;
  }
  td {
    cursor: pointer;
    transition: background 0.08s ease;
  }
  td.row-highlight {
    background: rgba(245, 158, 11, 0.07);
  }
  td.col-highlight {
    background: rgba(245, 158, 11, 0.07);
  }
  td.row-highlight.col-highlight {
    background: rgba(245, 158, 11, 0.16);
  }
  td:hover {
    background: rgba(59, 130, 246, 0.16);
  }
  td.noncommuting {
    outline: 2px solid #ef4444;
    outline-offset: -2px;
    background: rgba(239, 68, 68, 0.18);
  }
  td.selected {
    background: rgba(59, 130, 246, 0.32);
  }
  .cayley-caption {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    color: #8fa3c2;
    min-height: 16px;
  }
</style>
