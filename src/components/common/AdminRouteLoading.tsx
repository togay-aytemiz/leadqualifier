import Image from 'next/image'

export function AdminRouteLoading() {
    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3">
                    <Image
                        src="/icon-black.svg"
                        alt=""
                        width={22}
                        height={22}
                        aria-hidden
                        className="animate-[admin-loading-zoom_1.3s_ease-in-out_infinite] motion-reduce:animate-none"
                    />
                    <div className="h-5 w-36 animate-pulse rounded bg-gray-200" />
                </div>
                <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
            </div>

            <div className="p-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
                    <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
                    <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
                </div>
                <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
                    <div className="h-4 w-11/12 rounded bg-gray-100 animate-pulse" />
                    <div className="h-4 w-4/5 rounded bg-gray-100 animate-pulse" />
                    <div className="h-52 rounded-xl bg-gray-100 animate-pulse" />
                </div>
            </div>
        </div>
    )
}
