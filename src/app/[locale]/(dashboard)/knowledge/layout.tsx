import { KnowledgeSidebar } from './components/KnowledgeSidebar'

export default function KnowledgeLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-full w-full overflow-hidden bg-white">
            <KnowledgeSidebar />
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {children}
            </main>
        </div>
    )
}
