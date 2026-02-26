import { describe, expect, it } from 'vitest'

import {
    resolveTemplatePickerActiveTab,
    resolveTemplatePickerInsertDisabled,
    resolveTemplatePickerRefreshLoading,
    resolveTemplatePickerTabs
} from '@/components/inbox/template-picker-state'

describe('template-picker-state', () => {
    it('returns dual tabs for whatsapp and predefined-only for non-whatsapp', () => {
        expect(resolveTemplatePickerTabs('whatsapp')).toEqual(['predefined', 'whatsapp'])
        expect(resolveTemplatePickerTabs('telegram')).toEqual(['predefined'])
        expect(resolveTemplatePickerTabs('instagram')).toEqual(['predefined'])
    })

    it('keeps current tab when valid, otherwise falls back to first tab', () => {
        expect(resolveTemplatePickerActiveTab('whatsapp', 'whatsapp')).toBe('whatsapp')
        expect(resolveTemplatePickerActiveTab('telegram', 'whatsapp')).toBe('predefined')
        expect(resolveTemplatePickerActiveTab('whatsapp', null)).toBe('predefined')
    })

    it('disables insert according to active tab selection and read-only mode', () => {
        expect(resolveTemplatePickerInsertDisabled({
            activeTab: 'predefined',
            hasSelectedPredefinedTemplate: false,
            hasSelectedWhatsAppTemplate: true,
            isReadOnly: false
        })).toBe(true)

        expect(resolveTemplatePickerInsertDisabled({
            activeTab: 'predefined',
            hasSelectedPredefinedTemplate: true,
            hasSelectedWhatsAppTemplate: false,
            isReadOnly: false
        })).toBe(false)

        expect(resolveTemplatePickerInsertDisabled({
            activeTab: 'whatsapp',
            hasSelectedPredefinedTemplate: true,
            hasSelectedWhatsAppTemplate: false,
            isReadOnly: false
        })).toBe(true)

        expect(resolveTemplatePickerInsertDisabled({
            activeTab: 'whatsapp',
            hasSelectedPredefinedTemplate: false,
            hasSelectedWhatsAppTemplate: true,
            isReadOnly: true
        })).toBe(true)
    })

    it('resolves refresh loading by active tab', () => {
        expect(resolveTemplatePickerRefreshLoading({
            activeTab: 'predefined',
            isLoadingPredefinedTemplates: true,
            isLoadingWhatsAppTemplates: false
        })).toBe(true)

        expect(resolveTemplatePickerRefreshLoading({
            activeTab: 'whatsapp',
            isLoadingPredefinedTemplates: true,
            isLoadingWhatsAppTemplates: false
        })).toBe(false)
    })
})
