import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const runtimeRoot = join(root, '.runtime', 'official-cli-preflight')
const workspace = join(runtimeRoot, 'workspace')
const home = join(runtimeRoot, 'home')
const temp = join(runtimeRoot, 'temp')
for (const path of [runtimeRoot, workspace, home, temp]) mkdirSync(path, { recursive: true })
const dshBin = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

function isolatedEnvironment() {
  const env = {
    DSH_HOME: home,
    DSH_CWD: workspace,
    TEMP: temp,
    TMP: temp,
  }
  for (const key of ['SystemRoot', 'ComSpec', 'PATH', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function run(args, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dshBin, ...args], {
      cwd: workspace,
      env: isolatedEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-65_536) })
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-65_536) })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr })
    })
  })
}

export async function runOfficialCliPreflight() {
  const version = await run(['--version'])
  const sdkMinimal = await run(['--profile', 'sdk-minimal'])
  return {
    profile: 'harness-g6a-official-cli-v1',
    exactVersion: version.code === 0 && version.stdout.trim() === '0.1.1-rc.2',
    versionExitCode: version.code,
    sdkMinimalExitCode: sdkMinimal.code,
    sdkMinimalStdoutPure: sdkMinimal.stdout.length === 0,
    sdkRuntimeAvailable: sdkMinimal.code === 0,
    failureClassification: sdkMinimal.stderr.includes('profile "sdk-minimal" does not exist')
      ? 'approved_packages_do_not_ship_sdk_runtime_profile'
      : 'unexpected_sdk_profile_failure',
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runOfficialCliPreflight(), null, 2)}\n`)
}
