import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { Link } from '@/i18n/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getPlatformBillingDefaults, updatePlatformBillingDefaults } from '@/lib/admin/billing-settings'

interface AdminBillingPageProps {
    searchParams: Promise<{
        billing_defaults_status?: string
        billing_defaults_error?: string
    }>
}

export default async function AdminBillingPage({ searchParams }: AdminBillingPageProps) {
    const search = await searchParams
    const locale = await getLocale()
    const t = await getTranslations('admin')
    const tCommon = await getTranslations('common')
    const { supabase } = await requireSystemAdmin(locale)
    const billingDefaults = await getPlatformBillingDefaults({ supabase })

    const billingDefaultsStatus = search.billing_defaults_status === 'success'
        ? 'success'
        : search.billing_defaults_status === 'error'
            ? 'error'
            : null
    const billingDefaultsError = search.billing_defaults_error ?? null

    const getBillingDefaultsStatusTitle = () => {
        if (billingDefaultsStatus === 'success') return t('billingDefaults.successTitle')
        if (billingDefaultsStatus === 'error') return t('billingDefaults.errorTitle')
        return ''
    }

    const getBillingDefaultsStatusDescription = () => {
        if (billingDefaultsStatus === 'success') {
            return t('billingDefaults.successDescription')
        }

        if (billingDefaultsStatus !== 'error') return ''

        switch (billingDefaultsError) {
        case 'unauthorized':
            return t('billingDefaults.errors.unauthorized')
        case 'forbidden':
            return t('billingDefaults.errors.forbidden')
        case 'invalid_input':
            return t('billingDefaults.errors.invalidInput')
        case 'not_available':
            return t('billingDefaults.errors.notAvailable')
        default:
            return t('billingDefaults.errors.requestFailed')
        }
    }

    const handleUpdateBillingDefaults = async (formData: FormData) => {
        'use server'

        const defaultTrialDaysRaw = String(formData.get('defaultTrialDays') ?? '').trim()
        const defaultTrialCreditsRaw = String(formData.get('defaultTrialCredits') ?? '').trim()
        const defaultPackagePriceRaw = String(formData.get('defaultPackagePriceTry') ?? '').trim()
        const defaultPackageCreditsRaw = String(formData.get('defaultPackageCredits') ?? '').trim()
        const reason = String(formData.get('billingDefaultsReason') ?? '')

        const result = await updatePlatformBillingDefaults({
            defaultTrialDays: Number.parseInt(defaultTrialDaysRaw, 10),
            defaultTrialCredits: Number.parseFloat(defaultTrialCreditsRaw),
            defaultPackagePriceTry: Number.parseFloat(defaultPackagePriceRaw),
            defaultPackageCredits: Number.parseFloat(defaultPackageCreditsRaw),
            reason
        })

        revalidatePath(`/${locale}/admin`)
        revalidatePath(`/${locale}/admin/billing`)

        const query = new URLSearchParams()
        query.set('billing_defaults_status', result.ok ? 'success' : 'error')
        if (!result.ok && result.error) {
            query.set('billing_defaults_error', result.error)
        }
        redirect(`/${locale}/admin/billing?${query.toString()}`)
    }

    return (
        <div data-testid="admin-billing-page" className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={t('billingPage.title')}
                breadcrumb={(
                    <Link href="/admin" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                )}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full space-y-6">
                    <p className="text-gray-500">{t('billingPage.description')}</p>
                    <p data-testid="admin-readonly-banner" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {t('billingControlsBanner')}
                    </p>

                    {billingDefaultsStatus && (
                        <p
                            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                billingDefaultsStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : 'border-rose-200 bg-rose-50 text-rose-900'
                            }`}
                        >
                            {getBillingDefaultsStatusTitle()}
                            {' — '}
                            {getBillingDefaultsStatusDescription()}
                        </p>
                    )}

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 space-y-1">
                            <h2 className="text-base font-semibold text-gray-900">{t('billingDefaults.title')}</h2>
                            <p className="text-sm text-gray-500">{t('billingDefaults.description')}</p>
                            <p className="text-xs text-gray-500">{t('billingDefaults.scopeNote')}</p>
                        </div>

                        <form action={handleUpdateBillingDefaults} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.trialDaysLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultTrialDays"
                                        min="1"
                                        step="1"
                                        defaultValue={String(billingDefaults.defaultTrialDays)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.trialCreditsLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultTrialCredits"
                                        min="0"
                                        step="0.1"
                                        defaultValue={String(billingDefaults.defaultTrialCredits)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.packagePriceLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultPackagePriceTry"
                                        min="0"
                                        step="0.01"
                                        defaultValue={String(billingDefaults.defaultPackagePriceTry)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600">
                                        {t('billingDefaults.packageCreditsLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        name="defaultPackageCredits"
                                        min="0"
                                        step="0.1"
                                        defaultValue={String(billingDefaults.defaultPackageCredits)}
                                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600">
                                    {t('billingDefaults.reasonLabel')}
                                </label>
                                <textarea
                                    name="billingDefaultsReason"
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={t('billingDefaults.reasonPlaceholder')}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437]"
                            >
                                {t('billingDefaults.submit')}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
