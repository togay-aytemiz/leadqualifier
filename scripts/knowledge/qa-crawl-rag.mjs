#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_ORG_ID = '37222032-c2e8-4125-a027-be39eb6603f8'
const DEFAULT_COLLECTION_ID = '05b8a7d5-9ff4-4879-a8e6-6c7a9c1621c4'

const QA_CASES = [
    {
        category: 'pdf',
        question: 'Mevzuat Komisyonu İş Akış Şeması doküman numarası nedir?',
        expectedTitle: 'Mevzuat Komisyonu İş Akış Şeması',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/c483cbb2030f9b25746ae0205ffbd836.pdf'],
        terms: ['YİU.İAŞ.0006']
    },
    {
        category: 'pdf',
        question: 'Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesinin amacı nedir?',
        expectedTitle: 'Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/8ca60ba8af71f57623c2db617f078bee.pdf'],
        terms: ['bilimsel araştırma', 'yetki ve sorumluluk']
    },
    {
        category: 'pdf',
        question: 'İş Sağlığı ve Güvenliği İç Yönergesi hangi birimleri kapsar?',
        expectedTitle: 'İş Sağlığı ve Güvenliği İç Yönergesi',
        urls: [
            'https://yuksekihtisasuniversitesi.edu.tr/Uploads/idari_birim_alt_kategorileri_view/icerik_yonetimi_view/d30d6398dab5647465a7a2f927521411.pdf',
            'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/0f60ad0a13aee3ae19a7bc24587a5935.pdf'
        ],
        terms: ['tüm birimleri', 'bina ve eklentileri']
    },
    {
        category: 'pdf',
        question: 'Uluslararası Öğrenci Kabul Yönergesi hangi programlara yurt dışından başvuru için geçerli?',
        expectedTitle: 'Uluslararası Öğrenci Kabul Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/4728a0a6e51d92550d27470a49609a9c.pdf'],
        terms: ['ön lisans ve lisans programlarına', 'yurt dışından']
    },
    {
        category: 'pdf',
        question: 'Erasmus+ Programı Yönergesinin kapsamı nedir?',
        expectedTitle: 'Erasmus + Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/7e835d355c8ad74a919cbe3ac1a64af3.pdf'],
        terms: ['Yüksek İhtisas Üniversitesinde gerçekleştirilen tüm Erasmus+ Programına']
    },
    {
        category: 'pdf',
        question: 'İmza Yetkileri Yönergesi hangi Senato kararıyla kabul edildi?',
        expectedTitle: 'İmza Yetkileri Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/60b7898b600c7ff6a53265b14b4dd515.pdf'],
        terms: ['2022/55']
    },
    {
        category: 'pdf',
        question: 'Satın Alma ve İhale Yönetmeliği hangi mal ve hizmet alımları için usul ve esasları belirler?',
        expectedTitle: 'Satın Alma ve İhale Yönetmeliği',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/762f81fc7ed79afaf6bd95f75270c904.pdf'],
        terms: ['mal/hizmet alımlarında uygulanacak']
    },
    {
        category: 'pdf',
        question: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliğinde AKTS ne anlama gelir?',
        expectedTitle: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/fd739ffee9e505aa32e57c7980dfcb7f.pdf'],
        terms: ['Avrupa Kredi Transfer Sistemini']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesinin doküman numarası nedir?',
        expectedTitle: 'Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/cff0702b4f846d9c0b52b39eb77def36.pdf'],
        terms: ['TIP.YNG.0018']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Tıpta Uzmanlık Eğitimi Yönergesi hangi kurulun kuruluş ve çalışmalarına ilişkindir?',
        expectedTitle: 'Tıp Fakültesi Tıpta Uzmanlık Eğitimi Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/22acdbc3a3eb5906a1d5324cc930bb16.pdf'],
        terms: ['Tıpta Uzmanlık Eğitimi Kurulu']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Ölçme ve Değerlendirme Kurulu Yönergesi hangi kurulun yapısı ve işleyiş esaslarını düzenler?',
        expectedTitle: 'Tıp Fakültesi Ölçme Ve Değerlendirme Kurulu Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/fcaaf4bf5e6bfe47506fcce19515055a.pdf'],
        terms: ['Ölçme ve Değerlendirme Kurulunun yapısı']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Koordinatörler Kurulu Yönergesinin amacı nedir?',
        expectedTitle: 'Tıp Fakültesi Koordinatörler Kurulu Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/33438b351fc383b3680a67599c0aa5c9.pdf'],
        terms: ['Koordinatörler Kurulunun yapısı']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Klinik Beceri Eğitimi Yönergesinin amacı hangi kurulun işleyişini düzenler?',
        expectedTitle: 'Tıp Fakültesi Klinik Beceri Eğitimi Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/60012139826c06ed834be9e277a731e1.pdf'],
        terms: ['Klinik Beceri Eğitim Kurulunun yapısı']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Kanıta Dayalı Tıp Kurulu Yönergesi öğrencilere hangi konuda eğitim ve danışmanlık vermeyi amaçlar?',
        expectedTitle: 'Tıp Fakültesi Kanıta Dayalı Tıp Kurulu Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/bda1e5e2007d33d3be953a103d8e19e8.pdf'],
        terms: ['kanıta dayalı tıp uygulamaları']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Program Geliştirme ve Değerlendirme Kurulu Yönergesi kurulun amacını nasıl tanımlar?',
        expectedTitle: 'Tıp Fakültesi Program Geliştirme Ve Değerlendirme Kurulu Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/e1ef915ff355df54ff1274ca51363cf8.pdf'],
        terms: ['programlarının planlanması', 'geliştirilmesi']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Seçmeli Ders Kurulu Yönergesi hangi dönem öğrencileri için seçmeli dersleri düzenler?',
        expectedTitle: 'Tıp Fakültesi Seçmeli Ders Kurulu Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/5f3c54bec49b1612efbc33823c17849d.pdf'],
        terms: ['Dönem I, II ve III öğrencilerine']
    },
    {
        category: 'pdf',
        question: 'Tıp Fakültesi Ulusal Çekirdek Eğitimi Programı Kurulu Yönergesinin amacı nedir?',
        expectedTitle: 'Tıp Fakültesi Ulusal Çekirdek Eğitimi Programı Kurulu Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/2e72712d4d2ebe454f3f68630ebd3641.pdf'],
        terms: ['standartları belirlemektir']
    },
    {
        category: 'pdf',
        question: 'Sürekli Tıp Eğitimi Kurulu ve Çalışma Yönergesinin amacı hangi bilgi ve becerileri geliştirmektir?',
        expectedTitle: 'Sürekli Tıp Eğitimi Kurulu Ve Çalışma Yönergesi',
        urls: [
            'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/ef9b168e303ce246f3ab6796ba292446.pdf',
            'https://yuksekihtisasuniversitesi.edu.tr/Uploads/akademik_view/icerik_yonetimi_view/53af6464adc251d42a6ef1ef8e38ab31.pdf'
        ],
        terms: ['bilgi, beceri ve tutumlarını']
    },
    {
        category: 'pdf',
        question: 'Akademik Danışmanlık Yönergesi hangi öğrencilere verilen akademik danışmanlık hizmetini düzenler?',
        expectedTitle: 'Akademik Danışmanlık Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/9d9eccf706c65f6a455f6e4dd8ae5e71.pdf'],
        terms: ['önlisans ve lisans öğrencilerine', 'akademik danışmanlık hizmeti']
    },
    {
        category: 'pdf',
        question: 'Diploma, Diploma Eki ve Diğer Mezuniyet Belgeleri Yönergesi hangi belgelerin hazırlanmasını belirler?',
        expectedTitle: 'Diploma, Diploma Eki ve Diğer Mezuniyet Belgeleri Yönergesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/3ae28601af222ce0fa59a7cc43629b0d.pdf'],
        terms: ['diploma', 'diploma eki', 'bitirme belgelerinin hazırlanmasını']
    },
    {
        category: 'page',
        question: 'Aday öğrenci sayfasında ücretler, burslar ve kontenjanlar için ne var?',
        expectedTitle: 'Tıp Puanları. Ankara Tıp Fakültesi ve Ankara\'da Tıp Bölümleri',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci'],
        terms: ['ÜCRETLER & BURSLAR', 'KONTENJANLAR']
    },
    {
        category: 'page',
        question: 'Ana akademik takvim sayfasında Tıp Fakültesi 2025-2026 akademik takvimi var mı?',
        expectedTitle: 'Academic Calendars',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim'],
        terms: ['Faculty of Medicine Academic Calendar', 'Tıp Fakültesi Akademik Takvimi(2025-2026)']
    },
    {
        category: 'page',
        question: 'Beslenme ve Diyetetik Bölümü sayfasında bölüm hakkında ve ders programı bilgileri var mı?',
        expectedTitle: 'DEPARTMENT OF NUTRITION AND DIETETICS',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/beslenme-ve-diyetetik-bolumu'],
        terms: ['About the Department of Nutrition and Dietetics', 'Course Schedules']
    },
    {
        category: 'page',
        question: 'Dil ve Konuşma Terapisi Bölümü sayfasında hangi uygulama ve araştırma merkezi bağlantısı geçiyor?',
        expectedTitle: 'DEPARTMENT OF LANGUAGE AND SPEAKING THERAPY',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/dil-ve-konusma-terapisi-bolumu'],
        terms: ['Dil ve Konuşma Bozuklukları Eğitimi', 'Uygulama ve Araştırma Merkezi']
    },
    {
        category: 'page',
        question: 'Ebelik Bölümü sayfasında tanıtım videosu ve akademik personel bilgisi var mı?',
        expectedTitle: 'EBELİK BÖLÜMÜ',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/ebelik-bolumu'],
        terms: ['Ebelik Bölümü Tanıtım Videosu', 'Akademik Personel']
    },
    {
        category: 'page',
        question: 'Ergoterapi Bölümü sayfası ergoterapiyi nasıl bir sağlık disiplini olarak anlatıyor?',
        expectedTitle: 'ERGOTERAPİ BÖLÜMÜ',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/ergoterapi-bolumu'],
        terms: ['insan merkezli', 'bütüncül bir sağlık disiplini']
    },
    {
        category: 'page',
        question: 'Fizyoterapi ve Rehabilitasyon Bölümü sayfasında hangi tanıtım videoları yer alıyor?',
        expectedTitle: 'PHYSIOTHERAPY AND REHABILITATION DEPARTMENT',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/fizyoterapi-ve-rehabilitasyon-bolumu'],
        terms: ['Physiotherapy and Rehabilitation Department Promotional Video - 1', 'Promotional Video - 2']
    },
    {
        category: 'page',
        question: 'Hemşirelik Bölümü sayfası nasıl hemşireler yetiştirmeyi amaçlıyor?',
        expectedTitle: 'DEPARTMENT OF NURSING',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/hemsirelik-bolumu'],
        terms: ['professional quality care', 'professional ethical standards']
    },
    {
        category: 'page',
        question: 'Sağlık Yönetimi Bölümü sayfası hangi profesyonel sağlık yöneticilerini yetiştirmeyi hedefliyor?',
        expectedTitle: 'HEALTH MANAGEMENT DEPARTMENT',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/saglik-yonetimi-bolumu'],
        terms: ['professional healthcare managers', 'critical thinking']
    },
    {
        category: 'page',
        question: 'Tıp Fakültesi ana sayfasında dersler, programlar, sınavlar ve mevzuatlar menüsü var mı?',
        expectedTitle: 'Tıp Fakültesi',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi'],
        terms: ['Dersler, Programlar, Sınavlar', 'Mevzuatlar']
    },
    {
        category: 'page',
        question: 'Tıp Fakültesi Kurullar sayfasında Koordinatörler Kurulu ve Ölçme Değerlendirme Kurulu geçiyor mu?',
        expectedTitle: 'Kurullar',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/fakulte-hakkinda/kurullar'],
        terms: ['Koordinatörler Kurulu', 'Ölçme ve Değerlendirme Kurulu']
    },
    {
        category: 'page',
        question: 'Erasmus + Programı sayfası programı nasıl tanımlıyor?',
        expectedTitle: 'Erasmus + Programı',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/ogrenci/erasmus/erasmus-programi'],
        terms: ['Avrupa Birliği tarafından finanse edilen', 'öğrenci, akademik ve idari personellere']
    },
    {
        category: 'page',
        question: 'Erasmus Koordinatörlüğü sayfasında koordinatör kim görünüyor?',
        expectedTitle: 'Erasmus Koordinatörlüğü',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/idari-birimler/koordinatorlukler/erasmus-koordinatorlugu'],
        terms: ['Dr. Öğr. Üyesi Sümeyye RAMAZANOĞLU', 'Koordinatör']
    },
    {
        category: 'page',
        question: 'İş Sağlığı ve Güvenliği Koordinatörlüğü sayfasında İSG koordinatörü kimdir?',
        expectedTitle: 'İş Sağlığı ve Güvenliği Koordinatörlüğü',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/idari-birimler/koordinatorlukler/is-sagligi-ve-guvenligi-koordinatorlugu'],
        terms: ['İSG Koordinatörü', 'Doç. Dr. Elanur DİKİCİOĞLU']
    },
    {
        category: 'page',
        question: 'Lisansüstü Eğitim Enstitüsü yönetim sayfasında enstitü müdürü kimdir?',
        expectedTitle: 'Yönetim',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/enstituler/lisansustu-egitim-enstitusu/yonetim'],
        terms: ['Enstitü Müdür', 'Prof. Dr. Sami AYDOĞAN']
    },
    {
        category: 'page',
        question: 'Lisansüstü Eğitim Enstitüsü kurullar komisyonlar sayfasında Institute Board of Directors üyeleri var mı?',
        expectedTitle: 'Boards',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/enstituler/lisansustu-egitim-enstitusu/kurullar-komisyonlar'],
        terms: ['Institute Board of Directors', 'Prof. Dr. Sami AYDOĞAN']
    },
    {
        category: 'page',
        question: 'İletişim sayfasında Rektörlük ve Tıp Fakültesi telefon numarası nedir?',
        expectedTitle: 'İletişim',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/iletisim'],
        terms: ['Rektörlük ve Tıp Fakültesi', '+90 312 329 10 10']
    },
    {
        category: 'page',
        question: 'Yurtlar sayfasında anlaşmalı yurt protokol listesi ve Fırat Erkek Öğrenci Yurdu var mı?',
        expectedTitle: 'Yurtlar',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar'],
        terms: ['YURT PROTOKOL LİSTESİ', 'FIRAT ERKEK ÖĞRENCİ YURDU']
    },
    {
        category: 'page',
        question: 'Yabancı Diller Yüksekokulu sayfasında akademik kadro ve muafiyet sınavları başlıkları var mı?',
        expectedTitle: 'Yabancı Diller Yüksekokulu',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/yabanci-diller-yuksekokulu'],
        terms: ['Akademik Kadro', 'Muafiyet Sınavları']
    },
    {
        category: 'page',
        question: 'Sağlık Hizmetleri Meslek Yüksekokulu ana sayfasında akademik kadro ve çift anadal programları var mı?',
        expectedTitle: 'Sağlık Hizmetleri Meslek Yüksekokulu',
        urls: ['https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/saglik-hizmetleri-meslek-yuksekokulu'],
        terms: ['Akademik Kadro', 'Çift Anadal Programları']
    }
]

const STOPWORDS = new Set([
    'nedir', 'ne', 'neye', 'neden', 'nasıl', 'hangi', 'kaç', 'zaman', 'kim',
    'kimdir', 'kimlerden', 'nereye', 'nerede', 'nereden', 'bulabilir',
    'göster', 'goster', 'gösterir', 'gosterir', 'okuyabilirim', 'sayfa',
    'sayfası', 'sayfasi', 'bilgi', 'bilgileri', 'bilgilerini', 'var',
    'vardır', 'vardir', 'hakkında', 'hakkinda', 'hakkındaki', 'hakkindaki',
    'üniversite', 'universite', 'üniversitenin', 'universitenin', 'oluşuyor',
    'olusuyor', 'ücret', 'fiyat', 'randevu', 'iptal', 'iade', 'kampanya',
    'indirim', 'paket', 'süre', 'saat', 'gün', 'policy', 'price', 'pricing',
    'when', 'what', 'why', 'who', 'how', 'which'
])

const TURKISH_CHAR_MAP = {
    'ı': 'i',
    'İ': 'i',
    'ğ': 'g',
    'Ğ': 'g',
    'ü': 'u',
    'Ü': 'u',
    'ş': 's',
    'Ş': 's',
    'ö': 'o',
    'Ö': 'o',
    'ç': 'c',
    'Ç': 'c'
}

function parseArgs(argv) {
    const args = {
        orgId: DEFAULT_ORG_ID,
        collectionId: DEFAULT_COLLECTION_ID,
        language: 'tr',
        limit: 12,
        reportOut: 'tmp/crawl-output/yuksek-ihtisas-full-pdf-rag-40qa-report.md'
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--org-id') {
            args.orgId = argv[index + 1]
            index += 1
        } else if (arg === '--collection-id') {
            args.collectionId = argv[index + 1]
            index += 1
        } else if (arg === '--language') {
            args.language = argv[index + 1]
            index += 1
        } else if (arg === '--limit') {
            args.limit = Number(argv[index + 1])
            index += 1
        } else if (arg === '--report-out') {
            args.reportOut = argv[index + 1]
            index += 1
        }
    }

    return args
}

function parseEnvValue(value) {
    const trimmed = String(value ?? '').trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }

    return trimmed
}

async function loadEnvFile(filePath, protectedKeys) {
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
        if (error?.code !== 'ENOENT') throw error
    }
}

async function loadProjectEnv(projectDir) {
    const protectedKeys = new Set(Object.keys(process.env))
    await loadEnvFile(path.join(projectDir, '.env'), protectedKeys)
    await loadEnvFile(path.join(projectDir, '.env.local'), protectedKeys)
    await loadEnvFile(path.join(projectDir, '.env.development.local'), protectedKeys)
}

function requireEnv(name) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} environment variable is required`)

    return value
}

function normalizeSearchText(value) {
    return String(value ?? '')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
}

function normalizeEvidenceText(value) {
    return normalizeSearchText(value)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function stemSearchToken(token) {
    const normalized = normalizeSearchText(token)
    const suffixes = [
        'lerinin', 'larinin', 'lerini', 'larini', 'sinin', 'sini', 'sina',
        'sine', 'ini', 'ina', 'ine', 'nin', 'imiz', 'imizle', 'miz',
        'leri', 'lari', 'ler', 'lar', 'si', 'su'
    ]

    for (const suffix of suffixes) {
        if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 4) {
            return normalized.slice(0, -suffix.length)
        }
    }

    return normalized
}

function isKeywordStopword(token) {
    const normalized = normalizeSearchText(token)
    const stemmed = stemSearchToken(normalized)

    return STOPWORDS.has(token) || STOPWORDS.has(normalized) || STOPWORDS.has(stemmed)
}

function extractKeywordTokens(query) {
    const normalized = query
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()

    if (!normalized) return []

    const tokens = normalized.split(/\s+/).filter(Boolean)
    const keywords = tokens.filter((token) => token.length >= 3 && !isKeywordStopword(token))
    const unique = Array.from(new Set(keywords))

    if (unique.length > 0) return unique.slice(0, 5)

    return Array.from(new Set(tokens.filter((token) => token.length >= 3))).slice(0, 5)
}

function sanitizeKeyword(keyword) {
    return keyword.replace(/[%_]/g, '')
}

function expandKeywordToken(token) {
    const normalized = normalizeSearchText(token)
    const stemmed = stemSearchToken(normalized)
    const variants = new Set([token, normalized, stemmed])

    if (normalized.endsWith('lari') || normalized.endsWith('leri')) {
        variants.add(normalized.slice(0, -1))
    }
    if (normalized.endsWith('si') || normalized.endsWith('su')) {
        variants.add(normalized.slice(0, -2))
    }

    return [...variants].map(sanitizeKeyword).filter((value) => value.length >= 3)
}

function keywordGroups(query) {
    return extractKeywordTokens(query).map(expandKeywordToken).filter((group) => group.length > 0)
}

function lexicalMatchScore(query, value) {
    const groups = keywordGroups(query)
    if (groups.length === 0) return 0

    const haystack = normalizeSearchText(value)
    const hits = groups.filter((group) => {
        return group.some((keyword) => haystack.includes(normalizeSearchText(keyword)))
    }).length

    return hits / groups.length
}

const SOURCE_SLUG_CONNECTORS = new Set(['ve', 'and', 'ile'])
const SOURCE_SLUG_STOPWORDS = new Set([
    'sayfasinda',
    'sayfada',
    'sayfanin',
    'sayfaya',
    'icin',
    'midir',
    'mi',
    'mı',
    'hedefliyor',
    'yetistirmeyi'
])

function sourceSlugTokenSequence(query) {
    const normalized = normalizeSearchText(query)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!normalized) return []

    return normalized
        .split(/\s+/)
        .filter((token) => {
            if (SOURCE_SLUG_CONNECTORS.has(token)) return true
            return token.length >= 3 && !SOURCE_SLUG_STOPWORDS.has(token) && !isKeywordStopword(token)
        })
        .map((token) => SOURCE_SLUG_CONNECTORS.has(token) ? token : stemSearchToken(token))
}

function sourceSlugCandidates(query) {
    const tokens = sourceSlugTokenSequence(query)
    const priorityCandidates = new Set()
    const candidates = new Set()

    if (hasQuerySignal(query, ['aday ogrenci', 'aday öğrenci'])) {
        priorityCandidates.add('aday-ogrenci')
    }

    tokens.forEach((token, index) => {
        if (token !== 'bolum' && token !== 'bolumu') return

        for (let start = Math.max(0, index - 4); start < index; start += 1) {
            const slice = tokens.slice(start, index + 1)
            const meaningfulTokenCount = slice.filter((item) => !SOURCE_SLUG_CONNECTORS.has(item)).length
            if (meaningfulTokenCount >= 2) {
                priorityCandidates.add(slice.join('-'))
            }
        }
    })

    for (let index = 1; index < tokens.length; index += 1) {
        if (tokens[index - 1] === 'aday' && tokens[index] === 'ogrenci') {
            priorityCandidates.add('aday-ogrenci')
        }
    }

    for (let size = Math.min(5, tokens.length); size >= 2; size -= 1) {
        for (let start = 0; start <= tokens.length - size; start += 1) {
            const slice = tokens.slice(start, start + size)
            const meaningfulTokenCount = slice.filter((token) => !SOURCE_SLUG_CONNECTORS.has(token)).length
            if (meaningfulTokenCount < 2) continue

            candidates.add(slice.join('-'))
        }
    }

    return [...candidates]
        .filter((candidate) => candidate.length >= 5)
        .sort((left, right) => right.length - left.length)
        .reduce((items, candidate) => {
            if (!priorityCandidates.has(candidate)) items.push(candidate)
            return items
        }, [...priorityCandidates])
        .filter((candidate) => candidate.length >= 5)
        .slice(0, 6)
}

function shouldUseSourcePathFallback(query) {
    return hasQuerySignal(query, [
        'sayfa',
        'sayfasi',
        'sayfası',
        'link',
        'nerede',
        'aday ogrenci',
        'aday öğrenci',
        'bolum',
        'bölüm',
        'bolumu',
        'bölümü',
        'akademik takvim',
        'iletisim',
        'iletişim',
        'koordinatorluk',
        'koordinatörlük',
        'yurt',
        'yurtlar'
    ])
}

function extractSourceUrlFromContent(content) {
    return String(content ?? '').match(/^Source URL:\s*(.+)$/im)?.[1]?.trim() ?? ''
}

function sourcePath(sourceUrl) {
    try {
        return new URL(sourceUrl).pathname
    } catch {
        return sourceUrl
    }
}

function normalizedSourcePathSlug(sourceUrl) {
    return normalizeSearchText(sourcePath(sourceUrl))
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
}

function sourceSlugMatchScore(query, sourceUrl) {
    const pathSlug = normalizedSourcePathSlug(sourceUrl)
    if (!pathSlug) return 0

    return sourceSlugCandidates(query).reduce((bestScore, candidate) => {
        if (!pathSlug.includes(candidate)) return bestScore

        const meaningfulTokenCount = candidate
            .split('-')
            .filter((token) => !SOURCE_SLUG_CONNECTORS.has(token)).length

        return Math.max(bestScore, Math.min(1, meaningfulTokenCount / 3))
    }, 0)
}

function hasQuerySignal(query, signals) {
    const normalized = normalizeSearchText(query)
    return signals.some((signal) => normalized.includes(normalizeSearchText(signal)))
}

function isTimeSensitiveQuery(query) {
    return hasQuerySignal(query, [
        'duyuru', 'sonuc', 'sonuç', 'basladi', 'başladı', 'guncel',
        'güncel', 'ilan', 'sinav', 'sınav', 'yerlestirme', 'yerleştirme',
        '2024', '2025', '2026'
    ])
}

function isEvergreenPath(pathname) {
    return pathname.startsWith('/sayfa/')
        || pathname === '/iletisim'
        || pathname === '/aday-ogrenci'
        || pathname === '/obs'
        || pathname === '/akademik-takvim'
}

function isTransientPath(pathname) {
    return pathname.startsWith('/duyuru/')
        || pathname.startsWith('/haber/')
        || pathname.startsWith('/etkinlik/')
}

function pageTypeScore(query, sourceUrl) {
    const pathname = sourcePath(sourceUrl)
    const timeSensitive = isTimeSensitiveQuery(query)
    const departmentPageQuery = hasQuerySignal(query, ['bolum', 'bölüm', 'bolumu', 'bölümü'])
        && hasQuerySignal(query, ['sayfa', 'sayfasi', 'sayfası', 'hakkinda', 'hakkında', 'ders program'])
    let score = 0

    if (isEvergreenPath(pathname)) score += timeSensitive ? 0.02 : 0.1
    if (isTransientPath(pathname) && !timeSensitive) score -= departmentPageQuery ? 0.3 : 0.14

    return score
}

function directIntentScore(query, sourceUrl, result) {
    const pathname = normalizeSearchText(sourcePath(sourceUrl))
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const title = normalizeSearchText(result.document_title ?? '')
    const sourceSlugScore = sourceSlugMatchScore(query, sourceUrl)
    let score = 0

    const hasSpecificContactSubject = hasQuerySignal(query, [
        'koordinatorluk', 'koordinatörlük', 'koordinatorlugu',
        'koordinatörlüğü', 'fakulte', 'fakülte', 'fakultesi', 'fakültesi',
        'yuksekokul', 'yüksekokul', 'yuksekokulu', 'yüksekokulu',
        'enstitu', 'enstitü', 'ogrenci isleri', 'öğrenci işleri', 'erasmus'
    ])

    if (hasQuerySignal(query, ['iletisim', 'iletişim', 'ulasim', 'ulaşım', 'adres', 'telefon'])
        && (pathname.includes('iletisim') || pathname.includes('ulasim'))
        && (!hasSpecificContactSubject || lexicalMatchScore(query, `${result.document_title}\n${sourceUrl}`) >= 0.5)) {
        score += 0.18
    }

    if (hasQuerySignal(query, ['aday ogrenci', 'aday öğrenci']) && pathname === '/aday-ogrenci') {
        score += 0.36
    }
    if (hasQuerySignal(query, ['tarihce', 'tarihçe']) && searchable.includes('tarihce')) {
        score += 0.18
    }
    if (hasQuerySignal(query, ['akademik takvim'])) {
        const hasSpecificCalendarSubject = hasQuerySignal(query, [
            'tip fakultesi', 'tıp fakültesi', 'saglik bilimleri', 'sağlık bilimleri',
            'spor bilimleri', 'lisansustu', 'lisansüstü', 'enstitu', 'enstitü',
            '2024', '2025', '2026'
        ])
        if (pathname === '/akademik-takvim' && !hasSpecificCalendarSubject) {
            score += 0.32
        } else if (pathname.endsWith('/akademik-takvim')) {
            score += hasSpecificCalendarSubject ? 0.16 : 0.06
        }
    }
    if (hasQuerySignal(query, ['yurt', 'yurtlar', 'yurtlari', 'yurtları']) && pathname.includes('/yurtlar/')) {
        score += 0.24
    }
    if (hasQuerySignal(query, ['akademik kadro']) && pathname.includes('akademik-kadro')) {
        score += 0.22
    }
    if (hasQuerySignal(query, ['bolum', 'bölüm', 'bolumu', 'bölümü']) && pathname.includes('/bolum/')) {
        score += 0.08
    }
    if (sourceSlugScore >= 0.8) {
        score += pathname.includes('/bolum/') ? 0.18 : 0.1
    }
    if (hasQuerySignal(query, ['yonerge', 'yönerge']) && title.includes('yonerge')) {
        score += 0.14
    }
    if (hasQuerySignal(query, ['yonetmelik', 'yönetmelik']) && title.includes('yonetmelik')) {
        score += 0.14
    }
    if (hasQuerySignal(query, ['on lisans', 'ön lisans']) && (title.includes('on lisans') || searchable.includes('on lisans'))) {
        score += 0.16
    }
    if (hasQuerySignal(query, ['senato karari', 'senato kararı']) && searchable.includes('senato')) {
        score += 0.12
    }
    if (hasQuerySignal(query, ['akts']) && searchable.includes('akts')) {
        score += 0.16
    }
    if (hasQuerySignal(query, ['kapsam']) && searchable.includes('kapsam')) {
        score += 0.08
    }

    return score
}

function scoreKnowledgeResult(query, result) {
    const similarity = Number.isFinite(result.similarity) ? Number(result.similarity) : 0
    const sourceUrl = extractSourceUrlFromContent(result.content)
    const sourceSlugScore = sourceSlugMatchScore(query, sourceUrl)

    return similarity * 0.6
        + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.4
        + lexicalMatchScore(query, result.document_title ?? '') * 0.15
        + lexicalMatchScore(query, sourceUrl) * 0.18
        + sourceSlugScore * 0.3
        + pageTypeScore(query, sourceUrl)
        + directIntentScore(query, sourceUrl, result)
}

function mergeSearchResults(query, vectorResults, lexicalResults, limit) {
    const byChunk = new Map()

    for (const result of [...vectorResults, ...lexicalResults]) {
        const existing = byChunk.get(result.chunk_id)
        if (!existing || scoreKnowledgeResult(query, result) > scoreKnowledgeResult(query, existing)) {
            byChunk.set(result.chunk_id, result)
        }
    }

    return [...byChunk.values()]
        .sort((left, right) => scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left))
        .slice(0, limit)
}

async function searchByKeyword(supabase, query, args) {
    const keywords = Array.from(new Set(extractKeywordTokens(query).flatMap(expandKeywordToken)))
    if (keywords.length === 0) return []

    const filters = keywords
        .map((keyword) => `content.ilike.%${sanitizeKeyword(keyword)}%`)
        .join(',')

    const { data, error } = await supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents!inner(title, type, status, collection_id, language)')
        .eq('organization_id', args.orgId)
        .eq('knowledge_documents.collection_id', args.collectionId)
        .eq('knowledge_documents.language', args.language)
        .or(filters)
        .limit(Math.max(args.limit * 8, 40))

    if (error || !data) return []

    return data
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => ({
            chunk_id: row.id,
            document_id: row.document_id,
            document_title: row.knowledge_documents?.title ?? 'Untitled',
            document_type: row.knowledge_documents?.type ?? 'article',
            content: row.content,
            similarity: Math.max(
                0.2,
                0.45 + lexicalMatchScore(query, `${row.knowledge_documents?.title ?? ''}\n${row.content}`) * 0.25
            ),
            retrieval_source: 'keyword'
        }))
}

async function searchByTitle(supabase, query, args) {
    const keywords = Array.from(new Set(extractKeywordTokens(query).flatMap(expandKeywordToken)))
    if (keywords.length === 0) return []

    const filters = keywords
        .map((keyword) => `title.ilike.%${sanitizeKeyword(keyword)}%`)
        .join(',')

    const { data: documents, error: documentError } = await supabase
        .from('knowledge_documents')
        .select('id, title, type, status')
        .eq('organization_id', args.orgId)
        .eq('status', 'ready')
        .eq('collection_id', args.collectionId)
        .eq('language', args.language)
        .or(filters)
        .limit(Math.max(args.limit * 8, 120))

    if (documentError || !documents) return []

    const rankedDocuments = documents
        .filter((row) => row.status === 'ready')
        .map((row) => ({
            ...row,
            score: lexicalMatchScore(query, row.title ?? '')
        }))
        .filter((row) => row.score >= 0.35)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(4, Math.min(12, args.limit)))

    const documentIds = rankedDocuments.map((row) => row.id)
    if (documentIds.length === 0) return []

    const documentById = new Map(rankedDocuments.map((row) => [row.id, row]))
    const { data: chunks, error: chunkError } = await supabase
        .from('knowledge_chunks')
        .select('id, document_id, chunk_index, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', args.orgId)
        .in('document_id', documentIds)
        .order('chunk_index')
        .limit(Math.max(args.limit * 3, 24))

    if (chunkError || !chunks) return []

    return chunks
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentScore = documentById.get(row.document_id)?.score ?? 0
            const chunkScore = lexicalMatchScore(query, `${row.knowledge_documents?.title ?? ''}\n${row.content}`)
            const earlyChunkBoost = Math.max(0, 0.08 - Number(row.chunk_index ?? 0) * 0.015)

            return {
                chunk_id: row.id,
                document_id: row.document_id,
                document_title: row.knowledge_documents?.title ?? 'Untitled',
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content,
                similarity: Math.max(0.2, 0.5 + documentScore * 0.18 + chunkScore * 0.2 + earlyChunkBoost),
                retrieval_source: 'title'
            }
        })
}

async function searchBySourcePath(supabase, query, args) {
    const candidates = sourceSlugCandidates(query)
    if (candidates.length === 0) return []

    const filters = candidates
        .map((candidate) => `content.ilike.%${sanitizeKeyword(candidate)}%`)
        .join(',')

    const { data, error } = await supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', args.orgId)
        .eq('knowledge_documents.collection_id', args.collectionId)
        .eq('knowledge_documents.language', args.language)
        .or(filters)
        .limit(Math.max(args.limit * 4, 24))

    if (error || !data) return []

    return data
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentTitle = row.knowledge_documents?.title ?? 'Untitled'
            const sourceUrl = extractSourceUrlFromContent(row.content)
            const sourceScore = sourceSlugMatchScore(query, sourceUrl)
            const chunkScore = lexicalMatchScore(query, `${documentTitle}\n${row.content}\n${sourceUrl}`)

            return {
                chunk_id: row.id,
                document_id: row.document_id,
                document_title: documentTitle,
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content,
                similarity: Math.max(
                    0.2,
                    0.52 + sourceScore * 0.24 + chunkScore * 0.16
                ),
                retrieval_source: 'source'
            }
        })
}

async function searchKnowledge(supabase, openai, query, args) {
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query
    })
    const embedding = `[${embeddingResponse.data[0].embedding.join(',')}]`

    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: Math.max(args.limit, Math.min(12, args.limit * 2)),
        filter_org_id: args.orgId,
        filter_collection_id: args.collectionId,
        filter_type: null,
        filter_language: args.language
    })

    if (error) throw new Error(`Vector RPC failed: ${error.message}`)

    const vectorResults = (data ?? []).map((row) => ({
        ...row,
        retrieval_source: 'vector'
    }))
    const keywordResults = await searchByKeyword(supabase, query, args)
    const titleResults = await searchByTitle(supabase, query, args)
    const sourceResults = shouldUseSourcePathFallback(query)
        ? await searchBySourcePath(supabase, query, args)
        : []

    return mergeSearchResults(query, vectorResults, [...keywordResults, ...titleResults, ...sourceResults], args.limit)
}

function includesAllTerms(result, terms) {
    const sourceUrl = extractSourceUrlFromContent(result.content)
    const haystack = normalizeEvidenceText(`${result.document_title}\n${sourceUrl}\n${result.content}`)

    return terms.every((term) => haystack.includes(normalizeEvidenceText(term)))
}

function missingEvidenceTerms(result, terms) {
    const sourceUrl = extractSourceUrlFromContent(result.content)
    const haystack = normalizeEvidenceText(`${result.document_title}\n${sourceUrl}\n${result.content}`)

    return terms.filter((term) => !haystack.includes(normalizeEvidenceText(term)))
}

function matchDiagnostics(result, testCase) {
    if (!result) {
        return {
            sourceMatches: false,
            titleMatches: false,
            missingTerms: testCase.terms
        }
    }

    const sourceUrl = extractSourceUrlFromContent(result.content)
    return {
        sourceMatches: testCase.urls.some((url) => sourceUrl === url),
        titleMatches: !testCase.expectedTitle
            || normalizeSearchText(result.document_title).includes(normalizeSearchText(testCase.expectedTitle)),
        missingTerms: missingEvidenceTerms(result, testCase.terms)
    }
}

function matchesExpected(result, testCase) {
    const sourceUrl = extractSourceUrlFromContent(result.content)
    const sourceMatches = testCase.urls.some((url) => sourceUrl === url)
    const titleMatches = !testCase.expectedTitle
        || normalizeSearchText(result.document_title).includes(normalizeSearchText(testCase.expectedTitle))

    return sourceMatches && titleMatches && includesAllTerms(result, testCase.terms)
}

function preview(content) {
    return String(content ?? '').replace(/\s+/g, ' ').slice(0, 520)
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const projectDir = process.cwd()
    await loadProjectEnv(projectDir)

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
    const openai = new OpenAI({
        apiKey: requireEnv('OPENAI_API_KEY')
    })

    const lines = [
        '# Crawl RAG 40-Question QA Report',
        '',
        `Generated at: ${new Date().toISOString()}`,
        `Organization: ${args.orgId}`,
        `Collection: ${args.collectionId}`,
        `Language: ${args.language}`,
        `Questions: ${QA_CASES.length}`,
        ''
    ]

    const summary = {
        total: 0,
        pass: 0,
        pdf: { total: 0, pass: 0 },
        page: { total: 0, pass: 0 }
    }

    for (let index = 0; index < QA_CASES.length; index += 1) {
        const testCase = QA_CASES[index]
        const results = await searchKnowledge(supabase, openai, testCase.question, args)
        const matchedIndex = results.findIndex((result) => matchesExpected(result, testCase))
        const best = results[matchedIndex >= 0 ? matchedIndex : 0]
        const passed = matchedIndex >= 0

        summary.total += 1
        summary[testCase.category].total += 1
        if (passed) {
            summary.pass += 1
            summary[testCase.category].pass += 1
        }

        console.log(`${passed ? 'PASS' : 'FAIL'} ${index + 1}/${QA_CASES.length} [${testCase.category}] ${testCase.question}`)

        lines.push(`## ${passed ? 'PASS' : 'FAIL'} ${index + 1}. [${testCase.category}] ${testCase.question}`)
        lines.push('')
        lines.push(`Expected title: ${testCase.expectedTitle}`)
        lines.push(`Expected URL: ${testCase.urls.join(' OR ')}`)
        lines.push(`Evidence terms: ${testCase.terms.join(' | ')}`)
        lines.push(`Rank: ${passed ? matchedIndex + 1 : 'not found in top ' + args.limit}`)
        lines.push('')

        if (best) {
            const diagnostics = matchDiagnostics(best, testCase)
            lines.push(`Matched title: ${best.document_title}`)
            lines.push(`Matched source: ${extractSourceUrlFromContent(best.content)}`)
            lines.push(`Retrieval source: ${best.retrieval_source}`)
            if (!passed) {
                lines.push(`Source matched: ${diagnostics.sourceMatches ? 'yes' : 'no'}`)
                lines.push(`Title matched: ${diagnostics.titleMatches ? 'yes' : 'no'}`)
                lines.push(`Missing evidence terms: ${diagnostics.missingTerms.length > 0 ? diagnostics.missingTerms.join(' | ') : 'none'}`)
            }
            lines.push('')
            lines.push(`Answer preview: ${preview(best.content)}`)
            lines.push('')
        }

        lines.push('Top 5:')
        for (const result of results.slice(0, 5)) {
            lines.push(`- ${scoreKnowledgeResult(testCase.question, result).toFixed(4)} | ${result.retrieval_source} | ${result.document_title} | ${extractSourceUrlFromContent(result.content)}`)
        }
        lines.push('')
    }

    lines.splice(7, 0, `Passed: ${summary.pass}/${summary.total}`)
    lines.splice(8, 0, `PDF passed: ${summary.pdf.pass}/${summary.pdf.total}`)
    lines.splice(9, 0, `Page passed: ${summary.page.pass}/${summary.page.total}`)

    const reportPath = path.resolve(projectDir, args.reportOut)
    await writeFile(reportPath, lines.join('\n'), 'utf8')

    console.log(`Passed: ${summary.pass}/${summary.total}`)
    console.log(`PDF passed: ${summary.pdf.pass}/${summary.pdf.total}`)
    console.log(`Page passed: ${summary.page.pass}/${summary.page.total}`)
    console.log(`Report: ${reportPath}`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
