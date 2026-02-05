# AI Settings UX Redesign

**Goal:** Make Organization Settings clearer by using a single AI toggle that controls both the Offering Profile and Required Fields flows, while simplifying how AI suggestions and manual edits are handled.

**Problem Summary:**
The current UI mixes manual input, AI suggestions, and required fields in one dense area. Users are confused about what is AI-driven vs manual, and where to edit content.

---

## Proposed UX Structure

### Global AI Control Band (Top of Organization Settings)
- **Checkbox:** “Yapay zeka ile otomatik öneri üret”
- **Helper text:** “Açıkken, Hizmet Profili ve Gerekli Bilgiler otomatik önerilerle beslenir. Kapalıyken yalnızca manuel giriş yapılır.”
- **Visual linking:** Subtle connector line from the checkbox to the two sections below.
- **Section header chip:** When enabled, each section shows a small “AI bağlı” indicator. Hidden when disabled.

---

## Section A: Hizmet Profili

### AI Disabled
- Show **only** the manual textarea.
- AI suggestions are hidden.

### AI Enabled
- Hide the manual textarea entirely.
- Show **AI Suggestions** (accordion, default open if pending > 0).
- Tabs: Pending / Approved / Rejected / Archived.

**Approved tab**:
- Add a **“Kendi metnimi eklemek istiyorum”** button.
- Clicking opens a **single textarea** for custom override.
- This textarea is **not for continuous line‑by‑line adding**. It is a one‑off custom entry to inject into the approved list.
- Save adds the entire textarea as one approved item; Cancel closes without changes.

---

## Section B: Gerekli Bilgiler

### AI Disabled
- Manual chip list + “+ Alan ekle” button.

### AI Enabled
- Same chip list, but AI-generated items get a subtle “AI” tag.
- Manual entries and AI entries coexist in the same list.

---

## Data Flow Expectations

- `aiSuggestionsEnabled` is the single source of truth controlling both sections.
- Offering profile summary is derived from **approved items** when AI is enabled.
- Manual custom textarea in Approved adds one item to approved list.
- Required fields are always stored in `required_intake_fields`; AI tagging is UI-only.

---

## UX State Rules

- Toggle OFF → show manual textarea, hide AI suggestions and AI tags.
- Toggle ON → hide textarea, show AI suggestions + required fields with AI tags.
- Pending suggestions automatically open accordion.

---

## Open Implementation Notes

- Consider how to serialize approved items back into `summary` (newline list).
- Ensure “AI bağlı” indicators are subtle and non-distracting.
- Manual override textarea should be clearly explained as “custom entry”.

---

## Test Plan

- Toggle OFF shows only textarea, hides AI sections.
- Toggle ON hides textarea, shows AI suggestions + required fields.
- Approved tab custom textarea adds one item and closes.
- AI tags display only when AI is enabled.
- Empty AI suggestions show helpful empty state.

