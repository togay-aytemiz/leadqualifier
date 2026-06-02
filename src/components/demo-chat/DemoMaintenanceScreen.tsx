type DemoMaintenanceScreenProps = {
    kicker: string
    title: string
    description: string
    logoAlt: string
    imageAlt: string
}

export function DemoMaintenanceScreen({
    kicker,
    title,
    description,
    logoAlt,
    imageAlt,
}: DemoMaintenanceScreenProps) {
    return (
        <main className="min-h-dvh bg-[#f7f8f4] text-slate-950">
            <section className="mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-8 px-6 py-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-12">
                <div className="order-2 flex items-center justify-center lg:order-1">
                    <div className="relative aspect-square w-full max-w-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:max-w-[420px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/maintenance.png"
                            alt={imageAlt}
                            className="h-full w-full object-contain p-8"
                        />
                    </div>
                </div>
                <div className="order-1 mx-auto max-w-xl text-center lg:order-2 lg:mx-0 lg:text-left">
                    <div className="mb-8 flex justify-center lg:justify-start">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo-black.svg"
                            alt={logoAlt}
                            className="h-9 w-auto"
                        />
                    </div>
                    <p className="text-xs font-semibold uppercase text-cyan-700">
                        {kicker}
                    </p>
                    <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                        {title}
                    </h1>
                    <p className="mt-5 text-base leading-8 text-slate-700 sm:text-lg">
                        {description}
                    </p>
                </div>
            </section>
        </main>
    )
}
