import { describe, expect, it } from 'vitest'

import { resolveInboxBotDisplayName } from './bot-name'

describe('resolveInboxBotDisplayName', () => {
  it('keeps the generic assistant label when the stored bot name is still default', () => {
    expect(resolveInboxBotDisplayName(null, 'Yapay Zeka Asistanı')).toBe('Yapay Zeka Asistanı')
    expect(resolveInboxBotDisplayName('', 'Yapay Zeka Asistanı')).toBe('Yapay Zeka Asistanı')
    expect(resolveInboxBotDisplayName('Bot', 'Yapay Zeka Asistanı')).toBe('Yapay Zeka Asistanı')
  })

  it('shows the customized bot name once the user changes it', () => {
    expect(resolveInboxBotDisplayName('Qualy', 'Yapay Zeka Asistanı')).toBe('Qualy')
    expect(resolveInboxBotDisplayName('  Klinik Asistanı  ', 'Yapay Zeka Asistanı')).toBe(
      'Klinik Asistanı'
    )
  })
})
