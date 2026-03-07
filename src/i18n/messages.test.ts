import { describe, expect, it } from 'vitest'

import trMessages from '../../messages/tr.json'
import { pickMessageNamespaces } from '@/i18n/messages'

describe('pickMessageNamespaces', () => {
    it('returns only the requested top-level namespaces', () => {
        const scopedMessages = pickMessageNamespaces(trMessages, ['auth', 'common'])

        expect(Object.keys(scopedMessages)).toEqual(['auth', 'common'])
        expect(scopedMessages.auth).toEqual(trMessages.auth)
        expect(scopedMessages.common).toEqual(trMessages.common)
    })

    it('ignores missing namespaces without throwing', () => {
        const scopedMessages = pickMessageNamespaces(trMessages, ['auth', 'missingNamespace'])

        expect(Object.keys(scopedMessages)).toEqual(['auth'])
        expect(scopedMessages.auth).toEqual(trMessages.auth)
    })
})
