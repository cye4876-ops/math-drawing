/**
 * 实验台搜索 Worker（v2.7）：把同步的精确搜索放到独立线程，
 * 通过 postMessage 流式上报进度；取消由主线程 terminate() 实现。
 */
import { runGraphSearch, type SearchProgress, type SearchResumeSeed } from './search'
import { runHyperSearch, type HyperSearchProgress } from './hyper-search'
import type { GraphSpec } from './spec'
import type { HyperSpec } from './hyper-spec'

export type SearchWorkerRequest =
  { type: 'graph'; spec: GraphSpec; resume?: SearchResumeSeed } | { type: 'hyper'; spec: HyperSpec }

export type SearchWorkerResponse =
  | { type: 'progress'; kind: 'graph' | 'hyper'; progress: SearchProgress | HyperSearchProgress }
  | { type: 'result'; kind: 'graph'; result: ReturnType<typeof runGraphSearch> }
  | { type: 'result'; kind: 'hyper'; result: ReturnType<typeof runHyperSearch> }
  | { type: 'error'; message: string }

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SearchWorkerRequest>) => void) | null
  postMessage: (message: SearchWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  const request = event.data
  try {
    if (request.type === 'graph') {
      const result = runGraphSearch(request.spec, {
        onProgress: (progress) =>
          workerScope.postMessage({ type: 'progress', kind: 'graph', progress }),
        seed: request.resume,
      })
      workerScope.postMessage({ type: 'result', kind: 'graph', result })
    } else {
      const result = runHyperSearch(request.spec, {
        onProgress: (progress) =>
          workerScope.postMessage({ type: 'progress', kind: 'hyper', progress }),
      })
      workerScope.postMessage({ type: 'result', kind: 'hyper', result })
    }
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
