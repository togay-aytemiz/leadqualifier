-- Lower QA fixture minimum line constraint from 200 to 150.

ALTER TABLE public.qa_runs
    DROP CONSTRAINT IF EXISTS qa_runs_fixture_min_lines_check;

ALTER TABLE public.qa_runs
    DROP CONSTRAINT IF EXISTS qa_runs_fixture_min_lines_min_200_chk;

ALTER TABLE public.qa_runs
    DROP CONSTRAINT IF EXISTS qa_runs_fixture_min_lines_min_150_chk;

ALTER TABLE public.qa_runs
    ADD CONSTRAINT qa_runs_fixture_min_lines_min_150_chk CHECK (
        fixture_min_lines >= 150
    );
