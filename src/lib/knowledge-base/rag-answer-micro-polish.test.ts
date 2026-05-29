import { describe, expect, it } from 'vitest'

import { microPolishDeterministicRagAnswer } from '@/lib/knowledge-base/rag-answer-micro-polish'

describe('microPolishDeterministicRagAnswer', () => {
    it('expands terse course-code answers from title initialism evidence without changing the fact', () => {
        const polished = microPolishDeterministicRagAnswer({
            answer: 'TLT 216 Yaz Stajı 20 iş günüdür.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı kaç iş günü?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    content: 'TLT 216 Yaz Stajı 20 iş günüdür.'
                }
            ]
        })

        expect(polished).toEqual({
            answer: 'Tabii, Tıbbi Laboratuvar Teknikleri programında TLT 216 Yaz Stajı 20 iş günüdür.',
            usedMicroPolish: true
        })
    })

    it('leaves source-absence answers untouched so a friendly prefix does not weaken grounding', () => {
        const polished = microPolishDeterministicRagAnswer({
            answer: 'Kaynakta Tıp Fakültesi için ayrı bir "yaz stajı" ifadesi geçmiyor. Eğitim Dönem IV-V’te klinik stajlar ve Dönem VI’da intörnlük şeklinde yürütülür.',
            userMessage: 'Tıp fakültesinde yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    content: 'Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitimöğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.'
                }
            ]
        })

        expect(polished).toEqual({
            answer: 'Kaynakta Tıp Fakültesi için ayrı bir "yaz stajı" ifadesi geçmiyor. Eğitim Dönem IV-V’te klinik stajlar ve Dönem VI’da intörnlük şeklinde yürütülür.',
            usedMicroPolish: false
        })
    })

    it('does not invent a program expansion when the retrieved titles do not support the acronym', () => {
        const polished = microPolishDeterministicRagAnswer({
            answer: 'ABC 101 dersi 3 AKTS değerindedir.',
            userMessage: 'ABC 101 kaç AKTS?',
            responseLanguage: 'tr',
            chunks: [
                {
                    document_title: 'Ders İçerikleri',
                    content: 'ABC 101 dersi 3 AKTS değerindedir.'
                }
            ]
        })

        expect(polished).toEqual({
            answer: 'ABC 101 dersi 3 AKTS değerindedir.',
            usedMicroPolish: false
        })
    })
})
