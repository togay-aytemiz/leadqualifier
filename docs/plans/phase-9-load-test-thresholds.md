# Phase 9 Load Test Thresholds

- Target endpoint: `/api/webhooks/whatsapp`
- Tooling: `autocannon`
- Default local mode: in-process harness server
- Optional live mode: set `LOAD_BASE_URL`

## Default Parameters

- `LOAD_CONNECTIONS=20`
- `LOAD_DURATION_SECONDS=10`

## Pass Criteria

- Total requests > 0
- 2xx success ratio >= 99%
- Script exits with status code `0`

## Notes

- For staging/prod-like checks, set `LOAD_BASE_URL` to your deployed app URL.
- Keep payload structure aligned with Meta webhook text-message shape.
