# Phase 9 Load Test Thresholds

- Target endpoint: `/api/webhooks/whatsapp`
- Default local mode: in-process harness server

## 1. Baseline Throughput Check

- Command: `npm run test:load:messages`
- Tooling: `autocannon`
- Purpose: raw webhook HTTP throughput baseline
- Optional live mode: set `LOAD_BASE_URL`

## Default Parameters

- `LOAD_CONNECTIONS=20`
- `LOAD_DURATION_SECONDS=10`

## Pass Criteria

- Total requests > 0
- 2xx success ratio >= 99%
- Script exits with status code `0`

## 2. Concurrent-User Stress Scenario

- Command: `npm run test:load:users`
- Purpose: simulate distinct WhatsApp contacts sending multi-turn messages concurrently
- Default scenario: `8` users x `4` messages each
- Reported metrics: `success_ratio`, `non_2xx`, `timeouts`, `transport_errors`, `req_per_sec`, `latency_avg_ms`, `latency_p50_ms`, `latency_p95_ms`, `latency_p99_ms`, `latency_max_ms`

### Default Parameters

- `LOAD_VIRTUAL_USERS=8`
- `LOAD_MESSAGES_PER_USER=4`
- `LOAD_USER_STAGGER_MS=150`
- `LOAD_THINK_TIME_MS=250`
- `LOAD_TIMEOUT_MS=15000`
- `LOAD_MIN_SUCCESS_RATIO=0.99`
- `LOAD_MAX_P95_MS` is optional

### Live-App Parameters

- `LOAD_BASE_URL=http://127.0.0.1:3000` (or staging URL)
- `LOAD_APP_SECRET=<meta app secret or channel app_secret>` for valid `x-hub-signature-256`
- `LOAD_PHONE_NUMBER_ID=<active whatsapp phone_number_id>`
- Active WhatsApp channel row must exist for the same `phone_number_id`

### Suggested Local Run

```bash
npm run dev
LOAD_BASE_URL=http://127.0.0.1:3000 \
LOAD_APP_SECRET=your-app-secret \
LOAD_PHONE_NUMBER_ID=your-phone-number-id \
LOAD_VIRTUAL_USERS=10 \
LOAD_MESSAGES_PER_USER=5 \
LOAD_MAX_P95_MS=2500 \
npm run test:load:users
```

## Notes

- For staging/prod-like checks, set `LOAD_BASE_URL` to your deployed app URL.
- Keep payload structure aligned with Meta webhook text-message shape.
- Use the baseline command for raw endpoint pressure and the scenario command for realistic 8-10 concurrent-contact latency/error checks.
