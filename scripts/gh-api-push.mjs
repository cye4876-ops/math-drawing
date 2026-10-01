/**
 * 应急推送脚本：github.com:443 不可达（Connection reset / timeout）、
 * 但 api.github.com 可达时，经 GitHub Git Data API 重放本地提交。
 *
 * 原理：Git 对象内容寻址——逐提交上传 blob、构建 tree、创建 commit，
 * 并校验每一步的 sha 与本地完全一致（bit-identical）后才 PATCH ref；
 * 任意一步不一致（例如内容/作者/时间有差异）立即报错退出，不动远端 ref。
 *
 * 用法：
 *   node scripts/gh-api-push.mjs <远端当前main完整sha> [<本地目标完整sha=HEAD>]
 *
 * 注意：
 * - 仅支持「新增/修改」提交（遇到删除会报错退出，需改用真实 git push）；
 * - 不改写本地 git 状态；成功后远端 main 与本地 HEAD 逐位一致；
 * - 依赖 gh CLI 已登录（需 repo scope）。
 */
import { spawnSync } from 'node:child_process'

const REPO = 'cye4876-ops/math-drawing'
const BASE = process.argv[2]
const TIP = (process.argv[3] ?? '').trim() || run('git', ['rev-parse', 'HEAD']).trim()

if (!BASE) {
  console.error('用法: node scripts/gh-api-push.mjs <远端当前main完整sha> [<本地目标sha>]')
  process.exit(1)
}

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, maxBuffer: 1 << 28 })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} 失败: ${r.stderr}`)
  return r.stdout
}
const git = (...args) => run('git', args)
const gh = (args, input) => run('gh', args, input)
const log = (m) => console.log(m)

const commits = git('rev-list', '--reverse', `${BASE}..${TIP}`).trim().split('\n').filter(Boolean)
if (commits.length === 0) {
  log('没有需要重放的提交（远端已是最新？）')
  process.exit(0)
}
log(`重放 ${commits.length} 个提交：${BASE.slice(0, 8)}..${TIP.slice(0, 8)}`)

let treeSha = git('rev-parse', `${BASE}^{tree}`).trim()
let parentSha = BASE
const blobCache = new Map()

for (const c of commits) {
  const changed = git('diff-tree', '--no-commit-id', '--name-status', '-r', c)
    .trim()
    .split('\n')
    .filter(Boolean)
  const entries = []
  for (const line of changed) {
    const [status, ...rest] = line.split('\t')
    const path = rest.join('\t')
    if (status === 'D') {
      throw new Error(`提交 ${c.slice(0, 8)} 含删除文件（${path}）：本脚本不支持，请改用 git push`)
    }
    const blobSha = git('rev-parse', `${c}:${path}`).trim()
    const mode = git('ls-tree', c, '--', path).trim().split(/\s+/)[0]
    let remoteSha = blobCache.get(blobSha)
    if (!remoteSha) {
      const raw = spawnSync('git', ['cat-file', 'blob', blobSha], { maxBuffer: 1 << 28 }).stdout
      const res = JSON.parse(
        gh(
          ['api', '--method', 'POST', `repos/${REPO}/git/blobs`, '--input', '-'],
          JSON.stringify({ content: raw.toString('base64'), encoding: 'base64' }),
        ),
      )
      remoteSha = res.sha
      if (remoteSha !== blobSha) {
        throw new Error(`blob sha 不一致（${path}）：本地 ${blobSha} vs 远端 ${remoteSha}`)
      }
      blobCache.set(blobSha, remoteSha)
    }
    entries.push({ path, mode, type: 'blob', sha: remoteSha })
  }

  const treeRes = JSON.parse(
    gh(
      ['api', '--method', 'POST', `repos/${REPO}/git/trees`, '--input', '-'],
      JSON.stringify({ base_tree: treeSha, tree: entries }),
    ),
  )
  const expectTree = git('rev-parse', `${c}^{tree}`).trim()
  if (treeRes.sha !== expectTree) {
    throw new Error(
      `tree sha 不一致（${c.slice(0, 8)}）：本地 ${expectTree} vs 远端 ${treeRes.sha}`,
    )
  }
  treeSha = treeRes.sha
  log(`  tree ok ${c.slice(0, 8)}（${entries.length} 个文件）`)

  const meta = git('log', '-1', '--format=%B%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI', c).split(
    '\0',
  )
  const [message, an, ae, aDate, cn, ce, cDate] = meta
  const commitRes = JSON.parse(
    gh(
      ['api', '--method', 'POST', `repos/${REPO}/git/commits`, '--input', '-'],
      JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha],
        author: { name: an, email: ae, date: aDate },
        committer: { name: cn, email: ce, date: cDate },
      }),
    ),
  )
  if (commitRes.sha !== c) {
    throw new Error(`commit sha 不一致：本地 ${c} vs 远端 ${commitRes.sha}`)
  }
  parentSha = commitRes.sha
  log(`  commit ok ${c.slice(0, 8)}`)
}

const refRes = JSON.parse(
  gh(
    ['api', '--method', 'PATCH', `repos/${REPO}/git/refs/heads/main`, '--input', '-'],
    JSON.stringify({ sha: parentSha, force: false }),
  ),
)
log(`ref 已更新 → ${refRes.object.sha}`)
if (refRes.object.sha !== TIP) {
  throw new Error(`最终 ref 不一致：${refRes.object.sha} vs ${TIP}`)
}
log('SUCCESS：远端 main 与本地目标提交逐位一致（会照常触发 CI）')
