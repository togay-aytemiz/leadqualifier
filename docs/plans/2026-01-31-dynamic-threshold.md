# Dynamic Confidence Threshold Implementation Plan

## Goal
Allow users to dynamically adjust the similarity threshold in the Simulator UI to test how "strict" or "loose" the AI matching is in real-time.

## UI Changes
1.  **Add Slider Component**:
    *   Add a slider input (range 0.0 to 1.0) in the Simulator UI (likely in the sidebar or header).
    *   Display the current threshold value (e.g., "0.65").

## Server Changes
1.  **Update `simulateChat` Action**:
    *   Accept `threshold` as a third argument.
    *   Use this dynamic threshold instead of the hardcoded `0.5` to determine calling it a "match" vs "fallback".

## Detailed Plan
1.  **Modify `simulateChat`**:
    *   Update signature: `simulateChat(message, orgId, threshold)`.
    *   Use `threshold` in the logic.

2.  **Modify `ChatSimulator`**:
    *   Add state `threshold` (default 0.6).
    *   Add UI controls in the Debug Panel (sidebar) to adjust it.
    *   Pass `threshold` to `simulateChat` call.

## Verification
1.  **Manual Test**:
    *   Set threshold to 0.9. Type "Naber". Verify simulated response fails but debug shows match (e.g., 0.45).
    *   Lower threshold to 0.4. Type "Naber". Verify simulated response succeeds.
