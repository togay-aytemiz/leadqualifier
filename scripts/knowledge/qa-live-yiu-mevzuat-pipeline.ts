import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'

const ORG_ID = process.env.QA_ORG_ID?.trim() || '37222032-c2e8-4125-a027-be39eb6603f8'

type QaCase = {
    question: string
    sourceTitles: string[]
    mustContain?: string[]
    anyOf?: string[][]
}

type QaBotMessage = {
    id: string
    content: string
    metadata: {
        sources?: unknown
    } | null
    created_at: string
}

type QaKnowledgeDocument = {
    id: string
    title: string | null
}

const QA_CASES: QaCase[] = [
    { question: 'Mevzuat Komisyonu İş Akış Şeması doküman numarası nedir?', sourceTitles: ['Mevzuat Komisyonu İş Akış Şeması'], mustContain: ['YİU.İAŞ.0006'] },
    { question: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliğinde AKTS ne demek?', sourceTitles: ['Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'], mustContain: ['Avrupa Kredi Transfer Sistemi'] },
    { question: 'Sağlık raporu olduğu halde sınava giren öğrencinin sınavı geçerli sayılır mı?', sourceTitles: ['Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'], mustContain: ['geçersiz'] },
    { question: 'Satın Alma ve İhale Yönetmeliği hangi alımlar için usul ve esas belirliyor?', sourceTitles: ['Satın Alma ve İhale Yönetmeliği'], mustContain: ['mal', 'hizmet'] },
    { question: 'İmza Yetkileri Yönergesi hangi Senato kararıyla kabul edilmiş?', sourceTitles: ['İmza Yetkileri Yönergesi'], mustContain: ['2022/55'] },
    { question: 'Personelin ücretsiz izin süresi en fazla ne kadar?', sourceTitles: ['İzin Kullanımı Yönergesi'], mustContain: ['1', 'yıl'] },
    { question: 'İzin Kullanımı Yönergesinin doküman numarası nedir?', sourceTitles: ['İzin Kullanımı Yönergesi'], mustContain: ['PDB.YNG.0002'] },
    { question: 'PDB.YNG.0001 hangi yönergeye ait?', sourceTitles: ['Hizmet İçi Eğitim Yönergesi'], mustContain: ['Hizmet İçi Eğitim'] },
    { question: 'İdari Personel Disiplin Yönergesinin doküman numarası nedir?', sourceTitles: ['YİÜ İdari Personele ait İşyeri Disiplin Yönergesi'], mustContain: ['PDB.YNG.0003'] },
    { question: 'BİDB kısaltması hangi birimi ifade ediyor olabilir?', sourceTitles: ['Bilgi İşlem Daire Başkanlığı (BİDB)', 'BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge', 'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi'], mustContain: ['Bilgi İşlem Daire Başkanlığı'] },
    { question: 'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesinin doküman numarası nedir?', sourceTitles: ['BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi'], mustContain: ['BİDB.YNG.0002'] },
    { question: 'BİDB Çalışma Usul ve Esasları Hakkındaki Yönergenin doküman numarası nedir?', sourceTitles: ['BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge'], mustContain: ['BİDB.YNG.0001'] },
    { question: 'BAP kısaltması hangi yönerge başlığında geçiyor?', sourceTitles: ['Bilimsel Araştırma Projeleri Uygulama Yönergesi'], mustContain: ['Bilimsel Araştırma Projeleri'] },
    { question: 'Bilimsel Araştırma Projeleri Uygulama Yönergesinin doküman numarası nedir?', sourceTitles: ['Bilimsel Araştırma Projeleri Uygulama Yönergesi'], mustContain: ['BAP.YNG.0001'] },
    { question: 'Bologna Eşgüdüm Komisyonu Yönergesinin amacı nedir?', sourceTitles: ['Bologna Eşgüdüm Komisyonu Yönergesi'], mustContain: ['Bologna'] },
    { question: 'Diploma, Diploma Eki ve Diğer Mezuniyet Belgeleri Yönergesinde doktora için hangi diploma verilir?', sourceTitles: ['Diploma, Diploma Eki ve Diğer Mezuniyet Belgeleri Yönergesi'], mustContain: ['Doktora Diploması'] },
    { question: 'Doküman Hazırlama ve Kontrol Yönergesinin doküman numarası nedir?', sourceTitles: ['Doküman Hazırlama ve Kontrol Yönergesi'], mustContain: ['KALİTE.YNG.0002'] },
    { question: 'Kalite Güvencesi Yönergesinin doküman numarası nedir?', sourceTitles: ['Kalite Güvencesi Yönergesi'], mustContain: ['KALİTE.YNG.0001'] },
    { question: 'EÖB.YNG.0001 hangi yönergeye ait?', sourceTitles: ['Engelli Öğrenci Birimi Yönergesi'], mustContain: ['Engelli Öğrenci Birimi'] },
    { question: 'Engelli Öğrenci Birimi Yönergesinin amacı nedir?', sourceTitles: ['Engelli Öğrenci Birimi Yönergesi'], mustContain: ['engelli öğrencilerin'] },
    { question: 'Erasmus+ Programı Yönergesinin doküman numarası nedir?', sourceTitles: ['Erasmus + Yönergesi'], mustContain: ['EK.YNG.0001'] },
    { question: 'Erasmus+ Programı Yönergesinde hazırlık öğrencileri programdan yararlanabilir mi?', sourceTitles: ['Erasmus + Yönergesi'], mustContain: ['Hazırlık'], anyOf: [['yararlanamaz', 'yararlanamazlar']] },
    { question: 'Girişimsel Olmayan Araştırmalar Etik Kurulu Yönergesinin amacı nedir?', sourceTitles: ['Girişimsel Olmayan Araştırmalar Etik Kurulu Yönergesi'], mustContain: ['Girişimsel Olmayan Araştırmalar Etik Kurulu'] },
    { question: 'İSGK.YNG.0001 hangi yönergeye ait?', sourceTitles: ['İş Sağlığı ve Güvenliği İç Yönergesi'], mustContain: ['İş Sağlığı ve Güvenliği İç Yönergesi'] },
    { question: 'İSG-KATİP neyi ifade eder?', sourceTitles: ['İş Sağlığı ve Güvenliği İç Yönergesi'], mustContain: ['Kayıt', 'Takip', 'İzleme'] },
    { question: 'SKSDB kısaltması hangi daire başkanlığını ifade ediyor?', sourceTitles: ['Sağlık, Kültür ve Spor Dairesi Başkanlığı Yönergesi', 'SKSDB Kültür ve Sosyal Hizmetler Yönergesi'], mustContain: ['Sağlık', 'Kültür', 'Spor'] },
    { question: 'Sağlık, Kültür ve Spor Dairesi Başkanlığı Yönergesinin doküman numarası nedir?', sourceTitles: ['Sağlık, Kültür ve Spor Dairesi Başkanlığı Yönergesi'], mustContain: ['SKSDB.YNG.0001'] },
    { question: 'Kısmi Zamanlı Öğrenci Çalıştırma Yönergesinin doküman numarası nedir?', sourceTitles: ['Kısmi Zamanlı Öğrenci Çalıştırma Yönergesi'], mustContain: ['SKSDB.YNG.0007'] },
    { question: 'SKSDB Kültür ve Sosyal Hizmetler Yönergesinin doküman numarası nedir?', sourceTitles: ['SKSDB Kültür ve Sosyal Hizmetler Yönergesi'], mustContain: ['SKSDB.YNG.0003'] },
    { question: 'Kütüphane ve Dökümantasyon Daire Başkanlığı Yönergesinin amacı nedir?', sourceTitles: ['Kütüphane ve Dökümantasyon Daire Başkanlığı Yönergesi'], mustContain: ['Kütüphane'] },
    { question: 'Kurumsal Risk Yönetimi Yönergesinin doküman numarası nedir?', sourceTitles: ['Kurumsal Risk Yönetimi Yönergesi'], mustContain: ['KRYK.YNG.0001'] },
    { question: 'Mevzuat Komisyonu Yönergesi hangi komisyonu düzenler?', sourceTitles: ['Mevzuat Komisyonu Yönergesi'], mustContain: ['Mevzuat Komisyonu'] },
    { question: 'Muafiyet ve İntibak İşlemleri Yönergesinin amacı nedir?', sourceTitles: ['Muafiyet ve İntibak İşlemleri Yönergesi'], mustContain: ['muafiyet', 'intibak'] },
    { question: 'Özel Öğrenci Yönergesi hangi Senato kararıyla kabul edilmiş?', sourceTitles: ['Özel Öğrenci Yönergesi'], mustContain: ['2020/87'] },
    { question: 'Stratejik Plan Yönergesinin doküman numarası nedir?', sourceTitles: ['Stratejik Plan Yönergesi'], mustContain: ['SGDB.YNG.0001'] },
    { question: 'SEM.YNG.0001 hangi yönergeye ait?', sourceTitles: ['Sürekli Eğitim Merkezi ve Sertifika Programları Yönergesi'], mustContain: ['Sürekli Eğitim'] },
    { question: 'TTO kısaltması hangi ofisi ifade ediyor olabilir?', sourceTitles: ['Teknoloji Transfer Ofisi (TTO)', 'Technology Transfer Office (TTO)', 'Teknoloji Transfer Ofisi Yönergesi'], mustContain: ['Teknoloji Transfer Ofisi'] },
    { question: 'Teknoloji Transfer Ofisi Yönergesi hangi Senato kararıyla kabul edilmiş?', sourceTitles: ['Teknoloji Transfer Ofisi Yönergesi'], mustContain: ['2025/103'] },
    { question: 'Uluslararası Öğrenci Kabul Yönergesinin doküman numarası nedir?', sourceTitles: ['Uluslararası Öğrenci Kabul Yönergesi'], mustContain: ['UÖKYNG.0001'] },
    { question: 'Uluslararası Öğrenci Kabul Yönergesi hangi programlara yurt dışından başvuru için geçerli?', sourceTitles: ['Uluslararası Öğrenci Kabul Yönergesi'], anyOf: [['ön lisans', 'lisans']] },
    { question: 'Yaz Öğretimi Yönergesine göre öğrenci en fazla kaç ders alabilir?', sourceTitles: ['Yaz Öğretimi Yönergesi'], mustContain: ['3', 'ders'] },
    { question: 'Yatay Geçiş, Çift Anadal ve Yandal Programı Yönergesinin kabul edildiği Senato kararı nedir?', sourceTitles: ['Yatay Geçiş, Çift Anadal Ve Yandal Programı Yönergesi'], mustContain: ['2022/33'] },
    { question: 'Yayın Yönergesinin doküman numarası nedir?', sourceTitles: ['Yayın Yönergesi'], mustContain: ['YİU.YNG.0001'] },
    { question: 'LEE kısaltması hangi enstitüyü ifade eder?', sourceTitles: ['LEE Yabancı Öğrenci Yönergesi'], mustContain: ['Lisansüstü Eğitim Enstitüsü'] },
    { question: 'LEE Yabancı Öğrenci Yönergesinin doküman numarası nedir?', sourceTitles: ['LEE Yabancı Öğrenci Yönergesi'], mustContain: ['LEE.YNG.0001'] },
    { question: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi'], mustContain: ['TIP.YNG.0018'] },
    { question: 'Tıp Fakültesi Eğitim Öğretim ve Sınav Uygulamaları Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Eğitim Öğretim Ve Sınav Uygulamaları Yönergesi'], mustContain: ['TIP.YNG.0013'] },
    { question: 'Tıp Fakültesi Çevrimiçi Sınav Yönergesi hangi Senato toplantısında kabul edilmiş?', sourceTitles: ['Tıp Fakültesi Çevrimiçi Sınav Yönergesi'], mustContain: ['06.06.2023'], anyOf: [['13']] },
    { question: 'Tıp Fakültesi Dönem VI İntörn Hekimlik Eğitimi Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Dönem VI İntörn Hekimlik Eğitimi Yönergesi'], mustContain: ['TIP.YNG.0007'] },
    { question: 'İntörn hekimler zorunlu stajlara aralıksız devam etmek zorunda mı?', sourceTitles: ['Tıp Fakültesi Dönem VI İntörn Hekimlik Eğitimi Yönergesi'], mustContain: ['intörn'], anyOf: [['aralıksız', 'devam']] },
    { question: 'Tıp Fakültesi Eleştirel Düşünce ve Sanat Kurulu doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Eleştirel Düşünce Ve Sanat Kurulu'], mustContain: ['TIP.YNG.0010'] },
    { question: 'Tıp Fakültesi İletişim Becerileri Eğitimi Kurulu Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi İletişim Becerileri Eğitimi Kurulu Yönergesi'], mustContain: ['TIP.YNG.0014'] },
    { question: 'Tıp Fakültesi Kanıta Dayalı Tıp Kurulu Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Kanıta Dayalı Tıp Kurulu Yönergesi'], mustContain: ['TIP.YNG.0006'] },
    { question: 'Tıp Fakültesi Klinik Beceri Eğitimi Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Klinik Beceri Eğitimi Yönergesi'], mustContain: ['TIP.YNG.0015'] },
    { question: 'Tıp Fakültesi Koordinatörler Kurulu Yönergesinde hangi dönem temsilcileri var?', sourceTitles: ['Tıp Fakültesi Koordinatörler Kurulu Yönergesi'], anyOf: [['Dönem I', 'Dönem II', 'Dönem III', 'Dönem IV', 'Dönem V', 'Dönem VI']] },
    { question: 'Tıp Fakültesi Ölçme ve Değerlendirme Kurulu Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Ölçme Ve Değerlendirme Kurulu Yönergesi'], mustContain: ['TIP.YNG.0016'] },
    { question: 'Tıp Fakültesi Ölçme ve Değerlendirme Yönergesi hangi Senato kararıyla kabul edilmiş?', sourceTitles: ['Tıp Fakültesi Ölçme Ve Değerlendirme Yönergesi'], mustContain: ['2024/54'] },
    { question: 'Tıp Fakültesi Seçmeli Ders Kurulu Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Seçmeli Ders Kurulu Yönergesi'], mustContain: ['TIP.YNG.0003'] },
    { question: 'Tıp Fakültesi Tıpta Uzmanlık Eğitimi Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Tıpta Uzmanlık Eğitimi Yönergesi'], mustContain: ['TIP.YNG.0002'] },
    { question: 'UÇEP kısaltması Tıp Fakültesindeki hangi programı ifade ediyor?', sourceTitles: ['Tıp Fakültesi Ulusal Çekirdek Eğitimi Programı Kurulu Yönergesi'], anyOf: [['Ulusal Çekirdek Eğitim Programı', 'Ulusal Çekirdek Eğitimi Programı']] },
    { question: 'Tıp Fakültesi Ulusal Çekirdek Eğitimi Programı Kurulu Yönergesinin doküman numarası nedir?', sourceTitles: ['Tıp Fakültesi Ulusal Çekirdek Eğitimi Programı Kurulu Yönergesi'], mustContain: ['TIP.YNG.0009'] },
    { question: 'STE kısaltması Tıp Fakültesi yönergelerinde neyi ifade ediyor olabilir?', sourceTitles: ['Sürekli Tıp Eğitimi Kurulu Ve Çalışma Yönergesi'], mustContain: ['Sürekli Tıp Eğitimi'] }
]

function selectedQaCases() {
    const rawSelection = process.env.QA_CASES_ONLY?.trim()
    if (!rawSelection) {
        return QA_CASES.map((testCase, index) => ({ testCase, originalIndex: index }))
    }

    const selectedIndexes = new Set(
        rawSelection
            .split(',')
            .map((item) => Number.parseInt(item.trim(), 10))
            .filter((item) => Number.isFinite(item) && item >= 1 && item <= QA_CASES.length)
            .map((item) => item - 1)
    )

    return QA_CASES
        .map((testCase, index) => ({ testCase, originalIndex: index }))
        .filter((item) => selectedIndexes.has(item.originalIndex))
}

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
            ç: 'c'
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

function isNumericExpectation(value: string) {
    return /^[\d\s./-]+$/.test(value)
}

function containsTerm(answer: string, term: string) {
    const normalizedAnswer = compact(answer)
    const normalizedTerm = compact(term)
    if (normalizedAnswer.includes(normalizedTerm)) return true
    if (isNumericExpectation(term) && digitsOnly(term) && digitsOnly(answer).includes(digitsOnly(term))) return true
    return compactToken(answer).includes(compactToken(term))
}

function sourceTitleMatches(actualTitles: string[], expectedTitles: string[]) {
    return expectedTitles.some((expected) => {
        const normalizedExpected = compact(expected)
        return actualTitles.some((actual) => {
            const normalizedActual = compact(actual)
            return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual)
        })
    })
}

function findFormatFlags(answer: string) {
    const flags: string[] = []
    if (!answer.trim()) flags.push('empty_answer')
    if (/bu konuda elimde net bilgi yok/i.test(answer)) flags.push('no_clear_answer')
    if (/NO_ANSWER/i.test(answer)) flags.push('raw_no_answer')
    if (/^\s*(?:edu|com|net|org|gov)\./i.test(answer)) flags.push('leading_domain_fragment')
    if (/\b(?:edu|com|net|org|gov)\.\s+(?:tr|com|net|org|gov)\b/i.test(answer)) flags.push('spaced_domain')
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.\s+(?:tr|com|net|org|edu|gov|io|ai)\b/i.test(answer)) flags.push('spaced_email_domain')
    return flags
}

function evaluateAnswer(testCase: QaCase, answer: string, sourceTitles: string[]) {
    const missing = (testCase.mustContain ?? []).filter((term) => !containsTerm(answer, term))
    const missingAnyGroups = (testCase.anyOf ?? []).filter((group) => !group.some((term) => containsTerm(answer, term)))
    const flags = findFormatFlags(answer)
    const sourceMatched = sourceTitleMatches(sourceTitles, testCase.sourceTitles)

    return {
        passed: sourceMatched
            && missing.length === 0
            && missingAnyGroups.length === 0
            && flags.length === 0,
        sourceMatched,
        missing,
        missingAnyGroups,
        flags
    }
}

async function getBotMessageAndSources(
    supabase: SupabaseClient,
    conversationId: string | null
) {
    if (!conversationId) return { message: null, sourceTitles: [] as string[] }

    const { data: messages, error } = await supabase
        .from('messages')
        .select('id, content, metadata, created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) throw error
    const message = ((messages ?? []) as QaBotMessage[])[0] ?? null
    const rawSources = message?.metadata?.sources
    const sources = Array.isArray(rawSources)
        ? rawSources.filter((source): source is string => typeof source === 'string' && source.length > 0)
        : []
    if (sources.length === 0) return { message, sourceTitles: [] as string[] }

    const { data: documents, error: docsError } = await supabase
        .from('knowledge_documents')
        .select('id, title')
        .in('id', sources)

    if (docsError) throw docsError

    return {
        message,
        sourceTitles: ((documents ?? []) as QaKnowledgeDocument[]).map((document) => String(document.title ?? 'Untitled'))
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
        question: string
        answer: string
        conversationId: string | null
        sourceTitles: string[]
        expectedSourceTitles: string[]
        passed: boolean
        sourceMatched: boolean
        missing: string[]
        missingAnyGroups: string[][]
        flags: string[]
    }> = []

    const selectedCases = selectedQaCases()

    for (let index = 0; index < selectedCases.length; index += 1) {
        const { testCase, originalIndex } = selectedCases[index]!
        const displayIndex = originalIndex + 1
        const contactId = `codex-live-yiu-mevzuat-qa-${runId}-${displayIndex}`
        const outbound: string[] = []

        await processInboundAiPipeline({
            supabase,
            organizationId: ORG_ID,
            platform: 'whatsapp',
            source: 'whatsapp',
            contactId,
            contactName: `Codex YIU Mevzuat QA ${displayIndex}`,
            text: testCase.question,
            inboundMessageId: `codex-live-yiu-mevzuat-qa-${runId}-${displayIndex}`,
            inboundMessageIdMetadataKey: 'codex_live_yiu_mevzuat_qa_message_id',
            inboundMessageMetadata: {
                codex_live_yiu_mevzuat_qa: true,
                codex_live_yiu_mevzuat_qa_run_id: runId,
                codex_live_yiu_mevzuat_qa_index: displayIndex
            },
            sendOutbound: async (content) => {
                if (typeof content === 'string') {
                    outbound.push(content)
                } else if ('content' in content) {
                    outbound.push(content.content)
                } else {
                    outbound.push('[non-text outbound message]')
                }
                return { providerMessageId: `codex-live-yiu-mevzuat-qa-out-${runId}-${displayIndex}` }
            },
            logPrefix: 'Codex Live YIU Mevzuat QA'
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
                    tags: Array.from(new Set([...tags, 'codex_live_qa', 'codex_yiu_demo_qa', 'codex_yiu_mevzuat_qa'])),
                    contact_name: `Codex YIU Mevzuat QA ${displayIndex}`
                })
                .eq('id', conversation.id)
        }

        const { sourceTitles } = await getBotMessageAndSources(supabase, conversation?.id ?? null)
        const answer = outbound.at(-1) ?? ''
        const evaluation = evaluateAnswer(testCase, answer, sourceTitles)

        const result = {
            index: displayIndex,
            question: testCase.question,
            answer,
            conversationId: conversation?.id ?? null,
            sourceTitles,
            expectedSourceTitles: testCase.sourceTitles,
            ...evaluation
        }
        results.push(result)

        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.index}/${QA_CASES.length} ${result.question}`)
        console.log(`sources=${sourceTitles.join(' | ') || '-'}`)
        console.log(answer.replace(/\s+/g, ' ').slice(0, 520))
        if (!result.passed) {
            console.log(JSON.stringify({
                sourceMatched: result.sourceMatched,
                expectedSourceTitles: result.expectedSourceTitles,
                missing: result.missing,
                missingAnyGroups: result.missingAnyGroups,
                flags: result.flags,
                conversationId: result.conversationId
            }, null, 2))
        }
        console.log('')
    }

    const passed = results.filter((result) => result.passed).length
    const reportLines = [
        '# Live YIU Mevzuat Pipeline QA',
        '',
        `Run ID: ${runId}`,
        `Organization: ${ORG_ID}`,
        `Summary: ${passed}/${results.length} passed`,
        `Selected cases: ${selectedCases.map((item) => item.originalIndex + 1).join(', ') || 'all'}`,
        `Sources: kurumsal mevzuat + tıp fakültesi yönergeler PDF links`,
        '',
        '## Failures',
        ''
    ]

    const failures = results.filter((result) => !result.passed)
    if (failures.length === 0) {
        reportLines.push('No failures.')
    } else {
        for (const result of failures) {
            reportLines.push(`- #${result.index} ${result.question}`)
            reportLines.push(`  - expected source: ${result.expectedSourceTitles.join(' | ')}`)
            reportLines.push(`  - actual source: ${result.sourceTitles.join(' | ') || '-'}`)
            reportLines.push(`  - source matched: ${result.sourceMatched ? 'yes' : 'no'}`)
            reportLines.push(`  - missing: ${result.missing.join(' | ') || '-'}`)
            reportLines.push(`  - missing any groups: ${result.missingAnyGroups.map((group) => group.join(' / ')).join(' | ') || '-'}`)
            reportLines.push(`  - flags: ${result.flags.join(' | ') || '-'}`)
            reportLines.push(`  - conversation: ${result.conversationId ?? 'n/a'}`)
        }
    }

    reportLines.push('', '## Details', '')
    for (const result of results) {
        reportLines.push(`### ${result.index}. ${result.passed ? 'PASS' : 'FAIL'}`)
        reportLines.push('')
        reportLines.push(`Question: ${result.question}`)
        reportLines.push('')
        reportLines.push(`Expected source: ${result.expectedSourceTitles.join(' | ')}`)
        reportLines.push('')
        reportLines.push(`Actual source: ${result.sourceTitles.join(' | ') || '-'}`)
        reportLines.push('')
        reportLines.push(`Conversation: ${result.conversationId ?? 'n/a'}`)
        reportLines.push('')
        reportLines.push('```text')
        reportLines.push(result.answer)
        reportLines.push('```')
        reportLines.push('')
    }

    await mkdir(path.join(process.cwd(), 'tmp', 'crawl-output'), { recursive: true })
    const reportPath = path.join(process.cwd(), 'tmp', 'crawl-output', `live-yiu-mevzuat-pipeline-qa-${runId}.md`)
    await writeFile(reportPath, `${reportLines.join('\n')}\n`, 'utf8')

    console.log(`SUMMARY ${passed}/${results.length} passed`)
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
