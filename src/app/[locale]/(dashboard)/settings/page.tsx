import { getTranslations } from 'next-intl/server'

export default async function SettingsPage() {
    const tSidebar = await getTranslations('Sidebar')

    return (
        <div className="hidden lg:flex flex-1 items-center justify-center text-gray-500">
            <p className="text-sm">{tSidebar('settings')}</p>
        </div>
    )
}
