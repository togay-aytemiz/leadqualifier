
import { Skeleton } from '@/design'

export default function InboxLoading() {
    return (
        <div className="flex h-full bg-white border-t border-gray-200">
            {/* Sidebar Skeleton */}
            <div className="w-[320px] border-r border-gray-200 flex flex-col h-full bg-gray-50/30">
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-gray-50/30">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-8 w-8 rounded" />
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-hidden">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex gap-3 p-3">
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

            {/* Chat Area Skeleton */}
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
