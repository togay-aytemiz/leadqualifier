import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessageRichText } from './messageRichText'

function render(content: string, standaloneUrlLabel?: string) {
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

  it('renders trailing disclaimer quote as a separated blockquote', () => {
    const html = render(
      'Cevap burada.\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.'
    )

    expect(html).toContain('Cevap burada.')
    expect(html).toContain('<blockquote')
    expect(html).toContain('&gt;')
    expect(html).toContain('Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
  })

  it('can render a standalone source URL line with a short display label', () => {
    const url = 'https://yuksekihtisasuniversitesi.edu.tr/Uploads/demo.pdf'
    const html = render(`Cevap burada.\n${url}`, 'Daha fazla oku')

    expect(html).toContain(`href="${url}"`)
    expect(html).toContain('>Daha fazla oku</a>')
    expect(html).not.toContain(`>${url}</a>`)
  })

  it('keeps inline raw URLs visible even when standalone URL labels are enabled', () => {
    const url = 'https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim'
    const html = render(`Takvime buradan bakabilirsiniz: ${url}`, 'Daha fazla oku')

    expect(html).toContain(`href="${url}"`)
    expect(html).toContain(`>${url}</a>`)
    expect(html).not.toContain('>Daha fazla oku</a>')
  })
})
