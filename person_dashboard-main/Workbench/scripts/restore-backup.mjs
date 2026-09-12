import { resolve } from 'node:path'

import { restoreBackupBundle } from '../server/storage/backup-service.mjs'

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : null
}

const backup = valueAfter('--backup')
const destination = valueAfter('--destination')

if (!backup || !destination) {
  console.error('用法: npm run backup:restore -- --backup <备份目录> --destination <空目录>')
  process.exitCode = 2
} else {
  try {
    const result = await restoreBackupBundle({ bundleRoot: resolve(backup), destinationRoot: resolve(destination) })
    console.log(JSON.stringify({
      status: 'ok',
      database_path: result.databasePath,
      source_storage_path: result.sourceStoragePath,
      backup_id: result.manifest.backup_id,
    }, null, 2))
  } catch (error) {
    console.error(`恢复失败：${error.message}`)
    process.exitCode = 1
  }
}
