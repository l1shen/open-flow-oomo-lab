import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const migrationFiles = [
  '0001_initial.sql',
  '0002_poll_trigger.sql',
  '0003_integration_trigger.sql',
  '0004_control_api.sql',
  '0005_publication_control_api.sql',
  '0006_trigger_control_api.sql',
  '0007_trigger_run_control_api.sql',
  '0008_retirement_retention.sql',
  '0009_global_run_identity.sql',
] as const
const migrationsDirectory = new URL('../migrations/', import.meta.url)

export function migrateDatabase(file: string): void {
  const database = new DatabaseSync(file)
  try {
    database.exec('BEGIN IMMEDIATE')
    try {
      const currentVersion = (database.prepare('PRAGMA user_version').get() as { readonly user_version: number }).user_version
      if (currentVersion > migrationFiles.length) {
        throw new Error(`SQLite schema version ${currentVersion} is newer than the supported version ${migrationFiles.length}.`)
      }
      if (currentVersion == 0 && hasApplicationTables(database)) {
        throw new Error('SQLite contains an unversioned Server schema. Rebuild the unpublished development database before starting.')
      }
      for (let index = currentVersion; index < migrationFiles.length; index += 1) {
        database.exec(readFileSync(new URL(migrationFiles[index], migrationsDirectory), 'utf8'))
        database.exec(`PRAGMA user_version = ${index + 1}`)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  } finally {
    database.close()
  }
}

function hasApplicationTables(database: DatabaseSync): boolean {
  return database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get() != null
}
