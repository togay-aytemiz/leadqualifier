import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer media loading source guards', () => {
  it('keeps image bubbles on a stable placeholder footprint while media is loading', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('function InboxMessageImage(')
    expect(source).toContain("const [loadedSrc, setLoadedSrc] = useState<string | null>(null)")
    expect(source).toContain("const [failedSrc, setFailedSrc] = useState<string | null>(null)")
    expect(source).toContain('animate-spin')
    expect(source).toContain("opacity-0'")
    expect(source).toContain('aspect-[4/3]')
    expect(source).not.toContain('setIsLoaded(false)')
    expect(source).not.toContain('setHasError(false)')
    expect(source).toContain('key={item.media.url}')
    expect(source).toContain('key={media.url!}')
  })
})
