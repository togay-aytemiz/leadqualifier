import type { SkillInsert } from '@/types/database'

type SupportedLocale = 'tr' | 'en'

type DefaultSkillTemplate = Pick<SkillInsert, 'title' | 'trigger_examples' | 'response_text'>

const DEFAULT_SYSTEM_SKILL_TEMPLATES: Record<SupportedLocale, DefaultSkillTemplate[]> = {
    tr: [
        {
            title: 'İnsan Desteği Talebi',
            trigger_examples: [
                'Beni bir insana bağlar mısınız?',
                'Müşteri temsilcisi ile görüşmek istiyorum',
                'Yetkili biriyle konuşabilir miyim?'
            ],
            response_text: 'Tabii, sizi hemen ekibimizden bir uzmana aktarıyorum.'
        },
        {
            title: 'Şikayet ve Memnuniyetsizlik',
            trigger_examples: [
                'Şikayetim var',
                'Hizmetten memnun kalmadım',
                'Bu konuda destek istiyorum'
            ],
            response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.'
        },
        {
            title: 'Acil Talep',
            trigger_examples: [
                'Acil dönüş yapabilir misiniz?',
                'Bu konu çok acil',
                'Hemen birine bağlayın'
            ],
            response_text: 'Acil talebinizi aldım. Sizi hemen ilgili ekibimize aktarıyorum.'
        },
        {
            title: 'Gizlilik ve Veri Talebi',
            trigger_examples: [
                'Verilerimi silmek istiyorum',
                'Mesaj iznimi geri çekiyorum',
                'Gizlilik konusunda biriyle görüşmek istiyorum'
            ],
            response_text: 'Gizlilik ve veri talebinizi aldım. İşlem için sizi hemen ekibimize aktarıyorum.'
        }
    ],
    en: [
        {
            title: 'Request Human Support',
            trigger_examples: [
                'Can I talk to a human?',
                'I want to speak with an agent',
                'Please connect me to support'
            ],
            response_text: 'Sure, I am connecting you to our team right away.'
        },
        {
            title: 'Complaint and Dissatisfaction',
            trigger_examples: [
                'I have a complaint',
                'I am not happy with the service',
                'I need support for this issue'
            ],
            response_text: 'I am sorry about your experience. I am escalating this to our team now.'
        },
        {
            title: 'Urgent Request',
            trigger_examples: [
                'This is urgent',
                'Please get back to me urgently',
                'Connect me to someone immediately'
            ],
            response_text: 'I have received your urgent request. I am escalating it to our team now.'
        },
        {
            title: 'Privacy and Data Request',
            trigger_examples: [
                'I want my data deleted',
                'I withdraw my messaging consent',
                'I need to discuss privacy'
            ],
            response_text: 'I have received your privacy and data request. I am escalating it to our team now.'
        }
    ]
}

function resolveLocale(locale?: string): SupportedLocale {
    return locale?.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

export function getDefaultSystemSkillTemplates(locale?: string): DefaultSkillTemplate[] {
    const selected = DEFAULT_SYSTEM_SKILL_TEMPLATES[resolveLocale(locale)]
    return selected.map((template) => ({
        ...template,
        trigger_examples: [...template.trigger_examples]
    }))
}

export function buildDefaultSystemSkills(organizationId: string, locale?: string): SkillInsert[] {
    const templates = getDefaultSystemSkillTemplates(locale)

    return templates.map((template) => ({
        organization_id: organizationId,
        title: template.title,
        trigger_examples: template.trigger_examples,
        response_text: template.response_text,
        enabled: true,
        requires_human_handover: true
    }))
}
