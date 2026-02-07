# Minimal Guardrail System Skills Design

> **Date:** 2026-02-07  
> **Status:** Approved (Brainstorming Outcome)  
> **Scope:** Day-1 default skills for every organization

## 1. Decision Summary

We will ship a **minimal, universal guardrail pack** that is enabled by default for every new organization.  
These are **system skills** focused on safe escalation and trust-sensitive moments, not generic FAQ handling.

General informational answers (pricing, services, hours, location, campaign details) will continue to be served by:

1. Organization Skills (optional, user-defined)
2. Knowledge Base retrieval (RAG)
3. Existing fallback behavior

We explicitly **do not** add low-confidence automatic handover at this stage.

## 2. Day-1 Default Guardrail Skills

Every organization gets these default enabled skills with localized (TR/EN) messaging and mandatory handover:

1. Human support request (`requires_human_handover = true`)  
   Example intent: "Beni bir insana bağla", "Müşteri temsilcisi ile görüşmek istiyorum"

2. Complaint / dissatisfaction (`requires_human_handover = true`)  
   Example intent: "Şikayetim var", "Memnun kalmadım"

3. Urgent / critical request (`requires_human_handover = true`)  
   Example intent: "Acil", "Hemen dönüş yapın"

4. Privacy / consent / deletion request (`requires_human_handover = true`)  
   Example intent: "Verilerimi silin", "Mesaj iznimi geri çekiyorum"

Each skill uses a distinct bot message template to match the scenario tone and expectation.

## 3. Routing and Escalation Behavior

Runtime behavior:

1. Message enters router (`Skill -> KB -> fallback`).
2. If a guardrail system skill matches, that skill response is returned.
3. The conversation is escalated according to existing skill handover policy (`switch_to_operator`).
4. If no guardrail skill matches, routing continues normally through KB/fallback.

Out of scope in this design:

1. Confidence-threshold-triggered handover
2. Clarification-attempt counters
3. "No safe KB answer -> handover" automation

## 4. Why This Scope

This keeps the MVP simple and reliable:

1. Uses existing KB flexibility for ambiguous/general requests.
2. Avoids premature escalation logic complexity.
3. Preserves explicit, user-intent-based operator takeover only.
4. Supports future expansion (e.g., "Talk to human" button) without reworking current flow.

## 5. Future Extension (Not in Current Scope)

Potential future options:

1. Optional low-confidence policy in AI Settings (off by default)
2. One-click "Connect to human" UI button in chat surfaces
3. Analytics dashboard for guardrail trigger distribution
