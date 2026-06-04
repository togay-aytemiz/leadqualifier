import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessageRichText } from './messageRichText'

function render(content: string, standaloneUrlLabel?: string | ((index: number, total: number) => string)) {
  return renderToStaticMarkup(
    <MessageRichText content={content} standaloneUrlLabel={standaloneUrlLabel} />
  )
}

describe('MessageRichText', () => {
  it('renders WhatsApp-style single asterisk emphasis as bold text', () => {
    const html = render('Merhaba *Tıp Fakültesi* hakkında bilgi verebilirim.')

    expect(html).toContain('<strong>Tıp Fakültesi</strong>')
    expect(html).not.toContain('*Tıp Fakültesi*')
  })

  it('renders markdown links, raw URLs, email addresses and phone numbers as clickable links', () => {
    const html = render(
      'Detay: [Akademik takvim](https://example.com/takvim). Tel: +90 312 329 10 10 Mail: bilgiislem@yuksekihtisas.edu.tr URL: https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim'
    )

    expect(html).toContain('href="https://example.com/takvim"')
    expect(html).toContain('href="tel:+903123291010"')
    expect(html).toContain('href="mailto:bilgiislem@yuksekihtisas.edu.tr"')
    expect(html).toContain('href="https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim"')
  })

  it('renders bare domains as clickable https links for demo and messaging channels', () => {
    const html = render('Demo hesabı için www.askqualy.com adresini ziyaret edebilirsiniz.')

    expect(html).toContain('href="https://www.askqualy.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('>www.askqualy.com</a>')
  })

  it('does not turn document codes into fake domain links', () => {
    const html = render('Doküman numarası EÖB.KLV.0001 olarak geçiyor.')

    expect(html).toContain('EÖB.KLV.0001')
    expect(html).not.toContain('href="https://B.KLV"')
    expect(html).not.toContain('href="https://b.klv"')
  })

  it('renders trailing disclaimer quote as a separated blockquote', () => {
    const html = render(
      'Cevap burada.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.'
    )

    expect(html).toContain('Cevap burada.')
    expect(html).toContain('<blockquote')
    expect(html).toContain('&gt;')
    expect(html).toContain('Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
  })

  it('renders markdown unordered lists as semantic list items', () => {
    const html = render(
      'Personelin yıllık ücretli izin hakkı hizmet süresine göre değişir:\n- 1 yıldan 5 yıla kadar: 14 iş günü\n- 5 yıldan fazla, 15 yıldan az: 20 iş günü\n- 15 yıl ve üzeri: 26 iş günü'
    )

    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html.match(/<li/g)?.length).toBe(3)
    expect(html).toContain('1 yıldan 5 yıla kadar: 14 iş günü')
    expect(html).toContain('5 yıldan fazla, 15 yıldan az: 20 iş günü')
    expect(html).toContain('15 yıl ve üzeri: 26 iş günü')
  })

  it('normalizes assistant inline hyphen bullets into a readable list', () => {
    const html = render(
      'Personelin izin gün sayıları şu şekildedir: - Hizmet süresi 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü. - Hizmet süresi 5 yıldan fazla 15 yıldan az olanlara 20 iş günü. - Hizmet süresi 15 yıl (dahil) ve daha fazla olanlara 26 iş günü. 18 ve daha küçük yaştaki çalışanlar ile 50 ve daha yukarıdaki yaştaki çalışanlar için ise; - 1 yıldan 14 yıla kadar (14 yıl dahil) olanlara 20 iş günü. - 15 yıl (dahil) ve daha fazla olanlara 26 iş günü. Bu izinler, yıllık ücretli izinlerdir.'
    )

    expect(html).toContain('<ul')
    expect(html.match(/<li/g)?.length).toBe(5)
    expect(html).toContain('Personelin izin gün sayıları şu şekildedir:')
    expect(html).not.toContain('şu şekildedir: - Hizmet')
    expect(html).toContain('Hizmet süresi 1 yıldan 5 yıla kadar (5 yıl dahil) olanlara 14 iş günü.')
    expect(html).toContain('Hizmet süresi 5 yıldan fazla 15 yıldan az olanlara 20 iş günü.')
    expect(html).toContain('Hizmet süresi 15 yıl (dahil) ve daha fazla olanlara 26 iş günü.')
    expect(html).toContain('18 ve daha küçük yaştaki çalışanlar ile 50 ve daha yukarıdaki yaştaki çalışanlar için ise;')
    expect(html).toContain('1 yıldan 14 yıla kadar (14 yıl dahil) olanlara 20 iş günü.')
    expect(html).toContain('15 yıl (dahil) ve daha fazla olanlara 26 iş günü. Bu izinler, yıllık ücretli izinlerdir.')
  })

  it('renders markdown ordered lists as semantic list items', () => {
    const html = render(
      'Başvuru için:\n1. Formu doldurun\n2. Belgeleri hazırlayın\n3. Öğrenci işleriyle görüşün'
    )

    expect(html).toContain('<ol')
    expect(html.match(/<li/g)?.length).toBe(3)
    expect(html).toContain('Formu doldurun')
    expect(html).toContain('Belgeleri hazırlayın')
    expect(html).toContain('Öğrenci işleriyle görüşün')
  })

  it('can render a standalone source URL line with a short display label', () => {
    const url = 'https://yuksekihtisasuniversitesi.edu.tr/Uploads/demo.pdf'
    const html = render(`Cevap burada.\n${url}`, 'Kaynağı aç')

    expect(html).toContain(`href="${url}"`)
    expect(html).toContain('>Kaynağı aç</a>')
    expect(html).not.toContain(`>${url}</a>`)
  })

  it('can number multiple standalone source URL lines', () => {
    const firstUrl = 'https://example.edu.tr/kaynak-1.pdf'
    const secondUrl = 'https://example.edu.tr/kaynak-2.pdf'
    const html = render(
      `Cevap burada.\n${firstUrl}\n${secondUrl}`,
      (index, total) => total > 1 ? `Kaynak ${index + 1}` : 'Kaynağı aç'
    )

    expect(html).toContain(`href="${firstUrl}"`)
    expect(html).toContain(`href="${secondUrl}"`)
    expect(html).toContain('>Kaynak 1</a>')
    expect(html).toContain('>Kaynak 2</a>')
    expect(html).not.toContain(`>${firstUrl}</a>`)
    expect(html).not.toContain(`>${secondUrl}</a>`)
  })

  it('groups consecutive standalone source URL labels inline to save vertical space', () => {
    const firstUrl = 'https://example.edu.tr/kaynak-1.pdf'
    const secondUrl = 'https://example.edu.tr/kaynak-2.pdf'
    const html = render(
      `Cevap burada.\n${firstUrl}\n${secondUrl}\nSonraki satır.`,
      (index, total) => total > 1 ? `Kaynak ${index + 1}` : 'Kaynağı aç'
    )

    expect(html).toContain('class="inline-flex flex-wrap items-center gap-x-2')
    expect(html).toContain('>Kaynak 1</a><span')
    expect(html).toContain('> · </span><a')
    expect(html).toContain('>Kaynak 2</a></span><br/><span>Sonraki satır.</span>')
  })

  it('keeps inline raw URLs visible even when standalone URL labels are enabled', () => {
    const url = 'https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim'
    const html = render(`Takvime buradan bakabilirsiniz: ${url}`, 'Kaynağı aç')

    expect(html).toContain(`href="${url}"`)
    expect(html).toContain(`>${url}</a>`)
    expect(html).not.toContain('>Kaynağı aç</a>')
  })
})
