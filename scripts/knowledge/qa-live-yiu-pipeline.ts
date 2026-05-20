import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'

const ORG_ID = process.env.QA_ORG_ID?.trim() || '37222032-c2e8-4125-a027-be39eb6603f8'

type Audience = 'candidate' | 'admin'
type SourceKind = 'web' | 'pdf'

type QaCase = {
    audience: Audience
    sourceKind: SourceKind
    question: string
    mustContain: string[]
    anyOf?: string[][]
    expectedUrls?: string[]
    forbid?: RegExp[]
}

const QA_CASES: QaCase[] = [
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Yüksek İhtisas Üniversitesi’nde hangi fakülteler var?',
        mustContain: ['Tıp Fakültesi', 'Sağlık Bilimleri Fakültesi', 'Sağlık Hizmetleri Meslek Yüksekokulu', 'Spor Bilimleri Fakültesi']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Tıp Fakültesi İngilizce mi, hazırlık okumam gerekir mi?',
        mustContain: ['İngilizce', 'hazırlık'],
        anyOf: [['muafiyet', 'sınav']]
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Tıp Fakültesi eğitimi nasıl ilerliyor, staj ve klinik uygulama var mı?',
        mustContain: ['klinik', 'staj'],
        anyOf: [['pratik', 'intörn', 'uygulama']]
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Sağlık Hizmetleri MYO’da İlk ve Acil Yardım bölümü var mı?',
        mustContain: ['İlk ve Acil Yardım', 'Sağlık Hizmetleri Meslek Yüksekokulu']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Meslek Yüksekokulu’nda Bilgisayar Programcılığı bölümü var mı?',
        mustContain: ['Bilgisayar Programcılığı', 'Meslek Yüksekokulu']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Erasmus Programı sayfasının linki nedir?',
        mustContain: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/ogrenci/erasmus/erasmus-programi'],
        expectedUrls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/ogrenci/erasmus/erasmus-programi']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Akademik takvim linki nedir?',
        mustContain: ['https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim'],
        expectedUrls: ['https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Yurtlar hakkında bilgi alabileceğim sayfa var mı?',
        mustContain: ['yurt'],
        expectedUrls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Aday öğrenci sayfasında ücretler ve burslar nerede?',
        mustContain: ['ücret', 'burs'],
        expectedUrls: ['https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci']
    },
    {
        audience: 'candidate',
        sourceKind: 'web',
        question: 'Sağlık Yönetimi bölümü hangi fakültede?',
        mustContain: ['Sağlık Yönetimi', 'Sağlık Bilimleri Fakültesi']
    },
    {
        audience: 'candidate',
        sourceKind: 'pdf',
        question: 'Uluslararası Öğrenci Kabul Yönergesi hangi programlara yurt dışından başvuru için geçerli?',
        mustContain: ['ön lisans', 'lisans'],
        anyOf: [['yurt dışından', 'yurtdışından']]
    },
    {
        audience: 'candidate',
        sourceKind: 'pdf',
        question: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliğinde AKTS ne demek?',
        mustContain: ['Avrupa Kredi Transfer Sistemi']
    },
    {
        audience: 'candidate',
        sourceKind: 'pdf',
        question: 'Erasmus+ Programı Yönergesinin kapsamı nedir?',
        mustContain: ['Erasmus'],
        anyOf: [['öğrenci', 'akademik', 'idari', 'hareketlilik']]
    },
    {
        audience: 'candidate',
        sourceKind: 'pdf',
        question: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesinin doküman numarası nedir?',
        mustContain: ['TIP.YNG.0018']
    },
    {
        audience: 'candidate',
        sourceKind: 'pdf',
        question: 'Tıp Fakültesi Dönem VI İntörn Hekimlik Eğitimi Yönergesinde intörnler zorunlu staj yapıyor mu?',
        mustContain: ['intörn', 'zorunlu', 'staj']
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'Mevzuat Komisyonu İş Akış Şeması doküman numarası nedir?',
        mustContain: ['YİU.İAŞ.0006']
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'Bilimsel Araştırma ve Yayın Etiği Yönergesinin amacı nedir?',
        mustContain: ['bilimsel araştırma', 'etik'],
        anyOf: [['yetki', 'sorumluluk']]
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'İş Sağlığı ve Güvenliği İç Yönergesi hangi birimleri kapsıyor?',
        mustContain: ['tüm birimleri'],
        anyOf: [['bina', 'eklentileri']]
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'İmza Yetkileri Yönergesi hangi Senato kararıyla kabul edilmiş?',
        mustContain: ['2022/55']
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'Satın Alma ve İhale Yönetmeliği hangi alımlar için usul ve esas belirliyor?',
        mustContain: ['mal', 'hizmet']
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'Tıpta Uzmanlık Eğitimi Yönergesi hangi kurulun çalışmalarını düzenliyor?',
        mustContain: ['Tıpta Uzmanlık Eğitimi Kurulu']
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'Tıp Fakültesi Ölçme ve Değerlendirme Kurulu Yönergesi neyi düzenler?',
        mustContain: ['Ölçme', 'Değerlendirme', 'Kurul']
    },
    {
        audience: 'admin',
        sourceKind: 'pdf',
        question: 'Tıp Fakültesi Koordinatörler Kurulu Yönergesinin amacı nedir?',
        mustContain: ['Koordinatörler Kurulu']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'Bilgi İşlem Birimi iletişim bilgisi nedir?',
        mustContain: ['+90 312 329 10 10', '256', '258', 'bilgiislem@yuksekihtisas.edu.tr']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'Yazı İşleri Müdürlüğü iletişim bilgisi nedir?',
        mustContain: ['201', 'yaziisleri@yuksekihtisas.edu.tr']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'Kütüphane e-posta adresi nedir?',
        mustContain: ['kutuphane@yuksekihtisas.edu.tr']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'İş Sağlığı ve Güvenliği Koordinatörü kim olarak görünüyor?',
        mustContain: ['Elanur', 'DİKİCİOĞLU']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'Kurumsal mevzuat sayfası linki nedir?',
        mustContain: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat'],
        expectedUrls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'Tıp Fakültesi yönergeleri sayfası linki nedir?',
        mustContain: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar/yonergeler'],
        expectedUrls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar/yonergeler']
    },
    {
        audience: 'admin',
        sourceKind: 'web',
        question: 'Rektörlük ve Tıp Fakültesi telefon numarası nedir?',
        mustContain: ['+90 312 329 10 10']
    }
]

function parseEnvValue(value: string) {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

async function loadEnvFile(filePath: string, protectedKeys: Set<string>) {
    try {
        const content = await readFile(filePath, 'utf8')
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const equalsIndex = trimmed.indexOf('=')
            if (equalsIndex === -1) continue

            const key = trimmed.slice(0, equalsIndex).trim()
            const value = parseEnvValue(trimmed.slice(equalsIndex + 1))
            if (!key || protectedKeys.has(key)) continue
            process.env[key] = value
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

async function loadProjectEnv() {
    const protectedKeys = new Set(Object.keys(process.env))
    const cwd = process.cwd()
    await loadEnvFile(path.join(cwd, '.env'), protectedKeys)
    await loadEnvFile(path.join(cwd, '.env.local'), protectedKeys)
    await loadEnvFile(path.join(cwd, '.env.development.local'), protectedKeys)
}

function requireEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} is required`)
    return value
}

function compact(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .normalize('NFKC')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => ({
            ı: 'i',
            İ: 'i',
            ğ: 'g',
            Ğ: 'g',
            ü: 'u',
            Ü: 'u',
            ş: 's',
            Ş: 's',
            ö: 'o',
            Ö: 'o',
            ç: 'c',
            Ç: 'c'
        }[char] ?? char))
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function compactToken(value: string) {
    return compact(value).replace(/\s+/g, '')
}

function digitsOnly(value: string) {
    return value.replace(/\D+/g, '')
}

function containsTerm(answer: string, term: string) {
    const normalizedAnswer = compact(answer)
    const normalizedTerm = compact(term)
    if (normalizedAnswer.includes(normalizedTerm)) return true
    if (/\d/.test(term) && digitsOnly(answer).includes(digitsOnly(term))) return true
    return compactToken(answer).includes(compactToken(term))
}

function extractUrls(answer: string) {
    return Array.from(new Set(answer.match(/https?:\/\/\S+/gi) ?? []))
        .map((url) => url.replace(/[)\].,;:!?]+$/g, ''))
}

function findFormatFlags(answer: string, testCase: QaCase) {
    const flags: string[] = []
    if (/^\s*(?:edu|com|net|org|gov)\./i.test(answer)) flags.push('leading_domain_fragment')
    if (/\b(?:edu|com|net|org|gov)\.\s+(?:tr|com|net|org|gov)\b/i.test(answer)) flags.push('spaced_domain')
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.\s+(?:tr|com|net|org|edu|gov|io|ai)\b/i.test(answer)) flags.push('spaced_email_domain')
    if (/\[[^\]\n]+]\(\s*https?:\/\//i.test(answer)) flags.push('markdown_link')
    const urls = extractUrls(answer)
    if (testCase.expectedUrls && urls.length > testCase.expectedUrls.length) flags.push('too_many_urls')
    if (!/\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir\.\s*$/i.test(answer)) flags.push('disclaimer_format')
    if (testCase.forbid?.some((pattern) => pattern.test(answer))) flags.push('forbidden_content')
    if (/NO_ANSWER/i.test(answer)) flags.push('raw_no_answer')
    return flags
}

function evaluateAnswer(testCase: QaCase, answer: string) {
    const missing = testCase.mustContain.filter((term) => !containsTerm(answer, term))
    const missingAnyGroups = (testCase.anyOf ?? []).filter((group) => !group.some((term) => containsTerm(answer, term)))
    const urls = extractUrls(answer)
    const missingUrls = (testCase.expectedUrls ?? []).filter((url) => !urls.includes(url))
    const flags = findFormatFlags(answer, testCase)
    const genericFallback = /Buradan devam ederek uygun seçenekleri netleştirebiliriz/i.test(answer)
        && (missing.length > 0 || missingAnyGroups.length > 0 || missingUrls.length > 0)

    return {
        passed: missing.length === 0
            && missingAnyGroups.length === 0
            && missingUrls.length === 0
            && flags.length === 0
            && !genericFallback,
        missing,
        missingAnyGroups,
        missingUrls,
        flags,
        urls,
        genericFallback
    }
}

async function main() {
    await loadProjectEnv()

    const supabase = createClient(
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    requireEnv('OPENAI_API_KEY')

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const results: Array<{
        index: number
        audience: Audience
        sourceKind: SourceKind
        question: string
        answer: string
        conversationId: string | null
        passed: boolean
        missing: string[]
        missingAnyGroups: string[][]
        missingUrls: string[]
        flags: string[]
        urls: string[]
        genericFallback: boolean
    }> = []

    for (let index = 0; index < QA_CASES.length; index += 1) {
        const testCase = QA_CASES[index]!
        const contactId = `codex-live-yiu-demo-qa-${runId}-${index + 1}`
        const outbound: string[] = []

        await processInboundAiPipeline({
            supabase,
            organizationId: ORG_ID,
            platform: 'whatsapp',
            source: 'whatsapp',
            contactId,
            contactName: `Codex YIU Demo QA ${index + 1}`,
            text: testCase.question,
            inboundMessageId: `codex-live-yiu-demo-qa-${runId}-${index + 1}`,
            inboundMessageIdMetadataKey: 'codex_live_yiu_demo_qa_message_id',
            inboundMessageMetadata: {
                codex_live_yiu_demo_qa: true,
                codex_live_yiu_demo_qa_run_id: runId,
                codex_live_yiu_demo_qa_index: index + 1,
                audience: testCase.audience,
                source_kind: testCase.sourceKind
            },
            sendOutbound: async (content) => {
                if (typeof content === 'string') {
                    outbound.push(content)
                } else if ('content' in content) {
                    outbound.push(content.content)
                } else {
                    outbound.push('[non-text outbound message]')
                }
                return { providerMessageId: `codex-live-yiu-demo-qa-out-${runId}-${index + 1}` }
            },
            logPrefix: 'Codex Live YIU Demo QA'
        })

        const { data: conversation } = await supabase
            .from('conversations')
            .select('id, tags')
            .eq('organization_id', ORG_ID)
            .eq('platform', 'whatsapp')
            .eq('contact_phone', contactId)
            .maybeSingle()

        if (conversation?.id) {
            const tags = Array.isArray(conversation.tags) ? conversation.tags : []
            await supabase
                .from('conversations')
                .update({
                    tags: Array.from(new Set([...tags, 'codex_live_qa', 'codex_yiu_demo_qa'])),
                    contact_name: `Codex YIU Demo QA ${index + 1}`
                })
                .eq('id', conversation.id)
        }

        const answer = outbound.at(-1) ?? ''
        const evaluation = evaluateAnswer(testCase, answer)

        results.push({
            index: index + 1,
            audience: testCase.audience,
            sourceKind: testCase.sourceKind,
            question: testCase.question,
            answer,
            conversationId: conversation?.id ?? null,
            ...evaluation
        })

        console.log(`${evaluation.passed ? 'PASS' : 'FAIL'} ${index + 1}/${QA_CASES.length} [${testCase.audience}/${testCase.sourceKind}] ${testCase.question}`)
        console.log(answer.replace(/\s+/g, ' ').slice(0, 420))
        if (!evaluation.passed) {
            console.log(JSON.stringify({
                missing: evaluation.missing,
                missingAnyGroups: evaluation.missingAnyGroups,
                missingUrls: evaluation.missingUrls,
                flags: evaluation.flags,
                urls: evaluation.urls,
                genericFallback: evaluation.genericFallback,
                conversationId: conversation?.id ?? null
            }, null, 2))
        }
        console.log('')
    }

    const passed = results.filter((result) => result.passed).length
    const byAudience = ['candidate', 'admin'].map((audience) => {
        const items = results.filter((result) => result.audience === audience)
        return `${audience}: ${items.filter((item) => item.passed).length}/${items.length}`
    })
    const bySource = ['web', 'pdf'].map((sourceKind) => {
        const items = results.filter((result) => result.sourceKind === sourceKind)
        return `${sourceKind}: ${items.filter((item) => item.passed).length}/${items.length}`
    })

    const reportLines = [
        '# Live YIU Demo Pipeline QA',
        '',
        `Run ID: ${runId}`,
        `Organization: ${ORG_ID}`,
        `Summary: ${passed}/${results.length} passed`,
        `Audience: ${byAudience.join(' | ')}`,
        `Source: ${bySource.join(' | ')}`,
        '',
        '## Failures',
        ''
    ]

    const failures = results.filter((result) => !result.passed)
    if (failures.length === 0) {
        reportLines.push('No failures.')
    } else {
        for (const result of failures) {
            reportLines.push(`- #${result.index} [${result.audience}/${result.sourceKind}] ${result.question}`)
            reportLines.push(`  - missing: ${result.missing.join(' | ') || '-'}`)
            reportLines.push(`  - missing any groups: ${result.missingAnyGroups.map((group) => group.join(' / ')).join(' | ') || '-'}`)
            reportLines.push(`  - missing urls: ${result.missingUrls.join(' | ') || '-'}`)
            reportLines.push(`  - flags: ${result.flags.join(' | ') || '-'}`)
            reportLines.push(`  - conversation: ${result.conversationId ?? 'n/a'}`)
        }
    }

    reportLines.push('', '## Details', '')
    for (const result of results) {
        reportLines.push(`### ${result.index}. ${result.passed ? 'PASS' : 'FAIL'} [${result.audience}/${result.sourceKind}]`)
        reportLines.push('')
        reportLines.push(`Question: ${result.question}`)
        reportLines.push('')
        reportLines.push(`Conversation: ${result.conversationId ?? 'n/a'}`)
        reportLines.push('')
        reportLines.push('```text')
        reportLines.push(result.answer)
        reportLines.push('```')
        reportLines.push('')
    }

    await mkdir(path.join(process.cwd(), 'tmp', 'crawl-output'), { recursive: true })
    const reportPath = path.join(process.cwd(), 'tmp', 'crawl-output', `live-yiu-demo-pipeline-qa-${runId}.md`)
    await writeFile(reportPath, `${reportLines.join('\n')}\n`, 'utf8')

    console.log(`SUMMARY ${passed}/${results.length} passed`)
    console.log(`AUDIENCE ${byAudience.join(' | ')}`)
    console.log(`SOURCE ${bySource.join(' | ')}`)
    console.log(`RUN_ID ${runId}`)
    console.log(`REPORT ${reportPath}`)
    for (const result of results) {
        console.log(`${result.passed ? 'PASS' : 'FAIL'} #${result.index} conversation=${result.conversationId ?? 'n/a'}`)
    }

    if (passed !== results.length) {
        process.exitCode = 1
    }
}

await main()
