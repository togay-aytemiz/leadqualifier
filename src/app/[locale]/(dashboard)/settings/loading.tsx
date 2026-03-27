import { Skeleton } from '@/design'

function SettingsDetailLoadingSkeleton() {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="h-14 shrink-0 border-b border-gray-200 bg-white px-6">
                <div className="flex h-full items-center justify-between gap-4">
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8">
                <div className="mx-auto max-w-5xl space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Skeleton className="h-28 w-full rounded-2xl" />
                        <Skeleton className="h-28 w-full rounded-2xl" />
                    </div>
                    <Skeleton className="h-48 w-full rounded-2xl" />
                    <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
            </div>
        </div>
    )
}

export default function SettingsLoading() {
    return <SettingsDetailLoadingSkeleton />
}
