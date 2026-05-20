import { Fragment, type ReactNode } from 'react'

type MessageRichTextProps = {
  content: string
}

const TOKEN_PATTERN =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+90[\d\s().-]{8,}\d|0\d[\d\s().-]{8,}\d)/gi
const BOLD_PATTERN = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/

function splitTrailingUrlPunctuation(value: string) {
  const trailing = value.match(TRAILING_URL_PUNCTUATION)?.[0] ?? ''
  if (!trailing) return { link: value, trailing: '' }
  return {
    link: value.slice(0, -trailing.length),
    trailing,
  }
}

function parseBoldText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  BOLD_PATTERN.lastIndex = 0

  while ((match = BOLD_PATTERN.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }

    const value = match[2] ?? match[3] ?? ''
    nodes.push(<strong key={`${keyPrefix}-bold-${match.index}`}>{value}</strong>)
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function renderLink(label: string, href: string, key: string) {
  const isExternal = href.startsWith('http://') || href.startsWith('https://')
  return (
    <a
      key={key}
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="font-medium text-current underline decoration-current/50 underline-offset-2 break-all hover:decoration-current"
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </a>
  )
}

function parseInlineText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  TOKEN_PATTERN.lastIndex = 0

  while ((match = TOKEN_PATTERN.exec(text))) {
    if (match.index > cursor) {
      nodes.push(...parseBoldText(text.slice(cursor, match.index), `${keyPrefix}-text-${cursor}`))
    }

    const markdownLabel = match[1]
    const markdownHref = match[2]
    const rawUrl = match[3]
    const email = match[4]
    const phone = match[5]

    if (markdownLabel && markdownHref) {
      nodes.push(renderLink(markdownLabel, markdownHref, `${keyPrefix}-md-link-${match.index}`))
    } else if (rawUrl) {
      const { link, trailing } = splitTrailingUrlPunctuation(rawUrl)
      nodes.push(renderLink(link, link, `${keyPrefix}-url-${match.index}`))
      if (trailing) nodes.push(trailing)
    } else if (email) {
      nodes.push(renderLink(email, `mailto:${email}`, `${keyPrefix}-email-${match.index}`))
    } else if (phone) {
      const hrefPhone = phone.replace(/[^\d+]/g, '')
      nodes.push(renderLink(phone, `tel:${hrefPhone}`, `${keyPrefix}-phone-${match.index}`))
    }

    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    nodes.push(...parseBoldText(text.slice(cursor), `${keyPrefix}-text-${cursor}`))
  }

  return nodes
}

function renderLine(line: string, index: number) {
  const quoteMatch = line.match(/^\s*>\s?(.*)$/)
  if (quoteMatch) {
    return (
      <blockquote
        key={`quote-${index}`}
        className="mt-3 border-l-2 border-current/30 pl-3 text-left opacity-90"
      >
        <span aria-hidden="true">&gt; </span>
        {parseInlineText(quoteMatch[1] ?? '', `quote-${index}`)}
      </blockquote>
    )
  }

  return <span key={`line-${index}`}>{parseInlineText(line, `line-${index}`)}</span>
}

export function MessageRichText({ content }: MessageRichTextProps) {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  return (
    <>
      {lines.map((line, index) => {
        const renderedLine = renderLine(line, index)
        const shouldAddBreak = index < lines.length - 1 && !/^\s*>\s?/.test(lines[index + 1] ?? '')
        return (
          <Fragment key={`message-line-wrapper-${index}`}>
            {renderedLine}
            {shouldAddBreak ? <br /> : null}
          </Fragment>
        )
      })}
    </>
  )
}
