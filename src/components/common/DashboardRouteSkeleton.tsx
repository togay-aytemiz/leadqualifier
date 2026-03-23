import { Skeleton } from '@/design'
import type { DashboardRouteSkeletonKey } from '@/design/dashboard-route-transition'

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

interface DashboardRouteSkeletonProps {
    route: DashboardRouteSkeletonKey
}

export function DashboardRouteSkeleton({ route }: DashboardRouteSkeletonProps) {
    if (route === 'inbox') {
        return <InboxRouteSkeleton />
    }

    return <LeadsRouteSkeleton />
}
