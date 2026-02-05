import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processKnowledgeDocument } from '@/lib/knowledge-base/actions'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const documentId = body?.id

        if (!documentId || typeof documentId !== 'string') {
            return NextResponse.json({ error: 'Missing document id' }, { status: 400 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: document, error: documentError } = await supabase
            .from('knowledge_documents')
            .select('id, organization_id')
            .eq('id', documentId)
            .maybeSingle()

        if (documentError || !document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        const { data: membership } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', document.organization_id)
            .eq('user_id', user.id)
            .maybeSingle()

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        await processKnowledgeDocument(documentId, supabase)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('Failed to process knowledge document', error)
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
}
