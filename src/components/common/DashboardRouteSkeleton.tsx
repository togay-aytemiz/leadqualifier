import Image from 'next/image'
import { PageSkeleton, Skeleton } from '@/design'
import { AdminRouteLoading } from '@/components/common/AdminRouteLoading'
import type { DashboardRouteSkeletonKey } from '@/design/dashboard-route-transition'

interface BrandedRouteLoadingProps {
    title: string
    description: string
}

function BrandedRouteLoading({ title, description }: BrandedRouteLoadingProps) {
    return (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white px-6">
            <div className="flex w-full max-w-sm animate-[qualy-loading-fade_420ms_ease-in-out_both] flex-col items-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <Image
                        src="/icon-black.svg"
                        alt=""
                        width={30}
                        height={30}
                        aria-hidden
                        priority
                        className="animate-[qualy-loading-mark_1.4s_ease-in-out_infinite] motion-reduce:animate-none"
                    />
                </div>
                <p className="text-sm font-semibold text-gray-950">{title}</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-gray-500">{description}</p>
                <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full w-2/5 rounded-full bg-gray-950 animate-[qualy-loading-progress_1.35s_ease-in-out_infinite] motion-reduce:animate-none" />
                </div>
            </div>
        </div>
    )
}

function InboxRouteSkeleton() {
    return (
        <div className="flex h-full bg-white border-t border-gray-200">
            <div className="w-[320px] border-r border-gray-200 flex flex-col h-full bg-gray-50/30">
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-gray-50/30">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-8 w-8 rounded" />
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-hidden">
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                        <div key={item} className="flex gap-3 p-3">
                            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="flex justify-between">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-12" />
                                </div>
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-gray-50/30">
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0 bg-white">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-6 w-32" />
                    </div>
                </div>
                <div className="flex-1 p-8 space-y-6">
                    <div className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-16 w-[300px] rounded-2xl rounded-bl-none" />
                    </div>
                    <div className="flex items-start gap-3 justify-end">
                        <Skeleton className="h-12 w-[250px] rounded-2xl rounded-br-none" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                    <div className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-24 w-[350px] rounded-2xl rounded-bl-none" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function LeadsRouteSkeleton() {
    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <Skeleton className="h-6 w-24" />
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex gap-6">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 flex-1" />
                    </div>

                    {[...Array(10)].map((_, index) => (
                        <div key={index} className="px-6 py-4 border-b border-gray-100 flex gap-6 items-center">
                            <Skeleton className="h-5 w-5 rounded-full" />
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                            <Skeleton className="h-4 w-8" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 flex-1" />
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between mt-4 px-2">
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-9 w-20" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function KnowledgeRouteSkeleton() {
    return (
        <div className="flex-1 flex flex-col min-w-0 bg-white">
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <Skeleton className="h-6 w-40" />
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-32" />
                </div>
            </div>
            <div className="p-6 space-y-6">
                <div className="flex justify-end">
                    <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[1, 2, 3, 4].map((item) => (
                            <Skeleton key={item} className="h-24 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5, 6].map((item) => (
                            <Skeleton key={item} className="h-10 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

interface DashboardRouteSkeletonProps {
    route: DashboardRouteSkeletonKey
    variant?: 'shell' | 'branded'
    title?: string
    description?: string
}

export function DashboardRouteSkeleton({
    route,
    variant = 'shell',
    title = 'Qualy',
    description = ''
}: DashboardRouteSkeletonProps) {
    if (variant === 'branded') {
        return <BrandedRouteLoading title={title} description={description} />
    }

    if (route === 'inbox') {
        return <InboxRouteSkeleton />
    }

    if (route === 'leads') {
        return <LeadsRouteSkeleton />
    }

    if (route === 'knowledge') {
        return <KnowledgeRouteSkeleton />
    }

    if (route === 'admin') {
        return <AdminRouteLoading />
    }

    return <PageSkeleton />
}
