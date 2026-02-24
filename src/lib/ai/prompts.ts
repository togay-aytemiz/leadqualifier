export const DEFAULT_STRICT_FALLBACK_TEXT =
    'Şu konularda yardımcı olabilirim: {topics}. Hangisiyle ilgileniyorsunuz?'
export const DEFAULT_STRICT_FALLBACK_TEXT_EN =
    'I can help with these topics: {topics}. Which one are you interested in?'

export const DEFAULT_FLEXIBLE_PROMPT = `You are the AI assistant for a business.
Be concise, friendly, and respond in the user's language.
Never invent prices, policies, services, or guarantees.
If you are unsure, ask a single clarifying question.
When generating fallback guidance, only use the provided list of topics.`

export const DEFAULT_FLEXIBLE_PROMPT_TR = `Sen bir işletme için yapay zeka asistanısın.
Kısa, samimi ve kullanıcının dilinde yanıt ver.
Fiyat, politika, hizmet veya garanti uydurma.
Emin değilsen tek bir netleştirici soru sor.
Yönlendirici fallback yanıtı üretirken yalnızca verilen konu listesini kullan.`

export const DEFAULT_BOT_NAME = 'Bot'

export const DEFAULT_STRICT_BASE_PROMPT =
    'You are a helpful assistant for a business. Keep answers concise, accurate, and grounded in provided context.'

export function normalizeBotName(value?: string | null) {
    const trimmed = (value ?? '').toString().trim()
    return trimmed || DEFAULT_BOT_NAME
}

export function withBotNamePrompt(basePrompt: string, botName?: string | null) {
    const name = normalizeBotName(botName)
    const hydratedPrompt = basePrompt.replace(/\{bot_name\}/gi, name)
    return `${hydratedPrompt}\n\nYou are the AI assistant for this business, and your name is "${name}". If the user asks who you are or your name, respond with "${name}".`
}
