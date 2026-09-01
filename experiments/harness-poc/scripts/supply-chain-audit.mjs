import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../', import.meta.url)
const rootPath = decodeURIComponent(ROOT.pathname).replace(/^\/(?:([A-Za-z]:))/, '$1')
const lock = JSON.parse(readFileSync(join(rootPath, 'package-lock.json'), 'utf8'))
const expected = new Map([
  ['node_modules/@deepseek-ai/dsh', {
    version: '0.1.1-rc.2',
    integrity: 'sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==',
  }],
  ['node_modules/@deepseek-ai/dsh-sdk-client', {
    version: '0.1.1-rc.2',
    integrity: 'sha512-wCaNAKzmBOy/ZHAS4MX31qnBawf78ZK9QSr8/MZxWxolSeoNiQ9BizDMWj54vS8CF+3fUbI26G0ziTmpJTk9DQ==',
  }],
])

function directoryBytes(path) {
  if (!existsSync(path)) return 0
  let bytes = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) bytes += directoryBytes(child)
    else if (entry.isFile()) bytes += statSync(child).size
  }
  return bytes
}

for (const [key, required] of expected) {
  const actual = lock.packages[key]
  if (actual?.version !== required.version || actual?.integrity !== required.integrity) {
    throw new Error(`Locked identity mismatch for ${key}`)
  }
}

const resolvedHosts = new Set()
let integrityEntries = 0
const lifecyclePackages = []
const licenseCounts = new Map()
let installedPackages = 0

for (const [key, locked] of Object.entries(lock.packages)) {
  if (!key) continue
  if (locked.resolved) resolvedHosts.add(new URL(locked.resolved).hostname)
  if (locked.integrity) integrityEntries += 1

  const manifestPath = join(rootPath, key, 'package.json')
  if (!existsSync(manifestPath)) continue
  installedPackages += 1
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const hooks = {}
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    if (manifest.scripts?.[hook]) hooks[hook] = manifest.scripts[hook]
  }
  if (Object.keys(hooks).length > 0) {
    lifecyclePackages.push({ name: manifest.name, version: manifest.version, hooks })
  }
  const license = typeof manifest.license === 'string' ? manifest.license : 'UNDECLARED'
  licenseCounts.set(license, (licenseCounts.get(license) ?? 0) + 1)
}

const cacheBytes = directoryBytes(join(rootPath, '.npm-cache'))
const modulesBytes = directoryBytes(join(rootPath, 'node_modules'))
const combinedBytes = cacheBytes + modulesBytes
const result = {
  profile: 'harness-g6a-supply-chain-v1',
  lockfileVersion: lock.lockfileVersion,
  lockedPackages: Object.keys(lock.packages).length - 1,
  integrityEntries,
  installedPackages,
  resolvedHosts: [...resolvedHosts].sort(),
  cacheMiB: Number((cacheBytes / 1024 / 1024).toFixed(2)),
  modulesMiB: Number((modulesBytes / 1024 / 1024).toFixed(2)),
  combinedMiB: Number((combinedBytes / 1024 / 1024).toFixed(2)),
  budgetMiB: 1024,
  withinBudget: combinedBytes < 1024 ** 3,
  lifecycleScriptsExecuted: false,
  lifecyclePackages,
  licenses: Object.fromEntries([...licenseCounts].sort(([a], [b]) => a.localeCompare(b))),
}

if (!result.withinBudget) throw new Error('G6a 1 GiB budget exceeded')
if (result.resolvedHosts.some((host) => host !== 'registry.npmjs.org')) {
  throw new Error('Unexpected package registry host')
}
if (integrityEntries !== result.lockedPackages) throw new Error('A locked package lacks integrity metadata')

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
