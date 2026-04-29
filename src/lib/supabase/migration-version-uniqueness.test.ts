import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase/migrations')
const IYZICO_SUCCESS_RPC_NAMES = [
    'apply_iyzico_subscription_renewal_success',
    'apply_iyzico_subscription_upgrade_checkout_success'
]

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

    it('does not leave Iyzico success SECURITY DEFINER RPCs executable by authenticated', () => {
        const executableRolesByFunction = new Map<string, Set<string>>()
        for (const functionName of IYZICO_SUCCESS_RPC_NAMES) {
            executableRolesByFunction.set(functionName, new Set())
        }

        const fileNames = fs.readdirSync(MIGRATIONS_DIR)
            .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
            .sort()

        for (const fileName of fileNames) {
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8')
            for (const functionName of IYZICO_SUCCESS_RPC_NAMES) {
                const grants = sql.matchAll(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${functionName}\\([^;]+?\\)\\s+TO\\s+([^;]+);`, 'gi'))
                for (const grant of grants) {
                    const roles = (grant[1] ?? '').split(',').map((role) => role.trim().toLowerCase())
                    for (const role of roles) {
                        executableRolesByFunction.get(functionName)?.add(role)
                    }
                }

                const executeRevokes = sql.matchAll(new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${functionName}\\([^;]+?\\)\\s+FROM\\s+([^;]+);`, 'gi'))
                for (const revoke of executeRevokes) {
                    const roles = (revoke[1] ?? '').split(',').map((role) => role.trim().toLowerCase())
                    for (const role of roles) {
                        executableRolesByFunction.get(functionName)?.delete(role)
                    }
                }
            }
        }

        expect(Object.fromEntries(
            Array.from(executableRolesByFunction.entries()).map(([functionName, roles]) => [
                functionName,
                Array.from(roles).sort()
            ])
        )).toEqual({
            apply_iyzico_subscription_renewal_success: ['service_role'],
            apply_iyzico_subscription_upgrade_checkout_success: ['service_role']
        })
    })
})
