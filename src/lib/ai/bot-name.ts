import { DEFAULT_BOT_NAME, normalizeBotName } from './prompts'

export function isDefaultBotName(botName?: string | null) {
  return normalizeBotName(botName) === DEFAULT_BOT_NAME
}

export function resolveInboxBotDisplayName(
  botName: string | null | undefined,
  assistantLabel: string
) {
  return isDefaultBotName(botName) ? assistantLabel : normalizeBotName(botName)
}
