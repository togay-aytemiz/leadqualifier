-- Trial signup abuse guardrails (Phase 8.5 - #665)
-- Adds signup velocity throttling + cooldown windows for repeated failed/abusive attempts.

CREATE TABLE IF NOT EXISTS public.trial_signup_rate_limit (
    key_type TEXT NOT NULL CHECK (key_type IN ('email', 'ip')),
    key_value TEXT NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    failed_attempt_count INT NOT NULL DEFAULT 0 CHECK (failed_attempt_count >= 0),
    cooldown_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (key_type, key_value)
);

CREATE INDEX IF NOT EXISTS trial_signup_rate_limit_cooldown_idx
    ON public.trial_signup_rate_limit (cooldown_until DESC NULLS LAST);

DROP TRIGGER IF EXISTS update_trial_signup_rate_limit_updated_at ON public.trial_signup_rate_limit;
CREATE TRIGGER update_trial_signup_rate_limit_updated_at
    BEFORE UPDATE ON public.trial_signup_rate_limit
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.trial_signup_rate_limit ENABLE ROW LEVEL SECURITY;

-- Keep table private; access is only via SECURITY DEFINER RPC helpers below.
REVOKE ALL ON TABLE public.trial_signup_rate_limit FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_signup_trial_rate_limit(
    input_email TEXT,
    input_ip TEXT DEFAULT NULL,
    input_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    now_ts TIMESTAMPTZ := now();
    active_window INTERVAL := interval '10 minutes';
    window_attempt_limit INT := 6;
    window_failed_limit INT := 4;
    normalized_email TEXT := lower(trim(COALESCE(input_email, '')));
    normalized_ip TEXT := NULLIF(trim(COALESCE(input_ip, '')), '');
    email_row public.trial_signup_rate_limit%ROWTYPE;
    ip_row public.trial_signup_rate_limit%ROWTYPE;
    blocked_until TIMESTAMPTZ := NULL;
    blocked_reason TEXT := NULL;
    candidate_until TIMESTAMPTZ;
BEGIN
    IF normalized_email = '' THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'cooldown_seconds', 0,
            'reason', NULL
        );
    END IF;

    SELECT *
    INTO email_row
    FROM public.trial_signup_rate_limit
    WHERE key_type = 'email'
      AND key_value = normalized_email;

    IF email_row.key_value IS NOT NULL THEN
        candidate_until := NULL;

        IF email_row.cooldown_until IS NOT NULL AND email_row.cooldown_until > now_ts THEN
            candidate_until := email_row.cooldown_until;
            blocked_reason := 'cooldown_active';
        ELSIF email_row.window_started_at > (now_ts - active_window)
            AND (
                email_row.attempt_count >= window_attempt_limit
                OR email_row.failed_attempt_count >= window_failed_limit
            ) THEN
            candidate_until := email_row.window_started_at + active_window;
            blocked_reason := 'window_limit_reached';
        END IF;

        IF candidate_until IS NOT NULL THEN
            blocked_until := candidate_until;
        END IF;
    END IF;

    IF normalized_ip IS NOT NULL THEN
        SELECT *
        INTO ip_row
        FROM public.trial_signup_rate_limit
        WHERE key_type = 'ip'
          AND key_value = normalized_ip;

        candidate_until := NULL;

        IF ip_row.key_value IS NOT NULL THEN
            IF ip_row.cooldown_until IS NOT NULL AND ip_row.cooldown_until > now_ts THEN
                candidate_until := ip_row.cooldown_until;
                IF blocked_reason IS NULL THEN
                    blocked_reason := 'cooldown_active';
                END IF;
            ELSIF ip_row.window_started_at > (now_ts - active_window)
                AND (
                    ip_row.attempt_count >= window_attempt_limit
                    OR ip_row.failed_attempt_count >= window_failed_limit
                ) THEN
                candidate_until := ip_row.window_started_at + active_window;
                IF blocked_reason IS NULL THEN
                    blocked_reason := 'window_limit_reached';
                END IF;
            END IF;
        END IF;

        IF candidate_until IS NOT NULL
            AND (blocked_until IS NULL OR candidate_until > blocked_until) THEN
            blocked_until := candidate_until;
        END IF;
    END IF;

    IF blocked_until IS NOT NULL AND blocked_until > now_ts THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'cooldown_seconds', CEIL(EXTRACT(EPOCH FROM (blocked_until - now_ts)))::INT,
            'reason', COALESCE(blocked_reason, 'cooldown_active')
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'cooldown_seconds', 0,
        'reason', NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_signup_trial_attempt(
    input_email TEXT,
    input_ip TEXT DEFAULT NULL,
    input_user_agent TEXT DEFAULT NULL,
    input_succeeded BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    now_ts TIMESTAMPTZ := now();
    active_window INTERVAL := interval '10 minutes';
    cooldown_window INTERVAL := interval '15 minutes';
    window_attempt_limit INT := 6;
    window_failed_limit INT := 4;
    normalized_email TEXT := lower(trim(COALESCE(input_email, '')));
    normalized_ip TEXT := NULLIF(trim(COALESCE(input_ip, '')), '');
    bucket RECORD;
    existing_row public.trial_signup_rate_limit%ROWTYPE;
    next_window_started_at TIMESTAMPTZ;
    next_attempt_count INT;
    next_failed_count INT;
    next_cooldown_until TIMESTAMPTZ;
BEGIN
    IF normalized_email = '' THEN
        RETURN jsonb_build_object(
            'recorded', false,
            'reason', 'missing_email'
        );
    END IF;

    FOR bucket IN
        SELECT key_type, key_value
        FROM (
            VALUES
                ('email'::TEXT, normalized_email),
                ('ip'::TEXT, normalized_ip)
        ) AS candidate_keys(key_type, key_value)
    LOOP
        IF bucket.key_value IS NULL OR bucket.key_value = '' THEN
            CONTINUE;
        END IF;

        SELECT *
        INTO existing_row
        FROM public.trial_signup_rate_limit
        WHERE key_type = bucket.key_type
          AND key_value = bucket.key_value
        FOR UPDATE;

        IF existing_row.key_value IS NULL THEN
            next_window_started_at := now_ts;
            next_attempt_count := 1;
            next_failed_count := CASE WHEN input_succeeded THEN 0 ELSE 1 END;
            next_cooldown_until := NULL;

            IF next_attempt_count >= window_attempt_limit OR next_failed_count >= window_failed_limit THEN
                next_cooldown_until := now_ts + cooldown_window;
            END IF;

            INSERT INTO public.trial_signup_rate_limit (
                key_type,
                key_value,
                window_started_at,
                attempt_count,
                failed_attempt_count,
                cooldown_until,
                last_attempt_at,
                last_success_at,
                last_user_agent
            )
            VALUES (
                bucket.key_type,
                bucket.key_value,
                next_window_started_at,
                next_attempt_count,
                next_failed_count,
                next_cooldown_until,
                now_ts,
                CASE WHEN input_succeeded THEN now_ts ELSE NULL END,
                NULLIF(trim(COALESCE(input_user_agent, '')), '')
            )
            ON CONFLICT (key_type, key_value) DO UPDATE
            SET
                window_started_at = EXCLUDED.window_started_at,
                attempt_count = EXCLUDED.attempt_count,
                failed_attempt_count = EXCLUDED.failed_attempt_count,
                cooldown_until = EXCLUDED.cooldown_until,
                last_attempt_at = EXCLUDED.last_attempt_at,
                last_success_at = EXCLUDED.last_success_at,
                last_user_agent = EXCLUDED.last_user_agent,
                updated_at = now();

            CONTINUE;
        END IF;

        IF existing_row.window_started_at <= (now_ts - active_window) THEN
            next_window_started_at := now_ts;
            next_attempt_count := 1;
            next_failed_count := CASE WHEN input_succeeded THEN 0 ELSE 1 END;
        ELSE
            next_window_started_at := existing_row.window_started_at;
            next_attempt_count := COALESCE(existing_row.attempt_count, 0) + 1;
            next_failed_count := COALESCE(existing_row.failed_attempt_count, 0)
                + CASE WHEN input_succeeded THEN 0 ELSE 1 END;
        END IF;

        next_cooldown_until := existing_row.cooldown_until;

        IF next_attempt_count >= window_attempt_limit OR next_failed_count >= window_failed_limit THEN
            next_cooldown_until := now_ts + cooldown_window;
        ELSIF next_cooldown_until IS NOT NULL AND next_cooldown_until <= now_ts THEN
            next_cooldown_until := NULL;
        END IF;

        UPDATE public.trial_signup_rate_limit
        SET
            window_started_at = next_window_started_at,
            attempt_count = next_attempt_count,
            failed_attempt_count = next_failed_count,
            cooldown_until = next_cooldown_until,
            last_attempt_at = now_ts,
            last_success_at = CASE
                WHEN input_succeeded THEN now_ts
                ELSE existing_row.last_success_at
            END,
            last_user_agent = NULLIF(trim(COALESCE(input_user_agent, '')), ''),
            updated_at = now()
        WHERE key_type = bucket.key_type
          AND key_value = bucket.key_value;
    END LOOP;

    RETURN jsonb_build_object(
        'recorded', true,
        'reason', NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_signup_trial_rate_limit(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_signup_trial_attempt(TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
