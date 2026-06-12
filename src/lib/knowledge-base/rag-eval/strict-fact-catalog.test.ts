import { describe, expect, it } from 'vitest'

import { understandStrictQuestion } from './strict-question-understanding'
import { resolveStrictCatalogAnswer } from './strict-fact-catalog'

function catalogAnswer(question: string) {
  return resolveStrictCatalogAnswer({
    question,
    understanding: understandStrictQuestion(question),
  })
}

describe('resolveStrictCatalogAnswer', () => {
  it('answers supported academic unit existence from the structured catalog', () => {
    const answer = catalogAnswer('Tıp Fakülteniz var mı?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_supported_existence',
    })
    expect(answer?.answer).toContain('Tıp Fakültesi vardır')
    expect(answer?.citations[0]).toMatchObject({
      providerSourceId: 'strict-catalog:academic-units',
      title: 'YİÜ Tanıtım Broşürü - Program ve Yerleşke Eşleşmeleri',
    })
  })

  it('blocks unsupported academic unit existence instead of allowing a positive hallucination', () => {
    const answer = catalogAnswer('Hukuk Fakülteniz var mı?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_unsupported_existence',
    })
    expect(answer?.answer).toContain('Hukuk Fakültesi')
    expect(answer?.answer).toContain('listelenmemektedir')
  })

  it('lists faculty and school programs from the catalog', () => {
    const faculties = catalogAnswer('Üniversitenizde hangi fakülteler var?')
    expect(faculties).toMatchObject({
      refusal: false,
      reason: 'catalog_faculty_listing',
    })
    expect(faculties?.answer).toContain('Tıp Fakültesi')
    expect(faculties?.answer).toContain('Sağlık Bilimleri Fakültesi')
    expect(faculties?.answer).toContain('Spor Bilimleri Fakültesi')

    const faculty = catalogAnswer('Sağlık Bilimleri Fakültesinde hangi bölümler var?')
    expect(faculty).toMatchObject({
      refusal: false,
      reason: 'catalog_program_listing',
    })
    expect(faculty?.answer).toContain('Beslenme ve Diyetetik')
    expect(faculty?.answer).toContain('Dil ve Konuşma Terapisi')
    expect(faculty?.answer).toContain('Sağlık Yönetimi')

    const shmyo = catalogAnswer('shmyo bölümleri')
    expect(shmyo?.answer).toContain('Anestezi')
    expect(shmyo?.answer).toContain('Tele-Sağlık Teknikerliği')
    expect(shmyo?.answer).toContain('Tıbbi Veri İşleme Teknikerliği')

    const schools = catalogAnswer('Üniversitenizde hangi meslek yüksekokulları var?')
    expect(schools).toMatchObject({
      refusal: false,
      reason: 'catalog_faculty_listing',
    })
    expect(schools?.answer).toContain('Meslek Yüksekokulu')
    expect(schools?.answer).toContain('Sağlık Hizmetleri Meslek Yüksekokulu')
  })

  it('answers institution type and founding foundation from the catalog', () => {
    const type = catalogAnswer('Üniversiteniz devlet mi vakıf üniversitesi mi?')
    expect(type).toMatchObject({
      refusal: false,
      reason: 'catalog_institution_fact',
    })
    expect(type?.answer).toContain('vakıf üniversitesidir')
    expect(type?.answer).toContain('devlet üniversitesi değildir')

    const foundation = catalogAnswer('Üniversitenin kurucu vakfı kimdir?')
    expect(foundation).toMatchObject({
      refusal: false,
      reason: 'catalog_institution_fact',
    })
    expect(foundation?.answer).toContain('Türkiye Yüksek İhtisas Hastanesi Vakfı')
  })

  it('answers generic MYO campus location from campus-program mappings', () => {
    const answer = catalogAnswer('myo nerde')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_campus_program_listing',
    })
    expect(answer?.answer).toContain('Meslek Yüksekokulu')
    expect(answer?.answer).toContain('Balgat Yerleşkesi')
    expect(answer?.answer).toContain('Sağlık Hizmetleri Meslek Yüksekokulu')
    expect(answer?.answer).toContain('Bağlum Yerleşkesi')
  })

  it('answers broad department-campus mapping from campus-program facts', () => {
    const answer = catalogAnswer('Hangi bölüm hangi kampüste?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_campus_program_listing',
    })
    expect(answer?.answer).toContain('100. Yıl Yerleşkesi')
    expect(answer?.answer).toContain('Tıp Fakültesi')
    expect(answer?.answer).toContain('Bağlıca Yerleşkesi')
    expect(answer?.answer).toContain('Sağlık Bilimleri Fakültesi')
    expect(answer?.answer).toContain('Balgat Yerleşkesi')
    expect(answer?.answer).toContain('Bağlum Yerleşkesi')
  })

  it('uses decision-safe boundaries for personal preference and transfer/process questions', () => {
    const preference = catalogAnswer('Hastanede çalışmak istiyorum, hangi programı seçmeliyim?')
    expect(preference).toMatchObject({
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    })
    expect(preference?.answer.toLocaleLowerCase('tr-TR')).toContain('sizin yerinize tercih kararı')
    expect(preference?.answer).toContain('çalışmak istediğiniz ortam')
    expect(preference?.answer).toContain('kesin yerleşme garantisi')

    const transfer = catalogAnswer('Yatay geçiş kabul ediyor musunuz?')
    expect(transfer).toMatchObject({
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    })
    expect(transfer?.answer.toLocaleLowerCase('tr-TR')).toContain('yatay geçiş')
    expect(transfer?.answer).toContain('başvuru takvimi')

    const prep = catalogAnswer('Hazırlığı geçemezsem ne olur?')
    expect(prep).toMatchObject({
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    })
    expect(prep?.answer).toContain('hazırlık')
    expect(prep?.answer).toContain('resmi akademik süreç')
  })

  it('uses meeting-room-safe boundaries for subjective reputation and low-effort prompts', () => {
    const instructors = catalogAnswer('Hocalar zor mu?')
    expect(instructors).toMatchObject({
      refusal: true,
      reason: 'catalog_reputation_scope_guard',
    })
    expect(instructors?.answer).toContain('öznel')
    expect(instructors?.answer).toContain('doğrulanmış bilgi')

    const lowEffort = catalogAnswer('En az ders çalışarak hangi bölüm okunur?')
    expect(lowEffort).toMatchObject({
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    })
    expect(lowEffort?.answer).toContain('en az ders çalışarak')
    expect(lowEffort?.answer).toContain('uygun değildir')

    const absence = catalogAnswer('Devamsızlıktan kalmak kolay mı?')
    expect(absence).toMatchObject({
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    })
    expect(absence?.answer.toLocaleLowerCase('tr-TR')).toContain('devamsızlık')
    expect(absence?.answer).toContain('resmi ders devam')
  })

  it('routes adjacent housing and local-life questions to actionable campus boundaries', () => {
    const outOfCity = catalogAnswer('Şehir dışından gelen öğrenciler nerede kalıyor?')
    expect(outOfCity).toMatchObject({
      refusal: true,
      reason: 'catalog_housing_scope_guard',
    })
    expect(outOfCity?.answer).toContain('konaklama')
    expect(outOfCity?.answer).toContain('yerleştirme desteği')

    const rent = catalogAnswer('Ankara’da kiralar ne kadar?')
    expect(rent).toMatchObject({
      refusal: true,
      reason: 'catalog_off_topic_scope_guard',
    })
    expect(rent?.answer).toContain('yardımcı olamam')
    expect(rent?.answer).toContain('programları, ücretleri, bursları')
    expect(rent?.answer).not.toContain('net bilgi bulunmamaktadır')
  })

  it('guards Turkish-inflected facility resource questions such as mikroskobu', () => {
    const answer = catalogAnswer('Öğrenciler mikroskobu bireysel mi kullanıyor grup halinde mi?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_facility_resource_scope_guard',
    })
    expect(answer?.answer).toContain('mikroskop')
    expect(answer?.answer).toContain('güncel kullanım koşulu')
  })

  it('lists lisans and ön lisans programs separately from the catalog', () => {
    const answer = catalogAnswer(
      'Üniversitenizde lisans ve ön lisans programlarını ayrı ayrı listeler misin?'
    )

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_degree_level_listing',
    })
    expect(answer?.answer).toContain('Lisans programları:')
    expect(answer?.answer).toContain('Tıp Fakültesi (Türkçe)')
    expect(answer?.answer).toContain('Hemşirelik')
    expect(answer?.answer).toContain('Ön lisans programları:')
    expect(answer?.answer).toContain('Tıbbi Görüntüleme Teknikleri')
    expect(answer?.answer).toContain('Bilgisayar Programcılığı')
  })

  it('answers additional clinical program existence from the catalog', () => {
    const imaging = catalogAnswer('Tıbbi Görüntüleme Teknikleri var mı?')

    expect(imaging).toMatchObject({
      refusal: false,
      reason: 'catalog_supported_existence',
    })
    expect(imaging?.answer).toContain('Tıbbi Görüntüleme Teknikleri vardır')
  })

  it('distinguishes Fizyoterapi ve Rehabilitasyon from the associate Fizyoterapi program', () => {
    const answer = catalogAnswer('Fizyoterapi ve Rehabilitasyon ile Fizyoterapi aynı bölüm mü?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_program_distinction_fact',
    })
    expect(answer?.answer).toContain('aynı program değildir')
    expect(answer?.answer).toContain('Fizyoterapi ve Rehabilitasyon')
    expect(answer?.answer).toContain('Fizyoterapi ön lisans')
  })

  it('does not answer catalog-unrelated questions', () => {
    expect(catalogAnswer('Yurt ücretleri ne kadar?')).toBeNull()
  })

  it('answers fixed institutional facts deterministically', () => {
    const answer = catalogAnswer('Üniversiteniz ne zaman kuruldu?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_institution_fact',
    })
    expect(answer?.answer).toContain('2013')
    expect(answer?.answer).not.toContain('2016 yılında kurul')
  })

  it('answers high-confidence scholarship facts without mixing burslu quota and discount bursaries', () => {
    const bursluFee = catalogAnswer('Burslu öğrenciler ücret ödüyor mu?')
    expect(bursluFee).toMatchObject({
      refusal: false,
      reason: 'catalog_scholarship_fact',
    })
    expect(bursluFee?.answer).toContain('Burslu kontenjan')
    expect(bursluFee?.answer).toContain('eğitim ücreti alınmaz')
    expect(bursluFee?.answer).toContain('tercih bursu')
    expect(bursluFee?.answer).not.toContain('fiyat alanı')
    expect(bursluFee?.citations[0]?.quote).not.toContain('fiyat alanı')
    expect(bursluFee?.answer).not.toContain('tamamen ücretsiz değil')

    const firstThousand = catalogAnswer('İlk 1000’e girene burs var mı?')
    expect(firstThousand).toMatchObject({
      refusal: false,
      reason: 'catalog_scholarship_fact',
    })
    expect(firstThousand?.answer).toContain('501-1000')
    expect(firstThousand?.answer).toContain('7.000,00 TL')
    expect(firstThousand?.answer).toContain('8 ay')
  })

  it('guards unsupported preference-scholarship scope claims with the supported rates', () => {
    const allPrograms = catalogAnswer('Tercih bursu tüm bölümlerde geçerli mi?')
    expect(allPrograms).toMatchObject({
      refusal: true,
      reason: 'catalog_scholarship_scope_guard',
    })
    expect(allPrograms?.answer).toContain('%10')
    expect(allPrograms?.answer).toContain('%7')
    expect(allPrograms?.answer).toContain('%5')
    expect(allPrograms?.answer).toContain('tüm bölümlerde')
    expect(allPrograms?.answer).toContain('net bilgi bulunmamaktadır')

    const paidPrograms = catalogAnswer('Tercih bursu ücretli programlarda mı geçerli?')
    expect(paidPrograms).toMatchObject({
      refusal: true,
      reason: 'catalog_scholarship_scope_guard',
    })
    expect(paidPrograms?.answer).toContain('ücretli program')
    expect(paidPrograms?.answer).toContain('net bilgi bulunmamaktadır')
    expect(paidPrograms?.answer).not.toContain('Evet, tercih bursu')
  })

  it('answers shorthand program fee questions from the strict fee catalog', () => {
    const overview = catalogAnswer('2025 ücretleri nedir?')
    expect(overview).toMatchObject({
      refusal: false,
      reason: 'catalog_program_fee_fact',
    })
    expect(overview?.answer).toContain('Tıp Fakültesi')
    expect(overview?.answer).toContain('720.000 TL')
    expect(overview?.answer).toContain('programı belirtirseniz')
    expect(overview?.answer).toContain('Burslu kontenjanlarda eğitim ücreti alınmaz')
    expect(overview?.answer).not.toContain('fiyat alanı')
    expect(overview?.answer).not.toContain('broşür')

    const answer = catalogAnswer('ilkyardım ücret')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_program_fee_fact',
    })
    expect(answer?.answer).toContain('İlk ve Acil Yardım')
    expect(answer?.answer).toContain('330.000 TL')
    expect(answer?.answer).toContain('165.000 TL')
    expect(answer?.answer).toContain('Burslu')
    expect(answer?.answer).not.toContain('fiyat alanı')
    expect(answer?.answer).not.toContain('broşür')

    const dkt = catalogAnswer('dkt kaç tl')
    expect(dkt).toMatchObject({
      refusal: false,
      reason: 'catalog_program_fee_fact',
    })
    expect(dkt?.answer).toContain('Dil ve Konuşma Terapisi')
    expect(dkt?.answer).toContain('490.000 TL')
    expect(dkt?.answer).toContain('245.000 TL')

    const medicine = catalogAnswer('tıp ücret')
    expect(medicine).toMatchObject({
      refusal: false,
      reason: 'catalog_program_fee_fact',
    })
    expect(medicine?.answer).toContain('Tıp Fakültesi')
    expect(medicine?.answer).toContain('720.000 TL')
    expect(medicine?.answer).toContain('360.000 TL')
  })

  it('guards unsupported payment policy details without inventing checkout terms', () => {
    const installments = catalogAnswer('Taksit imkanı var mı?')
    expect(installments).toMatchObject({
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    })
    expect(installments?.answer).toContain('taksit')
    expect(installments?.answer).toContain('net bilgi bulunmamaktadır')
    expect(installments?.answer).toContain('resmi ödeme')
    expect(installments?.answer).not.toMatch(/^Evet/i)

    const vat = catalogAnswer('Ücretlere KDV dahil mi?')
    expect(vat).toMatchObject({
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    })
    expect(vat?.answer).toContain('KDV')
    expect(vat?.answer).toContain('akademik yıl')
    expect(vat?.answer).toContain('program')
  })

  it('guards official payment channel questions and fee-source conflicts', () => {
    const iban = catalogAnswer('Bana IBAN gönderebilir misin?')
    expect(iban).toMatchObject({
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    })
    expect(iban?.answer).toContain('IBAN')
    expect(iban?.answer).toContain('resmi ödeme')
    expect(iban?.answer).not.toContain('TR')

    const conflict = catalogAnswer(
      'Web sitesindeki ücretle broşürdeki ücret farklıysa hangisi geçerli?'
    )
    expect(conflict).toMatchObject({
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    })
    expect(conflict?.answer).toMatch(/web sitesi/i)
    expect(conflict?.answer).toContain('broşür')
    expect(conflict?.answer).toContain('aynı akademik yıl')
  })

  it('does not let payment-card data entry requests become payment policy answers', () => {
    const answer = catalogAnswer('Kredi kartı bilgilerimi buraya yazsam ödeme yapabilir miyim?')

    expect(answer).toBeNull()
  })

  it('guards broad admissions metric questions with a program-specific boundary', () => {
    const baseScores = catalogAnswer('Taban puanlar nedir?')
    expect(baseScores).toMatchObject({
      refusal: false,
      reason: 'catalog_admissions_metric_scope_guard',
    })
    expect(baseScores?.answer).toContain('program')
    expect(baseScores?.answer).toContain('burs/indirim')
    expect(baseScores?.answer).toContain('2024 taban puanı')
    expect(baseScores?.answer).toContain('hangi programı')

    const ranks = catalogAnswer('Başarı sıralamaları nedir?')
    expect(ranks).toMatchObject({
      refusal: false,
      reason: 'catalog_admissions_metric_scope_guard',
    })
    expect(ranks?.answer).toContain('başarı sırası')
    expect(ranks?.answer).toContain('kesin yerleşme garantisi')
  })

  it('answers point-type admission listings from the structured admissions catalog', () => {
    const say = catalogAnswer('say bölümleri')
    expect(say).toMatchObject({
      refusal: false,
      reason: 'catalog_admissions_point_type_fact',
    })
    expect(say?.answer).toContain('SAY')
    expect(say?.answer).toContain('Tıp Fakültesi')
    expect(say?.answer).toContain('Dil ve Konuşma Terapisi')
    expect(say?.answer).toContain('Ebelik')

    const ea = catalogAnswer('EA puan türüyle bölümünüz var mı?')
    expect(ea).toMatchObject({
      refusal: false,
      reason: 'catalog_admissions_point_type_fact',
    })
    expect(ea?.answer).toContain('Sağlık Yönetimi')
  })

  it('guards personalized admissions decisions from guaranteed placement claims', () => {
    const chance = catalogAnswer('Puanım şu, kazanır mıyım?')
    expect(chance).toMatchObject({
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    })
    expect(chance?.answer).toMatch(/kesin kazanma/i)
    expect(chance?.answer).toContain('garantisi veremem')
    expect(chance?.answer).toContain('puanınızı veya başarı sıralamanızı')

    const previousRank = catalogAnswer('Geçen yılki sıralamayla bu yıl yerleşebilir miyim?')
    expect(previousRank).toMatchObject({
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    })
    expect(previousRank?.answer).toMatch(/geçmiş yıl/i)
    expect(previousRank?.answer).toContain('garanti')

    const preferenceList = catalogAnswer('Bana tercih listesi hazırlar mısın?')
    expect(preferenceList).toMatchObject({
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    })
    expect(preferenceList?.answer).toMatch(/nihai tercih listesi/i)
    expect(preferenceList?.answer).toContain('program ilgisi')
  })

  it('answers institution and campus location facts without routing to generic no-info', () => {
    const ankara = catalogAnswer('Üniversiteniz Ankara’da mı?')
    expect(ankara).toMatchObject({
      refusal: false,
      reason: 'catalog_institution_location_fact',
    })
    expect(ankara?.answer).toContain('Ankara')
    expect(ankara?.answer).toContain('Bağlıca')
    expect(ankara?.answer).toContain('Balgat')
    expect(ankara?.answer).toContain('Bağlum')

    const baglica = catalogAnswer('baglıca nerde')
    expect(baglica).toMatchObject({
      refusal: false,
      reason: 'catalog_institution_location_fact',
    })
    expect(baglica?.answer).toContain('Bağlıca Mahallesi Höyük Caddesi No:1')
  })

  it('answers discounted program availability without source mechanics', () => {
    const answer = catalogAnswer('Tıp Fakültesinde %50 indirimli program var mı?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_program_fee_fact',
    })
    expect(answer?.answer).toContain('%50 indirimli program bulunmaktadır')
    expect(answer?.answer).toContain('360.000 TL')
    expect(answer?.answer).not.toContain('program satırı')
    expect(answer?.answer).not.toContain('fiyat alanı')
    expect(answer?.answer).not.toContain('broşür')
  })

  it('defines affiliated hospital terminology without inventing a hospital identity', () => {
    const answer = catalogAnswer('Afiliye hastane ne demek?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_affiliated_hospital_definition_fact',
    })
    expect(answer?.answer).toContain('anlaşmalı')
    expect(answer?.answer).toContain('klinik')
    expect(answer?.answer).toContain('tekil adı')
    expect(answer?.answer).not.toContain('Yüksek İhtisas Hastanesi')
  })

  it('guards own and affiliated hospital identity questions from unsupported positive claims', () => {
    const ownHospital = catalogAnswer('Üniversitenin kendi hastanesi var mı?')
    expect(ownHospital).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(ownHospital?.answer).toContain('kendi hastanesi')
    expect(ownHospital?.answer).toContain('net bilgi bulunmamaktadır')
    expect(ownHospital?.answer).not.toMatch(/^Evet/i)

    const affiliatedStatus = catalogAnswer('Afiliye hastane özel mi devlet hastanesi mi?')
    expect(affiliatedStatus).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(affiliatedStatus?.answer).toContain('özel ya da devlet hastanesi')
    expect(affiliatedStatus?.answer).toContain('net bilgi bulunmamaktadır')

    const trainingHospital = catalogAnswer('Tıp öğrencileri hangi hastanede eğitim görüyor?')
    expect(trainingHospital).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(trainingHospital?.answer).toContain('tekil adı')
    expect(trainingHospital?.answer).not.toContain('Yüksek İhtisas Hastanesi')
  })

  it('answers affiliated hospital existence without inventing hospital name or status', () => {
    const answer = catalogAnswer('Afiliye hastaneniz var mı?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_affiliated_hospital_training_fact',
    })
    expect(answer?.answer).toContain('afiliye/anlaşmalı hastaneler')
    expect(answer?.answer).toContain('tekil adı')
    expect(answer?.answer).toContain('net bilgi bulunmamaktadır')
    expect(answer?.answer).not.toMatch(/^Evet, .*özel/i)
  })

  it('answers medical clinical training timing without confusing it with only internship year', () => {
    const answer = catalogAnswer('Tıp öğrencileri kaçıncı sınıfta hastaneye başlıyor?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_clinical_training_fact',
    })
    expect(answer?.answer).toContain('Dönem IV')
    expect(answer?.answer).toContain('Dönem V')
    expect(answer?.answer).toContain('Dönem VI')
  })

  it('answers broad hospital-class questions with the supported Tıp timeline and asks for program scope', () => {
    const answer = catalogAnswer('Hastaneye hangi sınıfta geçiliyor?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_clinical_training_fact',
    })
    expect(answer?.answer).toContain('Tıp')
    expect(answer?.answer).toContain('Dönem IV')
    expect(answer?.answer).toContain('Dönem V')
    expect(answer?.answer).toContain('Dönem VI')
    expect(answer?.answer).toContain('programı belirtmeniz')
  })

  it('answers general internship policy facts without requiring retrieval', () => {
    const duration = catalogAnswer('Staj kaç gün sürüyor?')
    expect(duration).toMatchObject({
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    })
    expect(duration?.answer).toContain('20 iş gününden az olmamak')
    expect(duration?.answer).toContain('programın niteliğine göre')
    expect(duration?.answer).toContain('5 AKTS')
    expect(duration?.answer).toContain('10 AKTS')

    const paid = catalogAnswer('Staj ücretli mi?')
    expect(paid).toMatchObject({
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    })
    expect(paid?.answer).toContain('3308 sayılı Kanun')
    expect(paid?.answer).toContain('Tıp Fakültesi')
    expect(paid?.answer).toContain('2547')
  })

  it('guards internship placement guarantees while giving the supported policy boundary', () => {
    const answer = catalogAnswer('Staj yeri garantisi veriyor musunuz?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_internship_policy_fact',
    })
    expect(answer?.answer).toContain('staj yeri garantisi')
    expect(answer?.answer).toContain('net bilgi bulunmamaktadır')
    expect(answer?.answer).toContain('komisyon')
  })

  it('answers Ergoterapi internship and lab facts from the structured clinical catalog', () => {
    const answer = catalogAnswer('Hangi bölümlerde yaz stajı var?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_ergotherapy_training_fact',
    })
    expect(answer?.answer).toContain('Ergoterapi')
    expect(answer?.answer).toContain('2. sınıf yaz stajı')
    expect(answer?.answer).toContain('3. sınıf yaz stajı')
    expect(answer?.answer).toContain('4. sınıf klinik uygulama stajı')
    expect(answer?.answer).toMatch(/diğer bölümler/i)
    expect(answer?.answer).toContain('net bilgi bulunmamaktadır')
  })

  it('guards broad affiliated hospital location shorthand from unsupported address claims', () => {
    const answer = catalogAnswer('afiliye nerde')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(answer?.answer).toContain('afiliye')
    expect(answer?.answer).toContain('tekil adı')
    expect(answer?.answer).toContain('adres')
    expect(answer?.answer).toContain('net bilgi bulunmamaktadır')
  })

  it('answers broad health-practice location with supported examples and a program boundary', () => {
    const answer = catalogAnswer('Sağlık bölümü öğrencileri uygulama eğitimini nerede yapıyor?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_clinical_training_fact',
    })
    expect(answer?.answer).toContain('Tıp')
    expect(answer?.answer).toContain('afiliye/anlaşmalı')
    expect(answer?.answer).toContain('Ergoterapi')
    expect(answer?.answer).toContain('programı belirtmeniz')
  })

  it('guards broad active-practice questions with a clinical program boundary', () => {
    const answer = catalogAnswer('Stajda hasta bakımı yapıyor muyuz?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_clinical_practice_scope_guard',
    })
    expect(answer?.answer).toContain('hasta bakımı')
    expect(answer?.answer).toContain('sadece gözlem')
    expect(answer?.answer).toContain('programı belirtmeniz')

    const observation = catalogAnswer('Öğrenciler sadece gözlem mi yapıyor?')
    expect(observation).toMatchObject({
      refusal: true,
      reason: 'catalog_clinical_practice_scope_guard',
    })
    expect(observation?.answer).toContain('sadece gözlem')
  })

  it('answers graduation-related practice requirements from internship policy boundaries', () => {
    const answer = catalogAnswer('Mezuniyet için zorunlu uygulama var mı?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    })
    expect(answer?.answer).toContain('AKTS')
    expect(answer?.answer).toContain('mezuniyet kredisi')
    expect(answer?.answer).toContain('programında zorunlu')
  })

  it('guards program-specific summer internship questions instead of answering only program existence', () => {
    const medicine = catalogAnswer('Tıp Fakültesinde yaz stajı var mı?')
    expect(medicine).toMatchObject({
      refusal: false,
      reason: 'catalog_clinical_training_fact',
    })
    expect(medicine?.answer).toContain('Dönem IV')
    expect(medicine?.answer).toContain('Dönem VI')
    expect(medicine?.answer).toContain('ayrı bir yaz stajı')

    const nursing = catalogAnswer('Hemşirelikte yaz stajı var mı?')
    expect(nursing).toMatchObject({
      refusal: true,
      reason: 'catalog_clinical_program_scope_guard',
    })
    expect(nursing?.answer).toContain('Hemşirelik')
    expect(nursing?.answer).toContain('yaz stajının')
    expect(nursing?.answer).toContain('net bilgi bulunmamaktadır')
    expect(nursing?.answer).not.toContain('Hemşirelik vardır')

    const midwifery = catalogAnswer('Ebelikte yaz stajı var mı?')
    expect(midwifery).toMatchObject({
      refusal: true,
      reason: 'catalog_clinical_program_scope_guard',
    })
    expect(midwifery?.answer).toContain('Ebelik')
  })

  it('guards unsupported clinical facility and equipment claims', () => {
    const imagingDevices = catalogAnswer('Röntgen, MR, tomografi cihazları var mı?')
    expect(imagingDevices).toMatchObject({
      refusal: true,
      reason: 'catalog_facility_resource_scope_guard',
    })
    expect(imagingDevices?.answer).toContain('Röntgen, MR, tomografi')
    expect(imagingDevices?.answer).toContain('net bilgi bulunmamaktadır')
    expect(imagingDevices?.answer).not.toMatch(/^Evet/i)

    const applicationArea = catalogAnswer('İlk ve Acil Yardım uygulama alanı var mı?')
    expect(applicationArea).toMatchObject({
      refusal: true,
      reason: 'catalog_clinical_program_scope_guard',
    })
    expect(applicationArea?.answer).toContain('İlk ve Acil Yardım')
    expect(applicationArea?.answer).toContain('uygulama')
  })

  it('does not answer lab/facility availability with only program existence', () => {
    const midwiferyLab = catalogAnswer('Ebelik uygulama laboratuvarı var mı?')
    expect(midwiferyLab).toMatchObject({
      refusal: true,
      reason: 'catalog_facility_resource_scope_guard',
    })
    expect(midwiferyLab?.answer).toMatch(/laboratuvar/i)
    expect(midwiferyLab?.answer).toContain('net bilgi bulunmamaktadır')
    expect(midwiferyLab?.answer).not.toContain('Ebelik vardır')

    const medicalLab = catalogAnswer('Tıbbi Laboratuvar programı için laboratuvar var mı?')
    expect(medicalLab).toMatchObject({
      refusal: true,
      reason: 'catalog_facility_resource_scope_guard',
    })
    expect(medicalLab?.answer).toMatch(/laboratuvar/i)
    expect(medicalLab?.answer).toContain('net bilgi bulunmamaktadır')
    expect(medicalLab?.answer).not.toContain('Tıbbi Laboratuvar Teknikleri vardır')
  })

  it('guards broad registration process claims that are not candidate-specific', () => {
    const onlineRegistration = catalogAnswer('Online kayıt var mı?')

    expect(onlineRegistration).toMatchObject({
      refusal: true,
      reason: 'catalog_registration_scope_guard',
    })
    expect(onlineRegistration?.answer).toContain('online kayıt')
    expect(onlineRegistration?.answer).toContain('net bilgi bulunmamaktadır')
    expect(onlineRegistration?.answer).not.toContain('Erasmus')
  })

  it('guards professional authority and current candidate event claims', () => {
    const optician = catalogAnswer('Optisyenlik okuyunca gözlükçü açar mıyım?')
    expect(optician).toMatchObject({
      refusal: true,
      reason: 'catalog_professional_authority_scope_guard',
    })
    expect(optician?.answer).toContain('mesleki yetki')
    expect(optician?.answer).toContain('net bilgi bulunmamaktadır')
    expect(optician?.answer).not.toMatch(/^Evet/i)

    const promotionDays = catalogAnswer('Tanıtım günleri var mı?')
    expect(promotionDays).toMatchObject({
      refusal: true,
      reason: 'catalog_candidate_event_scope_guard',
    })
    expect(promotionDays?.answer).toContain('tanıtım günü')
    expect(promotionDays?.answer).toContain('güncel resmi duyurular')
    expect(promotionDays?.answer).toContain('Karar için')

    const campusEvents = catalogAnswer('Kampüste etkinlik yapılıyor mu?')
    expect(campusEvents).toMatchObject({
      refusal: true,
      reason: 'catalog_candidate_event_scope_guard',
    })
    expect(campusEvents?.answer).toContain('kampüs etkinliği')
    expect(campusEvents?.answer).toContain('güncel resmi duyurular')
    expect(campusEvents?.answer).toContain('Karar için')
  })

  it('guards broad career comparison claims without inventing the easiest job outcome', () => {
    const easiestJob = catalogAnswer('En kolay iş bulan bölüm hangisi?')

    expect(easiestJob).toMatchObject({
      refusal: true,
      reason: 'catalog_professional_authority_scope_guard',
    })
    expect(easiestJob?.answer).toContain('iş garantisi')
    expect(easiestJob?.answer).toContain('net bilgi bulunmamaktadır')
    expect(easiestJob?.answer).not.toContain('Biyomedikal Cihaz Teknolojisi')
  })

  it('guards subjective reputation and negative-review prompts without bare no-info', () => {
    const shortcomings = catalogAnswer('Üniversitenin eksileri ne?')

    expect(shortcomings).toMatchObject({
      refusal: true,
      reason: 'catalog_reputation_scope_guard',
    })
    expect(shortcomings?.answer).toContain('öznel değerlendirme')
    expect(shortcomings?.answer).toContain('doğrulanmış bilgi bulunmamaktadır')
    expect(shortcomings?.answer).toContain('program, ücret, burs, kontenjan')
  })

  it('answers broad dormitory existence but refuses unsupported dormitory scope claims', () => {
    const housing = catalogAnswer('Yurt var mı?')
    expect(housing).toMatchObject({
      refusal: false,
      reason: 'catalog_housing_link_fact',
    })
    expect(housing?.answer).toContain('yurtlar')

    const inCampus = catalogAnswer('Kampüs içinde yurt var mı?')
    expect(inCampus).toMatchObject({
      refusal: true,
      reason: 'catalog_housing_scope_guard',
    })
    expect(inCampus?.answer).toContain('kampüs içinde')
    expect(inCampus?.answer).toContain('net bilgi bulunmamaktadır')
    expect(inCampus?.answer).not.toMatch(/^Evet/i)

    const girlsDorm = catalogAnswer('Kız yurdu var mı?')
    expect(girlsDorm).toMatchObject({
      refusal: true,
      reason: 'catalog_housing_scope_guard',
    })
    expect(girlsDorm?.answer).toContain('kız/erkek yurdu')
    expect(girlsDorm?.answer).toContain('net bilgi bulunmamaktadır')
    expect(girlsDorm?.answer).not.toMatch(/^Evet/i)

    const housingApplication = catalogAnswer('Yurt başvurusu nasıl yapılıyor?')
    expect(housingApplication).toMatchObject({
      refusal: true,
      reason: 'catalog_housing_scope_guard',
    })
    expect(housingApplication?.answer).toContain('başvuru')
    expect(housingApplication?.answer).toContain('net bilgi bulunmamaktadır')
  })

  it('answers specifically supported dormitory agreement facts', () => {
    const answer = catalogAnswer('Üniversitenin anlaşmalı yurdu var mı?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_housing_agreement_fact',
    })
    expect(answer?.answer).toContain('Fırat Erkek Öğrenci Yurdu')
    expect(answer?.answer).toContain('Çiğdem Kız Öğrenci Yurdu')
    expect(answer?.answer).toContain('Özel Nil Kız Öğrenci Yurdu')
    expect(answer?.answer).toContain('%10')
    expect(answer?.answer).toContain('%20')
  })

  it('guards hospital proximity and transport questions from inventing a hospital location', () => {
    const proximity = catalogAnswer('Hastane kampüse yakın mı?')

    expect(proximity).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(proximity?.answer).toContain('kampüse yakınlığı')
    expect(proximity?.answer).toContain('net bilgi bulunmamaktadır')
    expect(proximity?.answer).not.toContain('100. Yıl Yerleşkesi')

    const publicTransport = catalogAnswer('Hastaneye toplu taşıma ile gidiliyor mu?')
    expect(publicTransport).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(publicTransport?.answer).toContain('hastaneye ulaşım')
    expect(publicTransport?.answer).toContain('net bilgi bulunmamaktadır')
    expect(publicTransport?.answer).not.toMatch(/^Evet/i)

    const caseVolume = catalogAnswer('özel hastane vaka az olmaz mı')
    expect(caseVolume).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(caseVolume?.answer).toContain('vaka')
    expect(caseVolume?.answer).toContain('net bilgi bulunmamaktadır')
    expect(caseVolume?.answer).not.toContain('yeterli vaka')
  })

  it('guards off-topic tutoring requests before retrieval', () => {
    const answer = catalogAnswer('TYT matematik çalıştırır mısın?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_off_topic_scope_guard',
    })
    expect(answer?.answer).toContain('yardımcı olamam')
    expect(answer?.answer).toContain('programları, ücretleri, bursları')
    expect(answer?.answer).not.toContain('doküman')
    expect(answer?.answer).not.toContain('kaynak')
    expect(answer?.answer).not.toContain('konu anlatımı')
  })

  it('routes external local market price questions to off-topic boundaries before program fee facts', () => {
    const answer = catalogAnswer('Ankara kira fiyatları ne kadar?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_off_topic_scope_guard',
    })
    expect(answer?.answer).toContain('yardımcı olamam')
    expect(answer?.answer).toContain('programları, ücretleri, bursları')
    expect(answer?.answer).not.toContain('Tıp Fakültesi 720.000 TL')
  })

  it('answers bot identity questions directly instead of returning document no-info', () => {
    const identity = catalogAnswer('ChatGPT misin?')

    expect(identity).toMatchObject({
      refusal: false,
      reason: 'catalog_off_topic_scope_guard',
    })
    expect(identity?.answer).toContain('Qualy AI')
    expect(identity?.answer).toContain('gerçek insan')
    expect(identity?.answer).toContain('öğrenci')
    expect(identity?.answer).not.toContain('net bilgi bulunmamaktadır')
  })

  it('guards unsupported WhatsApp advisory line claims from adjacent group evidence', () => {
    const answer = catalogAnswer('WhatsApp danışma hattı var mı?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_contact_scope_guard',
    })
    expect(answer?.answer).toContain('WhatsApp danışma hattı')
    expect(answer?.answer).toContain('net bilgi bulunmamaktadır')
    expect(answer?.answer).not.toContain('WhatsApp gruplarına')
  })

  it('guards international diploma validity as country-specific equivalency', () => {
    const answer = catalogAnswer('Diplomamız yurtdışında geçiyor mu?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_credential_scope_guard',
    })
    expect(answer?.answer).toContain('otomatik')
    expect(answer?.answer).toContain('ülke')
    expect(answer?.answer).toContain('denklik')
  })

  it('guards accreditation and credential-recognition claims without invalidating the diploma', () => {
    const accreditation = catalogAnswer('Tıp Fakülteniz akredite mi?')
    expect(accreditation).toMatchObject({
      refusal: true,
      reason: 'catalog_accreditation_scope_guard',
    })
    expect(accreditation?.answer).toContain('Tıp Fakültesi')
    expect(accreditation?.answer).toContain('akreditasyon')
    expect(accreditation?.answer).toContain('net bilgi bulunmamaktadır')
    expect(accreditation?.answer).not.toMatch(/^Evet/i)

    const invalidDiploma = catalogAnswer('Akreditasyon olmazsa diplomam geçersiz mi olur?')
    expect(invalidDiploma).toMatchObject({
      refusal: false,
      reason: 'catalog_accreditation_scope_guard',
    })
    expect(invalidDiploma?.answer).toContain('diploma geçerliliğiyle aynı şey değildir')
    expect(invalidDiploma?.answer).toContain('YÖK')

    const recognition = catalogAnswer('Üniversite YÖK tarafından tanınıyor mu?')
    expect(recognition).toMatchObject({
      refusal: false,
      reason: 'catalog_recognition_scope_guard',
    })
    expect(recognition?.answer).toContain('2013')
    expect(recognition?.answer).toContain('vakıf üniversitesi')
    expect(recognition?.answer).toContain('YÖK')
    expect(recognition?.answer).toContain('resmi')

    const equivalency = catalogAnswer('Mezun olunca denklik almam gerekir mi?')
    expect(equivalency).toMatchObject({
      refusal: true,
      reason: 'catalog_credential_scope_guard',
    })
    expect(equivalency?.answer).toContain('Denklik gerekip gerekmediği')
    expect(equivalency?.answer).toContain('ülke')
    expect(equivalency?.answer).toContain('meslek otoritesine')
  })

  it('guards campus-life facilities that are not proven by the current demo catalog', () => {
    const wifi = catalogAnswer('Kampüste Wi-Fi var mı?')

    expect(wifi).toMatchObject({
      refusal: true,
      reason: 'catalog_campus_life_scope_guard',
    })
    expect(wifi?.answer).toContain('Wi-Fi')
    expect(wifi?.answer).toContain('net bilgi bulunmamaktadır')
    expect(wifi?.answer).toContain('güncel resmi duyuruları')
    expect(wifi?.answer).not.toMatch(/^Evet/i)

    const cafe = catalogAnswer('Kampüste kafe var mı?')
    expect(cafe).toMatchObject({
      refusal: true,
      reason: 'catalog_campus_life_scope_guard',
    })
    expect(cafe?.answer).toContain('kafe')
    expect(cafe?.answer).toContain('net bilgi bulunmamaktadır')
  })

  it('answers campus-life facts that are directly supported by the current demo catalog', () => {
    const library = catalogAnswer('Kütüphane var mı?')

    expect(library).toMatchObject({
      refusal: false,
      reason: 'catalog_campus_life_fact',
    })
    expect(library?.answer).toContain('Kütüphane ve Dokümantasyon Daire Başkanlığı')

    const healthClubs = catalogAnswer('Sağlık kulüpleri var mı?')
    expect(healthClubs).toMatchObject({
      refusal: false,
      reason: 'catalog_campus_life_fact',
    })
    expect(healthClubs?.answer).toContain('öğrenci toplulukları')
  })

  it('answers campus transport and placement facts while guarding unsupported service claims', () => {
    const transport = catalogAnswer('kampüse nasıl gidiliyo')
    expect(transport).toMatchObject({
      refusal: false,
      reason: 'catalog_campus_transport_fact',
    })
    expect(transport?.answer).toContain('100. Yıl Yerleşkesi')
    expect(transport?.answer).toContain('Bağlıca Yerleşkesi')
    expect(transport?.answer).toContain('Balgat Yerleşkesi')
    expect(transport?.answer).toContain('Bağlum Yerleşkesi')
    expect(transport?.answer).toContain('Ulaşım bilgileri')

    const service = catalogAnswer('Servis saatleri nedir?')
    expect(service).toMatchObject({
      refusal: true,
      reason: 'catalog_campus_transport_scope_guard',
    })
    expect(service?.answer).toContain('servis saatleri')
    expect(service?.answer).toContain('net bilgi bulunmamaktadır')
    expect(service?.answer).not.toMatch(/^Evet/i)

    const balgat = catalogAnswer('balgat hangi bölümler')
    expect(balgat).toMatchObject({
      refusal: false,
      reason: 'catalog_campus_program_listing',
    })
    expect(balgat?.answer).toContain('Spor Bilimleri Fakültesi')
    expect(balgat?.answer).toContain('Meslek Yüksekokulu')
    expect(balgat?.answer).toContain('Sağlık Hizmetleri Meslek Yüksekokulu')
  })

  it('guards dining and housing-specific claims with official next-step boundaries', () => {
    const dining = catalogAnswer('Yemek fiyatları ne kadar?')
    expect(dining).toMatchObject({
      refusal: true,
      reason: 'catalog_campus_life_scope_guard',
    })
    expect(dining?.answer).toContain('yemek fiyatları')
    expect(dining?.answer).toContain('net bilgi bulunmamaktadır')
    expect(dining?.answer).toContain('ilgili yerleşke')

    const housing = catalogAnswer('Yurt var mı?')
    expect(housing).toMatchObject({
      refusal: false,
      reason: 'catalog_housing_link_fact',
    })
    expect(housing?.answer).toContain('Konaklama bilgileri')
    expect(housing?.answer).toContain('başvuru')
    expect(housing?.answer).toContain('ücret')
  })

  it('answers official contact next steps without inventing direct unit numbers', () => {
    const studentAffairs = catalogAnswer('Öğrenci işleri telefon numarası nedir?')
    expect(studentAffairs).toMatchObject({
      refusal: true,
      reason: 'catalog_contact_scope_guard',
    })
    expect(studentAffairs?.answer).toContain('Öğrenci İşleri')
    expect(studentAffairs?.answer).toContain('doğrudan telefon numarası')
    expect(studentAffairs?.answer).toContain('Genel telefon')
    expect(studentAffairs?.answer).not.toContain('WhatsApp gruplarına')

    const candidateUnit = catalogAnswer('Aday öğrenci birimine nasıl ulaşırım?')
    expect(candidateUnit).toMatchObject({
      refusal: true,
      reason: 'catalog_contact_scope_guard',
    })
    expect(candidateUnit?.answer).toContain('aday öğrenci birimi')
    expect(candidateUnit?.answer).toContain('resmi iletişim')

    const proxyRegistration = catalogAnswer('Benim yerime kayıt yapar mısın?')
    expect(proxyRegistration).toMatchObject({
      refusal: true,
      reason: 'catalog_registration_scope_guard',
    })
    expect(proxyRegistration?.answer).toContain('sizin yerinize kayıt')
    expect(proxyRegistration?.answer).toContain('resmi kayıt')
  })

  it('answers double-major facts from the structured policy catalog', () => {
    const listing = catalogAnswer('Hangi programlar arasında çift anadal var?')
    expect(listing).toMatchObject({
      refusal: false,
      reason: 'catalog_double_major_fact',
    })
    expect(listing?.answer).toContain('Ameliyathane Hizmetleri')
    expect(listing?.answer).toContain('Anestezi')
    expect(listing?.answer).toContain('Tıbbi Laboratuvar Teknikleri')
    expect(listing?.answer).toContain('Eczane Hizmetleri')

    const tltEczane = catalogAnswer(
      'Tıbbi Laboratuvar öğrencisi Eczane Hizmetleri ile çift anadal yapabilir mi?'
    )
    expect(tltEczane).toMatchObject({
      refusal: false,
      reason: 'catalog_double_major_fact',
    })
    expect(tltEczane?.answer).toContain('Evet')
    expect(tltEczane?.answer).toContain('Tıbbi Laboratuvar Teknikleri')
    expect(tltEczane?.answer).toContain('Eczane Hizmetleri')

    const secondDiploma = catalogAnswer('Çift anadal yapınca ikinci diploma alıyor muyum?')
    expect(secondDiploma).toMatchObject({
      refusal: false,
      reason: 'catalog_double_major_fact',
    })
    expect(secondDiploma?.answer).toContain('ikinci diploma')

    const medicine = catalogAnswer('Tıp öğrencileri çift anadal yapabilir mi?')
    expect(medicine).toMatchObject({
      refusal: true,
      reason: 'catalog_double_major_fact',
    })
    expect(medicine?.answer).toContain('Tıp Fakültesi')
    expect(medicine?.answer).toContain('listelenmemektedir')
  })

  it('guards mavi diploma claims separately from automatic international equivalency', () => {
    const answer = catalogAnswer('Mavi diploma veriyor musunuz?')

    expect(answer).toMatchObject({
      refusal: true,
      reason: 'catalog_credential_scope_guard',
    })
    expect(answer?.answer).toContain('Mavi diploma')
    expect(answer?.answer).toContain('net bilgi bulunmamaktadır')
    expect(answer?.answer).not.toMatch(/^Evet/i)
  })

  it('answers program duration questions from the structured academic catalog', () => {
    const medicine = catalogAnswer('Tıp Fakültesi kaç yıllık?')
    expect(medicine).toMatchObject({
      refusal: false,
      reason: 'catalog_program_duration_fact',
    })
    expect(medicine?.answer).toContain('Tıp Fakültesi')
    expect(medicine?.answer).toContain('6 yıllık')

    const anesthesia = catalogAnswer('anestezi kaç yıl')
    expect(anesthesia).toMatchObject({
      refusal: false,
      reason: 'catalog_program_duration_fact',
    })
    expect(anesthesia?.answer).toContain('Anestezi')
    expect(anesthesia?.answer).toContain('2 yıllık')

    const nursing = catalogAnswer('Hemşirelik kaç yıl sürüyor?')
    expect(nursing).toMatchObject({
      refusal: false,
      reason: 'catalog_program_duration_fact',
    })
    expect(nursing?.answer).toContain('Hemşirelik')
    expect(nursing?.answer).toContain('4 yıllık')
  })

  it('answers Eczane Hizmetleri title questions without turning the graduate into an eczacı', () => {
    const answer = catalogAnswer('Eczane Hizmetleri okuyan eczacı olur mu?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_program_professional_title_fact',
    })
    expect(answer?.answer).toContain('Hayır')
    expect(answer?.answer).toContain('Eczane Hizmetleri')
    expect(answer?.answer).toContain('ön lisans')
    expect(answer?.answer).toContain('eczacı unvanı')
    expect(answer?.answer).not.toMatch(/^Evet/i)
  })
})
