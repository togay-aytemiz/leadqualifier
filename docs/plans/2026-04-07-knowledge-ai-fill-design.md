# Knowledge AI Fill Design

**Date:** 2026-04-07

## Summary

Add an `AI ile doldur` / `Fill with AI` helper to the freeform Knowledge Base creation flow so non-technical operators can turn a short business brief into a clean first draft.

The feature should help the operator write faster, but it must not silently invent business facts or auto-save content. It produces a draft inside the existing editor, and the operator remains responsible for review before saving.

## Product Decision

Recommended v1 scope: support the freeform create page only.

The current request is specifically about `Yeni İçerik > Serbest Metin`, and the create flow already has a dedicated page at `Knowledge > Create`. Starting there keeps the behavior unambiguous:

- the operator is in authoring mode already
- there is no risk of unexpectedly overwriting an existing saved document
- the feature remains easy to explain as "draft oluşturma"

Editing an existing document is a different product problem. Once content exists, users may expect either `replace`, `append`, or `improve current text`. That should be a separate second-phase action such as `AI ile iyileştir`, not bundled into the first rollout.

## Recommended UX

Place a persistent helper banner directly above the title field inside the main editor column. Do not add a new header action.

Recommended banner shape:

- helper copy on the left: `Ne yazacağını bilemiyor musun? Qualy AI sana yardım eder.`
- low-emphasis text-style action on the right: `Qualy AI ile doldur`

The banner should remain visible even after the operator already generated one draft. This is intentionally a reusable helper, not a one-time onboarding hint.

When clicked, open a modal that asks for a short structured brief instead of one large prompt. Recommended fields:

1. `İşletmeniz ne yapıyor?`
2. `Süreci nasıl yürütüyorsunuz?`
3. `Botun dikkat etmesi gerekenler`
4. `Ek notlar / kaçınılacak ifadeler`

These fields should be optional individually, but generation should require at least one non-empty field overall.

The modal should also include one short helper line:

- `AI sadece verdiğiniz bilgilere göre taslak oluşturur. Kaydetmeden önce kontrol edin.`

## Generation Behavior

On confirm:

- keep the modal open in a loading state while generation runs
- disable inputs and buttons during generation
- on success, close the modal and fill the editor
- on each successful generation, replace the current content entirely with the new draft
- if the title field is blank, populate it with the generated title
- if the title field already has content, leave it untouched
- always write the generated body into the content textarea, replacing whatever was there before

Keeping the modal open during generation is better than closing it immediately. It avoids the "nothing happened" feeling on slower responses and gives the operator a clear wait state.

## Output Contract

The model should return structured JSON:

- `title: string`
- `content: string`

The generated body should be easy to edit in a plain textarea and easy for later chunking/extraction to parse. Prefer lightweight markdown-like structure:

- short heading line when useful
- short paragraphs
- bullet lists for rules and important notes

Avoid tables, decorative formatting, or long marketing copy.

## Writing Rules For The Model

The authoring model should follow a narrow contract:

- use only user-provided facts
- do not invent prices, guarantees, policies, or services
- do not add placeholder values like fake phone numbers or fake campaign claims
- write concise, operator-friendly Turkish or English based on current UI locale
- organize the content for future AI retrieval, not for brochure-style marketing

This feature is not a customer-facing assistant reply. It is a Knowledge Base drafting helper. The right output is clean, factual, and scannable.

## Alternative Approaches

### Option A: Guided modal -> one-shot draft

This is the recommended approach.

Pros:

- lowest UX ambiguity
- easy for SMB users to understand
- small implementation surface
- fits the current create page architecture

Cons:

- no iterative refinement inside the modal
- improvement of existing text waits for a second phase

### Option B: Inline side panel with regenerate

The editor would keep an always-visible AI brief panel and support repeated draft generation.

Pros:

- more flexible
- enables quick retries

Cons:

- heavier UI
- more visual clutter on an otherwise simple editor
- higher mobile complexity

### Option C: Chat-style copilot

The operator would talk to an assistant and ask it to generate or rewrite sections.

Pros:

- most powerful long term

Cons:

- clearly over-scoped for current needs
- much harder to test and explain
- invites prompt-like usage instead of productized authoring

## Technical Shape

Recommended implementation split:

- client UI state lives on the create page
- a dedicated reusable modal component collects the brief
- a server-side generation function calls OpenAI and returns JSON
- the create page applies the result to local `title` and `content` state only

Suggested file direction:

- `src/app/[locale]/(dashboard)/knowledge/create/page.tsx`
- `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeAiFillModal.tsx`
- `src/lib/knowledge-base/ai-draft.ts`
- `src/lib/knowledge-base/actions.ts`

`actions.ts` should remain the client-imported server-action surface. The actual prompt-building and parsing logic should live in a smaller helper module so tests stay focused.

## Error Handling

Three failure cases matter:

1. `OPENAI_API_KEY` missing
2. billing/usage is locked for the organization
3. model response is empty or malformed

The UI should surface a short operator-facing error and keep all current typed fields intact.

The feature must never clear an existing title or content field on error.

## Billing And Usage

This action is optional authoring assistance, so it should respect organization usage entitlement before the OpenAI call.

It should also record AI usage. The cleanest option is to add a dedicated usage source like `knowledge_ai_fill` in metadata, but it should roll up under the existing Knowledge/Billing `documentProcessing` breakdown instead of creating a brand-new visible bucket.

That keeps the billing UI stable and matches the user's expectation that this should behave like normal content-processing usage rather than a new standalone line item.

For v1, metadata-level separation plus existing document-processing rollup is enough.

## Copy And Localization

All new strings must be added in both `messages/tr.json` and `messages/en.json`.

Important copy principles:

- product language, not prompt-engineering language
- direct and confidence-building, not technical
- explicit review expectation before save

## Success Criteria

- Operators can create a usable Knowledge Base draft from a short brief
- The feature feels native to the existing create flow
- Existing save behavior stays unchanged
- The reusable banner stays available for repeated draft generation
- Re-running generation clearly replaces the content body with a new draft
- Title overwrite rules are predictable
- No hallucinated business facts are introduced by default system behavior
- TR and EN copy remain mirrored

## Recommended Phase Split

Phase 1:

- create page only
- persistent banner + one-shot modal
- generate title + content
- fill local form state only
- replace content body on each re-run
- only fill title when it is blank

Phase 2:

- edit-page support
- `AI ile iyileştir` or `AI ile yeniden yaz`
- explicit replace/append/improve choices

This split is the safest way to ship value quickly without creating confusing overwrite semantics.
