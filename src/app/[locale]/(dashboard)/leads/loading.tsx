import { Skeleton } from '@/design'

export default function LeadsLoading() {
    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            {/* Header skeleton */}
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <Skeleton className="h-6 w-24" />
            </div>

            {/* Table skeleton */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Header row */}
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex gap-6">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 flex-1" />
                    </div>

                    {/* Body rows */}
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="px-6 py-4 border-b border-gray-100 flex gap-6 items-center">
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

                {/* Pagination skeleton */}
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
