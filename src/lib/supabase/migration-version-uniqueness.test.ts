import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase/migrations')

describe('supabase migration versions', () => {
    it('keeps numeric migration versions unique', () => {
        const fileNames = fs.readdirSync(MIGRATIONS_DIR)
            .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
            .sort()

        const seen = new Set<string>()
        const duplicates = new Set<string>()

        for (const fileName of fileNames) {
            const version = fileName.split('_')[0] ?? ''
            if (!version) continue

            if (seen.has(version)) {
                duplicates.add(version)
                continue
            }

            seen.add(version)
        }

        expect(Array.from(duplicates)).toEqual([])
    })
})
