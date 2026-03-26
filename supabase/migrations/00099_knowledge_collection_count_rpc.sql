create or replace function public.count_knowledge_documents_by_collection(target_organization_id uuid default null)
returns table (
    collection_id uuid,
    document_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        knowledge_documents.collection_id,
        count(*)::bigint as document_count
    from public.knowledge_documents
    where knowledge_documents.collection_id is not null
      and (
        target_organization_id is null
        or knowledge_documents.organization_id = target_organization_id
      )
    group by knowledge_documents.collection_id
$$;

grant execute on function public.count_knowledge_documents_by_collection(uuid) to authenticated;
grant execute on function public.count_knowledge_documents_by_collection(uuid) to service_role;
