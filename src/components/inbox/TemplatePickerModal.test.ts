import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/inbox/TemplatePickerModal.tsx')

describe('TemplatePickerModal source guard', () => {
  it('avoids synchronously resetting modal state from effects', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(!isOpen\) return\s*setActiveTab\(/s)
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(!isOpen\) \{\s*setTabContentHeight\(null\)/s)
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(!isOpen\) return\s*setWhatsAppBodyParametersText\('/s)
  })
})
