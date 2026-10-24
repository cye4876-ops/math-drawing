/**
 * 极值搜索 Worker 客户端：n≥8 走 Worker；不支持 Worker 或 Worker 失败时回退主线程异步入口。
 */
import type { ExtremalSearchOptions, ExtremalSearchResult } from './search'
import { extremalSearchMultiAsync } from './search'

export async function extremalSearchInWorker(
  options: ExtremalSearchOptions,
): Promise<ExtremalSearchResult> {
  if (typeof Worker === 'undefined') return extremalSearchMultiAsync(options)
  try {
    return await new Promise<ExtremalSearchResult>((resolve, reject) => {
      const worker = new Worker(new URL('./search.worker.ts', import.meta.url), {
        type: 'module',
      })
      const finish = (): void => worker.terminate()
      worker.onmessage = (
        event: MessageEvent<{ ok: boolean; result?: ExtremalSearchResult; error?: string }>,
      ) => {
        finish()
        if (event.data.ok && event.data.result) resolve(event.data.result)
        else reject(new Error(event.data.error ?? 'Worker 搜索失败'))
      }
      worker.onerror = (event) => {
        finish()
        reject(new Error(event.message || 'Worker 搜索失败'))
      }
      worker.postMessage({ options })
    })
  } catch {
    return extremalSearchMultiAsync(options)
  }
}
