/** n≥8 精确搜索 Worker：懒加载 n=8 图集后执行同步扫描，避免阻塞界面。 */
import { loadAtlas8 } from './atlas'
import { extremalSearchMulti, type ExtremalSearchOptions } from './search'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<{ options: ExtremalSearchOptions }>) => void) | null
  postMessage: (message: unknown) => void
}

workerScope.onmessage = (event) => {
  void (async () => {
    try {
      if (Math.round(event.data.options.n) >= 8) await loadAtlas8()
      const result = extremalSearchMulti(event.data.options)
      workerScope.postMessage({ ok: true, result })
    } catch (error) {
      workerScope.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : 'Worker 搜索失败',
      })
    }
  })()
}
