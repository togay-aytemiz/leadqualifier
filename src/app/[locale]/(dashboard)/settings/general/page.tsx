import { getLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

export default async function GeneralSettingsPage() {
    const locale = await getLocale()
    const target = locale === 'tr' ? '/settings/organization' : `/${locale}/settings/organization`

    redirect(target)
}
