import { describe, expect, it } from 'vitest'

import {
    buildMetaSignature,
    extractInstagramInboundEvents,
    isValidMetaSignature
} from '@/lib/instagram/webhook'

describe('instagram webhook utilities', () => {
    it('validates a correct meta signature', () => {
        const rawBody = '{"entry":[{"id":"123"}]}'
        const secret = 'super-secret'
        const signature = buildMetaSignature(rawBody, secret)

        expect(isValidMetaSignature(signature, rawBody, secret)).toBe(true)
    })

    it('rejects malformed or incorrect signatures', () => {
        const rawBody = '{"entry":[{"id":"123"}]}'
        const secret = 'super-secret'

        expect(isValidMetaSignature('', rawBody, secret)).toBe(false)
        expect(isValidMetaSignature('sha256=deadbeef', rawBody, secret)).toBe(false)
    })

    it('extracts inbound text instagram message events and keeps business echo messages as outbound conversation events', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                messaging: [{
                    sender: { id: 'ig-user-1' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000000,
                    message: {
                        mid: 'igmid-1',
                        text: 'Merhaba Instagram!'
                    }
                }, {
                    sender: { id: 'ig-business-1' },
                    recipient: { id: 'ig-user-1' },
                    timestamp: 1738000001,
                    message: {
                        mid: 'igmid-echo',
                        text: 'echo',
                        is_echo: true
                    }
                }, {
                    sender: { id: 'ig-user-1' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000002,
                    message: {
                        mid: 'igmid-image'
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-1',
            contactName: null,
            messageId: 'igmid-1',
            text: 'Merhaba Instagram!',
            timestamp: '1738000000',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-1',
            contactName: null,
            messageId: 'igmid-echo',
            text: 'echo',
            timestamp: '1738000001',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'outbound',
            skipAutomation: true
        }])
    })

    it('extracts inbound text events from standby payloads', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                standby: [{
                    sender: { id: 'ig-user-2' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000003,
                    message: {
                        mid: 'igmid-standby-1',
                        text: 'Selam, isteklerden yazıyorum'
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-2',
            contactName: null,
            messageId: 'igmid-standby-1',
            text: 'Selam, isteklerden yazıyorum',
            timestamp: '1738000003',
            eventSource: 'standby',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }])
    })

    it('extracts non-text inbound events and marks them as skipAutomation', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                messaging: [{
                    sender: { id: 'ig-user-3', username: 'tester' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000010,
                    message: {
                        mid: 'igmid-attachment-1',
                        attachments: [{
                            type: 'image',
                            payload: { url: 'https://example.com/a.jpg' }
                        }]
                    }
                }, {
                    sender: { id: 'ig-user-3' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000011,
                    postback: {
                        mid: 'igmid-postback-1',
                        payload: 'GET_STARTED'
                    }
                }, {
                    sender: { id: 'ig-user-3' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000012,
                    referral: {
                        source: 'ads'
                    }
                }, {
                    sender: { id: 'ig-user-3' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000013,
                    reaction: {
                        action: 'react',
                        emoji: '🔥'
                    }
                }, {
                    sender: { id: 'ig-user-3' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000014,
                    read: {
                        watermark: 1738000014
                    }
                }, {
                    sender: { id: 'ig-user-3' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000015,
                    optin: {
                        ref: 'menu'
                    }
                }, {
                    sender: { id: 'ig-user-3' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000016,
                    pass_thread_control: {
                        new_owner_app_id: '123'
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: 'tester',
            messageId: 'igmid-attachment-1',
            text: '[Instagram image]',
            timestamp: '1738000010',
            eventSource: 'messaging',
            eventType: 'attachment',
            direction: 'inbound',
            skipAutomation: true,
            media: {
                type: 'image',
                url: 'https://example.com/a.jpg',
                mimeType: null,
                caption: null
            }
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: null,
            messageId: 'igmid-postback-1',
            text: '[Instagram postback] GET_STARTED',
            timestamp: '1738000011',
            eventSource: 'messaging',
            eventType: 'postback',
            direction: 'inbound',
            skipAutomation: true
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: null,
            messageId: 'igevt:messaging:referral:ig-business-1:ig-user-3:1738000012:2',
            text: '[Instagram referral] ads',
            timestamp: '1738000012',
            eventSource: 'messaging',
            eventType: 'referral',
            direction: 'inbound',
            skipAutomation: true
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: null,
            messageId: 'igevt:messaging:reaction:ig-business-1:ig-user-3:1738000013:3',
            text: '[Instagram reaction] react 🔥',
            timestamp: '1738000013',
            eventSource: 'messaging',
            eventType: 'reaction',
            direction: 'inbound',
            skipAutomation: true
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: null,
            messageId: 'igevt:messaging:seen:ig-business-1:ig-user-3:1738000014:4',
            text: '[Instagram seen]',
            timestamp: '1738000014',
            eventSource: 'messaging',
            eventType: 'seen',
            direction: 'inbound',
            skipAutomation: true
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: null,
            messageId: 'igevt:messaging:optin:ig-business-1:ig-user-3:1738000015:5',
            text: '[Instagram opt-in]',
            timestamp: '1738000015',
            eventSource: 'messaging',
            eventType: 'optin',
            direction: 'inbound',
            skipAutomation: true
        }, {
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-3',
            contactName: null,
            messageId: 'igevt:messaging:handover:ig-business-1:ig-user-3:1738000016:6',
            text: '[Instagram handover event]',
            timestamp: '1738000016',
            eventSource: 'messaging',
            eventType: 'handover',
            direction: 'inbound',
            skipAutomation: true
        }])
    })

    it('keeps caption text alongside instagram image attachment metadata', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                messaging: [{
                    sender: { id: 'ig-user-10' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000020,
                    message: {
                        mid: 'igmid-image-caption-1',
                        text: 'Fiyatı bunun için merak ediyorum',
                        attachments: [{
                            type: 'image',
                            payload: { url: 'https://example.com/with-caption.jpg' }
                        }]
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-10',
            contactName: null,
            messageId: 'igmid-image-caption-1',
            text: 'Fiyatı bunun için merak ediyorum',
            timestamp: '1738000020',
            eventSource: 'messaging',
            eventType: 'attachment',
            direction: 'inbound',
            skipAutomation: false,
            media: {
                type: 'image',
                url: 'https://example.com/with-caption.jpg',
                mimeType: null,
                caption: 'Fiyatı bunun için merak ediyorum'
            }
        }])
    })

    it('extracts previewable share attachments when webhook includes a shared url', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                messaging: [{
                    sender: { id: 'ig-user-share' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000021,
                    message: {
                        mid: 'igmid-share-1',
                        text: 'Bunun fiyatı nedir?',
                        attachments: [{
                            type: 'share',
                            payload: {
                                url: 'https://cdn.example.com/shared-post.jpg'
                            }
                        }, {
                            type: 'ig_post'
                        }]
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-share',
            contactName: null,
            messageId: 'igmid-share-1',
            text: 'Bunun fiyatı nedir?',
            timestamp: '1738000021',
            eventSource: 'messaging',
            eventType: 'attachment',
            direction: 'inbound',
            skipAutomation: false,
            media: {
                type: 'unknown',
                originalType: 'share',
                previewKind: 'image',
                url: 'https://cdn.example.com/shared-post.jpg',
                mimeType: null,
                caption: 'Bunun fiyatı nedir?'
            }
        }])
    })

    it('extracts reply-to story preview urls from instagram story replies', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                messaging: [{
                    sender: { id: 'ig-user-story' },
                    recipient: { id: 'ig-business-1' },
                    timestamp: 1738000022,
                    message: {
                        mid: 'igmid-story-reply-1',
                        text: 'Bununla ilgili detay alabilir miyim?',
                        reply_to: {
                            story: {
                                id: 'story-1',
                                url: 'https://cdn.example.com/story-preview.jpg'
                            }
                        },
                        is_unsupported: true
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-story',
            contactName: null,
            messageId: 'igmid-story-reply-1',
            text: 'Bununla ilgili detay alabilir miyim?',
            timestamp: '1738000022',
            eventSource: 'messaging',
            eventType: 'attachment',
            direction: 'inbound',
            skipAutomation: false,
            media: {
                type: 'unknown',
                originalType: 'reply_to_story',
                previewKind: 'image',
                url: 'https://cdn.example.com/story-preview.jpg',
                mimeType: null,
                caption: 'Bununla ilgili detay alabilir miyim?'
            }
        }])
    })

    it('extracts inbound text events from entry.changes messages field', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                changes: [{
                    field: 'messages',
                    value: {
                        sender: { id: 'ig-user-9' },
                        recipient: { id: 'ig-business-1' },
                        timestamp: 1739000000,
                        message: {
                            mid: 'igmid-change-1',
                            text: 'Merhaba changes'
                        }
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-9',
            contactName: null,
            messageId: 'igmid-change-1',
            text: 'Merhaba changes',
            timestamp: '1739000000',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }])
    })

    it('does not drop inbound events when recipient id differs from entry id', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                changes: [{
                    field: 'standby',
                    value: {
                        sender: { id: 'ig-user-standby' },
                        recipient: { id: 'app-scoped-recipient-1' },
                        timestamp: 1739000001,
                        message: {
                            mid: 'igmid-change-standby-1',
                            text: 'Isteklerden selam'
                        }
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-standby',
            contactName: null,
            messageId: 'igmid-change-standby-1',
            text: 'Isteklerden selam',
            timestamp: '1739000001',
            eventSource: 'standby',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }])
    })

    it('extracts nested messaging payloads inside entry.changes value', () => {
        const payload = {
            object: 'instagram',
            entry: [{
                id: 'ig-business-1',
                changes: [{
                    field: 'messages',
                    value: {
                        messaging: [{
                            sender: { id: 'ig-user-nested' },
                            recipient: { id: 'ig-business-1' },
                            timestamp: 1739000002,
                            message: {
                                mid: 'igmid-nested-1',
                                text: 'Nested payload calisti'
                            }
                        }]
                    }
                }]
            }]
        }

        const events = extractInstagramInboundEvents(payload)

        expect(events).toEqual([{
            instagramBusinessAccountId: 'ig-business-1',
            contactId: 'ig-user-nested',
            contactName: null,
            messageId: 'igmid-nested-1',
            text: 'Nested payload calisti',
            timestamp: '1739000002',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }])
    })
})
