import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/demo-chat/DemoMaintenanceScreen.tsx')

describe('DemoMaintenanceScreen source guards', () => {
    it('keeps the maintenance page branded without rendering the old informal chip', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('/logo-black.svg')
        expect(source).not.toContain('meme')
        expect(source).not.toContain('maintenanceMeme')
        expect(source).not.toContain('rounded-full')
    })
})
