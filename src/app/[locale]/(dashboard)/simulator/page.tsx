import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatSimulator from '@/components/chat/ChatSimulator'
import { PageHeader } from '@/design'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

interface SimulatorPageProps {
    params: Promise<{ locale: string }>
}

export default async function SimulatorPage({ params }: SimulatorPageProps) {
    const { locale } = await params
    setRequestLocale(locale)

    const supabase = await createClient()
    const t = await getTranslations({ locale, namespace: 'simulator' })

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgContext = await resolveActiveOrganizationContext(supabase)

    if (!orgContext?.activeOrganization) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900">{t('noOrganization')}</h2>
                    <p className="text-gray-500 mt-2">{t('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    const aiSettings = await getOrgAiSettings(orgContext.activeOrganization.id, { supabase })

    return (
        <>
            {/* Main Content */}
            <div className="flex-1 bg-gray-50 flex flex-col min-w-0 overflow-hidden h-full">
                <PageHeader title={t('title')} />

                <div className="flex-1 min-h-0 p-6">
                    <div className="max-w-6xl mx-auto h-full flex flex-col">
                        <p className="text-gray-500 mb-4 shrink-0 px-1">{t('description')}</p>
                        <div className="flex-1 min-h-0">
                            <ChatSimulator
                                organizationId={orgContext.activeOrganization.id}
                                organizationName={orgContext.activeOrganization.name}
                                defaultMatchThreshold={aiSettings.match_threshold}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
