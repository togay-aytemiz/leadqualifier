import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TELEGRAM_ROUTE_PATH = path.resolve(process.cwd(), 'src/app/api/webhooks/telegram/route.ts')
const CHANNEL_ACTIONS_PATH = path.resolve(process.cwd(), 'src/lib/channels/actions.ts')

describe('Telegram webhook logging source guards', () => {
  it('does not ship production console.log calls', () => {
    const source = [
      fs.readFileSync(TELEGRAM_ROUTE_PATH, 'utf8'),
      fs.readFileSync(CHANNEL_ACTIONS_PATH, 'utf8'),
    ].join('\n')

    expect(source).not.toContain('console.log')
    expect(source).toContain("process.env.NODE_ENV !== 'production'")
  })
})
