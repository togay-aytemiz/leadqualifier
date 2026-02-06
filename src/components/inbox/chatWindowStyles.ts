import type { MessageSenderType } from '@/types/database'

const BOT_MESSAGE_BUBBLE_CLASSES = 'bg-violet-800 text-violet-50 rounded-tr-none'
const USER_MESSAGE_BUBBLE_CLASSES = 'bg-blue-100 text-blue-900 rounded-tr-none'
const CONTACT_MESSAGE_BUBBLE_CLASSES = 'bg-white text-gray-800 rounded-tl-none'

export function getInboxMessageBubbleClasses(senderType: MessageSenderType) {
    if (senderType === 'bot') return BOT_MESSAGE_BUBBLE_CLASSES
    if (senderType === 'user') return USER_MESSAGE_BUBBLE_CLASSES
    return CONTACT_MESSAGE_BUBBLE_CLASSES
}
