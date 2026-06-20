# One-Step GPT-5.5 File Search RAG Design

## Goal

Replace the Public Demo fallback chain `vectorStores.search -> GPT-4.1-mini answer -> GPT-4.1-mini evidence verifier` with one GPT-5.5 Responses API call using the hosted File Search tool.

## Boundaries

- Keep `exact match -> query normalizer -> unique semantic Skill candidates -> one GPT-5.5 Skill selector` unchanged.
- Run the new path only after Skill routing chooses RAG.
- Do not add a second selector, a question-specific runtime rule, or a new global similarity threshold.
- Preserve organization scoping, tenant style, response language, AI dictionary context, prepared standalone query, citations, usage accounting, and diagnostics.

## Request and response

The Responses request forces the hosted `file_search` tool against the channel vector store, includes `file_search_call.results`, and asks GPT-5.5 for a strict Structured Output:

```json
{
  "status": "answer | no_info | refuse",
  "answer": "customer-facing text or empty string"
}
```

The model must answer only the exact requested subject and facet. A course mention must not prove that a program exists; an office/process mention must not prove a price or service; related programs must not supply the requested program's facts. When some directly supported information is useful, the model answers that supported portion and states only the unsupported remainder as unknown. `no_info` is reserved for cases with no directly useful support.

## Failure behavior

- Invalid or empty API output is treated as a pipeline failure and uses the existing temporary-unavailable response.
- `no_info` maps to the existing localized no-information response.
- `refuse` keeps the model's concise safety response.
- File Search results are retained in metadata for audit but are not exposed as raw source text to customers.

## Acceptance

Before another random 100, compare the current pipeline and the one-step pipeline on a balanced focused set: supported questions that previously became false no-info and unsupported/adjacent-evidence questions that previously received confident answers. The release gate requires improvement on both groups; reducing false positives by increasing false no-info is not a pass.

