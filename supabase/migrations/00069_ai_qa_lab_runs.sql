-- Manual AI QA Lab run orchestration foundation (simulator-only).

CREATE TABLE IF NOT EXISTS public.qa_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    preset TEXT NOT NULL CHECK (preset IN ('quick', 'regression')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'budget_stopped')),
    result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'fail_critical', 'pass_with_findings', 'pass_clean')),
    source TEXT NOT NULL DEFAULT 'manual_admin' CHECK (source IN ('manual_admin')),
    surface TEXT NOT NULL DEFAULT 'simulator' CHECK (surface IN ('simulator')),
    token_budget INT NOT NULL CHECK (token_budget > 0),
    scenario_count INT NOT NULL CHECK (scenario_count > 0),
    max_turns_per_scenario INT NOT NULL CHECK (max_turns_per_scenario > 0),
    fixture_min_lines INT NOT NULL CHECK (fixture_min_lines >= 200),
    fixture_style_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
    generator_model TEXT NOT NULL,
    judge_model TEXT NOT NULL,
    run_config_hash TEXT NOT NULL CHECK (char_length(trim(run_config_hash)) > 0),
    run_config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qa_runs_finished_after_started_chk CHECK (
        finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at
    )
);

CREATE INDEX IF NOT EXISTS qa_runs_org_created_idx
    ON public.qa_runs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS qa_runs_org_status_idx
    ON public.qa_runs (organization_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_qa_runs_updated_at ON public.qa_runs;
CREATE TRIGGER update_qa_runs_updated_at
    BEFORE UPDATE ON public.qa_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.qa_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org qa runs" ON public.qa_runs;
CREATE POLICY "Users can view org qa runs"
    ON public.qa_runs FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "Org admins can insert qa runs" ON public.qa_runs;
CREATE POLICY "Org admins can insert qa runs"
    ON public.qa_runs FOR INSERT
    WITH CHECK (
        (
            is_org_admin(organization_id, auth.uid())
            OR is_system_admin_secure()
        )
        AND requested_by = auth.uid()
    );

DROP POLICY IF EXISTS "Org admins can update qa runs" ON public.qa_runs;
CREATE POLICY "Org admins can update qa runs"
    ON public.qa_runs FOR UPDATE
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    )
    WITH CHECK (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "Org admins can delete qa runs" ON public.qa_runs;
CREATE POLICY "Org admins can delete qa runs"
    ON public.qa_runs FOR DELETE
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );
