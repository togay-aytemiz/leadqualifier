import { Skeleton } from '@/design'

export default function KnowledgeLoading() {
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
