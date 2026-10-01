/**
 * URL 分享状态（v0.6）：完整文档（对象 + 视图 + 界面模式）→ 压缩编码。
 * - fflate deflate（level 9）+ base64url（无填充）——常规 3 曲线 + 图的状态 < 2000 字符；
 * - 解码严格走 deserializeDocument（版本/结构校验），损坏数据抛 DocFormatError。
 */
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'
import { deserializeDocument, DocFormatError, DOC_FORMAT_VERSION } from '../state/serialize'
import type { DocState, ViewTransform } from '../state/types'

export interface SharedState {
  doc: DocState
  view: ViewTransform
  mode: 'plot' | 'graph' | 'stats' | 'space'
}

/** URL 分享参数名 */
export const SHARE_PARAM = 'doc'

/** 超过该长度时 UI 应提示（浏览器对 URL 长度限制宽松，但过长的链接不便分享） */
export const SHARE_LENGTH_WARN = 6000

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(withPadding)
  } catch {
    throw new DocFormatError('分享链接编码无效（base64 解码失败）')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 完整状态 → `doc=` 参数值（紧凑 JSON + deflate + base64url） */
export function encodeSharedState(state: SharedState): string {
  const json = JSON.stringify({
    version: DOC_FORMAT_VERSION,
    mode: state.mode,
    view: state.view,
    objects: state.doc.objects,
  })
  return bytesToBase64Url(deflateSync(strToU8(json), { level: 9 }))
}

/** `doc=` 参数值 → 完整状态（失败抛出面向用户的 DocFormatError） */
export function decodeSharedState(param: string): SharedState {
  if (param === '') throw new DocFormatError('分享链接为空')
  const compressed = base64UrlToBytes(param)
  let json: string
  try {
    json = strFromU8(inflateSync(compressed))
  } catch {
    throw new DocFormatError('分享链接数据损坏（解压失败）')
  }
  const { doc, view } = deserializeDocument(json)
  let mode: 'plot' | 'graph' | 'stats' | 'space' = 'plot'
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    if (raw['mode'] === 'graph') mode = 'graph'
    else if (raw['mode'] === 'stats') mode = 'stats'
    else if (raw['mode'] === 'space') mode = 'space'
  } catch {
    // 已由 deserializeDocument 校验过，此处仅为读取 mode
  }
  return { doc, view, mode }
}

/** 基于当前地址构建分享链接 */
export function buildShareUrl(href: string, state: SharedState): string {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('mode', state.mode)
  url.searchParams.set(SHARE_PARAM, encodeSharedState(state))
  return url.toString()
}
