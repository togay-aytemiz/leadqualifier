# Template Picker Loading UX Design

## Problem

When the operator opens the template picker for the first time, the modal briefly renders the predefined-template empty state before the async template fetch completes. That creates a false “you have no templates” impression for a few seconds.

## Options

1. Delay modal open until fetch completes

- Pros: no visible intermediate state
- Cons: blocks the interaction and makes the button feel laggy

2. Keep current modal timing but replace the false empty state with a loading placeholder

- Pros: preserves immediate modal feedback, communicates progress honestly, keeps real empty state intact
- Cons: requires one explicit initial-load state

3. Keep current UI and only swap empty copy to “loading”

- Pros: smallest change
- Cons: still looks visually empty and abrupt

## Decision

Use option 2.

The modal should open immediately, but the tab pane should distinguish:

- `loading`: initial fetch has not finished yet
- `empty`: fetch finished and there are truly no templates
- `ready`: templates are available

Loading uses a compact skeleton plus short explanatory copy. Empty state appears only after the first fetch resolves.
