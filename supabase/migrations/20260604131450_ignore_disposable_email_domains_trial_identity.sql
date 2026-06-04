-- Do not treat shared/disposable inbox domains as business identity signals.
-- These domains are useful for testing or personal signup, but they do not prove
-- that two signups belong to the same real-world business.
CREATE OR REPLACE FUNCTION public.normalize_trial_identity_email_domain(input_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized_domain TEXT;
BEGIN
    normalized_domain := lower(trim(split_part(COALESCE(input_value, ''), '@', 2)));

    IF normalized_domain = '' OR position('.' IN normalized_domain) = 0 THEN
        RETURN NULL;
    END IF;

    IF normalized_domain = ANY (
        ARRAY[
            'gmail.com',
            'googlemail.com',
            'outlook.com',
            'hotmail.com',
            'live.com',
            'yahoo.com',
            'yahoo.com.tr',
            'icloud.com',
            'yandex.com',
            'proton.me',
            'protonmail.com',
            'mail.com',
            'msn.com',
            'yopmail.com',
            'yopmail.fr',
            'yopmail.net',
            'mailinator.com',
            'tempmail.com',
            'temp-mail.org',
            '10minutemail.com',
            'guerrillamail.com',
            'guerrillamail.net',
            'guerrillamail.org',
            'sharklasers.com',
            'grr.la'
        ]
    ) THEN
        RETURN NULL;
    END IF;

    RETURN normalized_domain;
END;
$$;
