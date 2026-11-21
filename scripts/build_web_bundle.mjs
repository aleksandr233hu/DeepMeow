#!/usr/bin/env node
/**
 * 生成网页资源热更新包（dist → zip）和清单 latest.json。
 *
 * 用法：node scripts/build_web_bundle.mjs [--web 1]
 * 产物写入 web-bundles/（该目录只推送到 web-bundles 分支，不进入 main）：
 *   bundle-<appVersion>.<web>-zip
 *   latest.json
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'

const root = process.cwd()
const distDir = join(root, 'dist')
const outDir = join(root, 'web-bundles')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const appVersion = pkg.version

const webIndex = process.argv.findIndex((arg) => arg === '--web')
const webNumber = webIndex >= 0 ? Number(process.argv[webIndex + 1]) : 1
if (!Number.isInteger(webNumber) || webNumber < 1) {
  throw new Error('--web 需要是正整数')
}
const version = `${appVersion}.${webNumber}`

const walk = (dir) => {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const info = statSync(full)
    if (info.isDirectory()) {
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

const entries = {}
for (const file of walk(distDir)) {
  const name = relative(distDir, file).split(sep).join('/')
  entries[name] = new Uint8Array(readFileSync(file))
}

const zipped = zipSync(entries, { level: 9, mtime: new Date('2020-01-01T00:00:00Z') })
const checksum = createHash('sha256').update(zipped).digest('hex')
const fileName = `bundle-${version}.zip`

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, fileName), zipped)

const manifest = {
  version,
  url: `https://raw.githubusercontent.com/aleksandr233hu/DeepMeow/web-bundles/${fileName}`,
  // 备选镜像：raw 下载失败时再试（jsDelivr 对固定文件名缓存友好）
  urlAlt: `https://cdn.jsdelivr.net/gh/aleksandr233hu/DeepMeow@web-bundles/${fileName}`,
  checksum,
  minAppVersion: appVersion,
  notes: process.env.WEB_BUNDLE_NOTES ?? '',
}
writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`web bundle ${version}`)
console.log(`  file     ${fileName} (${(zipped.length / 1024 / 1024).toFixed(2)} MB)`)
console.log(`  sha256   ${checksum}`)
console.log(`  manifest ${join(outDir, 'latest.json')}`)
