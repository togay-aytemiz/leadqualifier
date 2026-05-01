import { getTranslations } from 'next-intl/server'
import { DashboardRouteSkeleton } from '@/components/common/DashboardRouteSkeleton'

export default async function DashboardLoading() {
    const t = await getTranslations('dashboard.loading')

    return (
        <DashboardRouteSkeleton
            route="inbox"
            variant="branded"
            title={t('title')}
            description={t('description')}
        />
    )
}
