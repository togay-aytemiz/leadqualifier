import { describe, expect, it } from 'vitest'

import enMessages from '../../messages/en.json'
import trMessages from '../../messages/tr.json'
import {
  DASHBOARD_SHELL_MESSAGE_NAMESPACES,
  mergeMessageNamespaceLists,
  pickMessageNamespaces,
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
      'aiSettings',
      'onboarding',
    ])
  })

  it('keeps onboarding copy at the top level for dashboard shell consumers', () => {
    expect(enMessages).toHaveProperty('onboarding.banner.message')
    expect(trMessages).toHaveProperty('onboarding.banner.message')
    expect(trMessages).toHaveProperty('onboarding.banner.mobileMessage')
    expect(trMessages.nav.onboarding).toBe('Başlangıç')
    expect(trMessages.onboarding.checklist.greeting).toContain('{name}')
    expect(trMessages.onboarding.checklist.recommendedBanner.title.toLowerCase()).toContain('öner')
    expect(trMessages.onboarding.banner.mobileMessage.toLowerCase()).toContain('şimdi yükselt')
    expect(trMessages.onboarding.checklist.steps.intro.primaryCta).toBe('Devam et')
    expect(trMessages.onboarding.banner.checklistCta).toBe('Başlangıç')
    expect(trMessages.onboarding.checklist.steps.agent_setup.primaryCta).toBe(
      "Bilgi Bankası'na git"
    )
    expect(trMessages.onboarding.checklist.steps.agent_setup.visuals.knowledge.title).toBe(
      'Bilgi Bankası'
    )
    expect(
      trMessages.onboarding.checklist.steps.agent_setup.visuals.skills.body.toLowerCase()
    ).toContain('kredi')
    expect(
      trMessages.onboarding.checklist.steps.agent_setup.visuals.skills.body.toLowerCase()
    ).not.toContain('ekip')
    expect(
      trMessages.onboarding.checklist.steps.business_review.description.toLowerCase()
    ).toContain('otomatik')
    expect(
      trMessages.onboarding.checklist.steps.business_review.description.toLowerCase()
    ).toContain('yapay zeka')
    expect(
      trMessages.onboarding.checklist.steps.business_review.description.toLowerCase()
    ).toContain('çıkar')
    expect(
      trMessages.onboarding.checklist.steps.business_review.description.toLowerCase()
    ).toContain('manuel')
    expect(
      trMessages.onboarding.checklist.steps.business_review.description.toLowerCase()
    ).not.toContain('gelebilir')
    expect(trMessages.onboarding.checklist.steps.ai_settings_review.primaryCta).toBe(
      'AI ayarlarını gözden geçir'
    )
    expect(
      trMessages.onboarding.checklist.steps.ai_settings_review.description.toLowerCase()
    ).toContain('bot adı')
    expect(
      trMessages.onboarding.checklist.steps.ai_settings_review.description.toLowerCase()
    ).not.toContain('bot modu')
    expect(
      trMessages.onboarding.checklist.steps.connect_whatsapp.description.toLowerCase()
    ).toContain('test mesajı')
    expect(
      trMessages.onboarding.checklist.steps.connect_whatsapp.description.toLowerCase()
    ).toContain('bot durumunu')
    expect(
      trMessages.onboarding.checklist.steps.connect_whatsapp.description.toLowerCase()
    ).toContain('başka bir hesap')
    expect(trMessages.onboarding.checklist.steps.ai_settings_review.visuals.botMode.title).toBe(
      'Bot adını kişiselleştirin'
    )
    expect(
      trMessages.onboarding.checklist.steps.connect_whatsapp.channels.messenger.comingSoon
    ).toBe('Yakında')
    expect(trMessages.onboarding.checklist.steps.intro.title.toLowerCase()).not.toContain('lead')
    expect(trMessages.onboarding.checklist.steps.intro.description.toLowerCase()).toContain(
      'randevu'
    )
    expect(trMessages.onboarding.checklist.steps.intro.description.toLowerCase()).not.toContain(
      'ekip'
    )
    expect(trMessages.knowledge.firstDocumentGuidance.title).toBe('İlk dokümanınız eklendi')
    expect(trMessages.knowledge.firstDocumentGuidance.description.toLowerCase()).toContain(
      'otomatik'
    )
    expect(trMessages.knowledge.firstDocumentGuidance.actions.reviewBusiness).toBe(
      'İşletme bilgilerinizi gözden geçirin'
    )
    expect(trMessages.knowledge.aiSuggestionsProcessingBannerTitle).toBe(
      'Hizmet profili önerileri hazırlanıyor'
    )
    expect(trMessages.knowledge.aiSuggestionsProcessingBannerDescription.toLowerCase()).toContain(
      'lütfen bekleyin'
    )
    expect(enMessages.knowledge.aiSuggestionsProcessingBannerTitle).toBe(
      'Service profile suggestions are being prepared'
    )
    expect(enMessages.knowledge.aiSuggestionsProcessingBannerDescription.toLowerCase()).toContain(
      'please wait'
    )
    expect(trMessages.knowledge.aiFill.loadingDescription.toLowerCase()).toContain('kontrol')
    expect(trMessages.knowledge.aiFill.loadingDescription.toLowerCase()).not.toContain('modal')
    expect(enMessages.knowledge.aiFill.loadingDescription.toLowerCase()).toContain('review')
    expect(enMessages.knowledge.aiFill.loadingDescription.toLowerCase()).not.toContain('modal')
    expect(trMessages.mainSidebar.botStatusQuickSwitchOnboardingLocked).toBe(
      'Başlangıç adımları tamamlanınca bot durumunu değiştirebilirsiniz.'
    )
    expect(trMessages.aiSettings.botModeLockedByOnboarding).toBe(
      'Başlangıç adımları tamamlanınca bot durumunu değiştirebilirsiniz.'
    )
    expect(trMessages.Channels.channelConnectionLocked.message).toBe(
      'Başlangıç adımları tamamlanınca kanallarınızı bağlayabilirsiniz.'
    )
    expect(trMessages.Channels.channelConnectionLocked.goToOnboarding).toBe(
      'Başlangıç adımlarına git'
    )
    expect(trMessages.Channels.status.pending).toBe('Test mesajı bekleniyor')
    expect(trMessages.Channels.gallery.pendingVerificationTitle).toBe('Aksiyon gerekli')
    expect(trMessages.Channels.gallery.pendingVerificationDescription.toLowerCase()).toContain(
      'yukarıdaki bağlı hesaba'
    )
    expect(trMessages.Channels.gallery.pendingVerificationDescription.toLowerCase()).toContain(
      'başka bir hesap'
    )
    expect(trMessages.Channels.gallery.pendingVerificationDescription.toLowerCase()).toContain(
      'kendi başka hesabınızdan'
    )
    expect(trMessages.Channels.onboarding.whatsapp.pendingDescription).not.toContain('{name}')
    expect(trMessages.Channels.onboarding.instagram.pendingDescription).not.toContain('{name}')
    expect(trMessages.Channels.onboarding.whatsapp.pendingDescription.toLowerCase()).toContain(
      'aşağıdaki'
    )
    expect(trMessages.Channels.onboarding.instagram.pendingDescription.toLowerCase()).toContain(
      'aşağıdaki'
    )
    expect(trMessages.onboarding.completionModal.title.toLowerCase()).toContain('tamamlandı')
    expect(trMessages.onboarding.completionModal.options.active.title).toBe('Aktif')
    expect(trMessages.onboarding.completionModal.options.shadow.title).toBe('Dinleyici')
    expect(trMessages.onboarding.completionModal.options.off.title.toLowerCase()).toContain(
      'kapalı'
    )
    expect(trMessages.calendar.introModal.title.toLowerCase()).toContain('randevu')
    expect(trMessages.calendar.introModal.items.googleSoon.title.toLowerCase()).toContain('google')
    expect(trMessages.calendar.introModal.items.workingHours.title).toBe(
      'Çalışma saatlerini belirle'
    )
    expect(trMessages.calendar.introModal.items.workingHours.body).toBe(
      'Açık günleri, saat aralıklarını ve hizmet sürelerini tanımla.'
    )
    expect(trMessages.simulator.introModal.description.toLowerCase()).toContain('kaydedilmez')
    expect(trMessages.simulator.introModal.description.toLowerCase()).toContain('denemen için')
    expect(trMessages.simulator.introModal.items.realMessage.title).toBe('Gerçek müşteri gibi yaz')
    expect(trMessages.simulator.introModal.items.debugDesktop.title).toBe('Detayı masaüstünde izle')
    expect(trMessages.simulator.introModal.secondaryCta).toBe('AI ayarlarına git')
  })
})
