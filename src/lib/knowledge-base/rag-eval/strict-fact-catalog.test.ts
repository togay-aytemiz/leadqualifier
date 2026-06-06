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
  })

  it('lists lisans and ön lisans programs separately from the catalog', () => {
    const answer = catalogAnswer('Üniversitenizde lisans ve ön lisans programlarını ayrı ayrı listeler misin?')

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

  it('does not let supported existence catalog swallow discount or tuition questions', () => {
    expect(catalogAnswer('Tıp Fakültesinde %50 indirimli program var mı?')).toBeNull()
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

  it('asks for the program on broad clinical internship questions', () => {
    const answer = catalogAnswer('Staj kaç gün sürüyor?')

    expect(answer).toMatchObject({
      refusal: false,
      reason: 'catalog_clinical_program_clarification',
    })
    expect(answer?.answer).toBe('Hangi bölüm veya program için staj bilgisini öğrenmek istiyorsunuz?')
  })

  it('guards program-specific summer internship questions instead of answering only program existence', () => {
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

    const campusEvents = catalogAnswer('Kampüste etkinlik yapılıyor mu?')
    expect(campusEvents).toMatchObject({
      refusal: true,
      reason: 'catalog_candidate_event_scope_guard',
    })
    expect(campusEvents?.answer).toContain('kampüs etkinliği')
    expect(campusEvents?.answer).toContain('güncel resmi duyurular')
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

  it('guards hospital proximity and transport questions from inventing a hospital location', () => {
    const proximity = catalogAnswer('Hastane kampüse yakın mı?')

    expect(proximity).toMatchObject({
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    })
    expect(proximity?.answer).toContain('kampüse yakınlığı')
    expect(proximity?.answer).toContain('net bilgi bulunmamaktadır')
    expect(proximity?.answer).not.toContain('100. Yıl Yerleşkesi')
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
})
