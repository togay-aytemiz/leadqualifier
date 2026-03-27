import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import {
  InboxListFilterMenu,
  InboxListFilterMenuContent,
} from '@/components/inbox/InboxListFilterMenu'

describe('InboxListFilterMenu', () => {
  it('renders a title-row filter trigger button', () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenu
          unreadFilter="all"
          leadTemperatureFilter="all"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )

    expect(markup).toContain('aria-label="Filter conversations"')
    expect(markup).toContain('type="button"')
  })

  it('renders the filter trigger as a plain icon control instead of a bordered pill', () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenu
          unreadFilter="all"
          leadTemperatureFilter="all"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )

    expect(markup).toContain('h-8 w-8')
    expect(markup).toContain('rounded-md')
    expect(markup).not.toContain('rounded-full border bg-white')
    expect(markup).not.toContain('shadow-sm')
  })

  it('renders localized unread and customer-score options inside the menu content', () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="unread"
          leadTemperatureFilter="warm"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )

    expect(markup).toContain('Unread')
    expect(markup).toContain('All')
    expect(markup).toContain('Customer score')
    expect(markup).toContain('Hot')
    expect(markup).toContain('Warm')
    expect(markup).toContain('Cold')
    expect(markup).toContain('Reset')
  })

  it('shows reset as a text-style action and disables it when filters are already clear', () => {
    const clearMarkup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="all"
          leadTemperatureFilter="all"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )
    const activeMarkup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="unread"
          leadTemperatureFilter="warm"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )

    expect(clearMarkup).toContain('Reset')
    expect(clearMarkup).toContain('bg-transparent')
    expect(clearMarkup).toContain('disabled=""')
    expect(activeMarkup).not.toContain('disabled=""')
  })

  it('uses colored idle chips and inverted selected chips for customer-score options', () => {
    const hotMarkup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="all"
          leadTemperatureFilter="hot"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )
    const warmMarkup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="all"
          leadTemperatureFilter="warm"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )
    const coldMarkup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="all"
          leadTemperatureFilter="cold"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )
    const idleMarkup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="all"
          leadTemperatureFilter="all"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )

    expect(idleMarkup).toContain('border-red-200 bg-white text-red-700')
    expect(idleMarkup).toContain('border-amber-200 bg-white text-amber-700')
    expect(idleMarkup).toContain('border-slate-300 bg-white text-slate-600')
    expect(hotMarkup).toContain('border-2 border-red-600 bg-red-600 text-white')
    expect(warmMarkup).toContain('border-2 border-amber-500 bg-amber-500 text-white')
    expect(coldMarkup).toContain('border-2 border-slate-600 bg-slate-600 text-white')
  })

  it('keeps the menu content mobile-safe instead of requiring a second fixed filter row', () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
        <InboxListFilterMenuContent
          unreadFilter="all"
          leadTemperatureFilter="all"
          onUnreadFilterChange={() => {}}
          onLeadTemperatureFilterChange={() => {}}
          onReset={() => {}}
        />
      </NextIntlClientProvider>
    )

    expect(markup).toContain('max-w-[calc(100vw-2rem)]')
  })
})
