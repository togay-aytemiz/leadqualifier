-- Resolve human-attention queue when an operator sends a message.

CREATE OR REPLACE FUNCTION public.send_operator_message(
    p_conversation_id UUID,
    p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_user_id UUID;
    v_message public.messages;
    v_conversation public.conversations;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT organization_id
    INTO v_org_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;

    IF NOT (
        v_org_id IN (SELECT get_user_organizations(v_user_id))
        OR is_system_admin_secure()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    INSERT INTO public.messages (
        conversation_id,
        organization_id,
        sender_type,
        content
    ) VALUES (
        p_conversation_id,
        v_org_id,
        'user',
        p_content
    )
    RETURNING * INTO v_message;

    UPDATE public.conversations
    SET last_message_at = v_message.created_at,
        active_agent = 'operator',
        assignee_id = v_user_id,
        human_attention_required = FALSE,
        human_attention_reason = NULL,
        human_attention_resolved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_conversation_id
    RETURNING * INTO v_conversation;

    RETURN jsonb_build_object(
        'message', to_jsonb(v_message),
        'conversation', to_jsonb(v_conversation)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_operator_message(UUID, TEXT) TO authenticated;
