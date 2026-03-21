import { describe, expect, it } from 'vitest'

import trMessages from '../../messages/tr.json'
import {
    DASHBOARD_SHELL_MESSAGE_NAMESPACES,
    mergeMessageNamespaceLists,
    pickMessageNamespaces
} from '@/i18n/messages'

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

    it('deduplicates namespace merges while preserving order', () => {
        expect(
            mergeMessageNamespaceLists(['common', 'nav'], ['nav', 'inbox', 'common', 'skills'])
        ).toEqual(['common', 'nav', 'inbox', 'skills'])
    })

    it('defines a compact shell namespace set for dashboard chrome', () => {
        expect(DASHBOARD_SHELL_MESSAGE_NAMESPACES).toEqual([
            'auth',
            'common',
            'nav',
            'mainSidebar',
            'aiSettings'
        ])
    })
})
