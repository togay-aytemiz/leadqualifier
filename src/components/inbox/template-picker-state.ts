import type { ConversationPlatform } from '@/types/database'

export type TemplatePickerTab = 'predefined' | 'whatsapp'

export function resolveTemplatePickerTabs(platform: ConversationPlatform | null | undefined): TemplatePickerTab[] {
    if (platform === 'whatsapp') {
        return ['predefined', 'whatsapp']
    }

    return ['predefined']
}

export function resolveTemplatePickerActiveTab(
    platform: ConversationPlatform | null | undefined,
    currentTab: TemplatePickerTab | null | undefined
): TemplatePickerTab {
    const tabs = resolveTemplatePickerTabs(platform)

    if (currentTab && tabs.includes(currentTab)) {
        return currentTab
    }

    return tabs[0] ?? 'predefined'
}

export function resolveTemplatePickerInsertDisabled(params: {
    activeTab: TemplatePickerTab
    hasSelectedPredefinedTemplate: boolean
    hasSelectedWhatsAppTemplate: boolean
    isReadOnly: boolean
}): boolean {
    const { activeTab, hasSelectedPredefinedTemplate, hasSelectedWhatsAppTemplate, isReadOnly } = params

    if (isReadOnly) return true

    if (activeTab === 'predefined') {
        return !hasSelectedPredefinedTemplate
    }

    return !hasSelectedWhatsAppTemplate
}

export function resolveTemplatePickerRefreshLoading(params: {
    activeTab: TemplatePickerTab
    isLoadingPredefinedTemplates: boolean
    isLoadingWhatsAppTemplates: boolean
}): boolean {
    const { activeTab, isLoadingPredefinedTemplates, isLoadingWhatsAppTemplates } = params

    if (activeTab === 'predefined') {
        return isLoadingPredefinedTemplates
    }

    return isLoadingWhatsAppTemplates
}
