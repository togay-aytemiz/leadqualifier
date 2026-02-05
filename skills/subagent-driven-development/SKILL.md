---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development

Use for executing implementation plans with independent tasks in the current session. Ideal for running tasks sequentially with fresh context per task.

Core principle: Use subagents to handle each task independently, then review and integrate their work between tasks.

## When to Use

    digraph when_to_use {
      rankdir=LR;
      node [shape=box, style=rounded];

      start [label="Do you have a detailed implementation plan with\nindependent tasks?"];
      issues [label="Are you facing 3+ independent issues\nthat can be investigated separately?"];
      yes [label="Use subagent-driven-development", shape=oval, style=filled, fillcolor=lightgreen];
      no [label="Use executing-plans\n(parallel session) or single-agent", shape=oval];

      start -> yes [label="Yes"];
      start -> issues [label="No"];
      issues -> yes [label="Yes"];
      issues -> no [label="No"];
    }

vs. Executing Plans (parallel session):
- subagent-driven-development: Same session, faster, good for 5-15 tasks
- executing-plans: Separate session, batch execution, good for 15+ tasks or large refactor

## The Process

    digraph process {
      rankdir=LR;
      node [shape=box, style=rounded];
      
      plan [label="Have a plan with clear tasks"];
      task [label="For each task:\n- Launch fresh subagent\n- Provide task-specific context\n- Subagent completes task"];
      review [label="Review & integrate subagent work"];
      repeat [label="Repeat for next task"];
      done [label="All tasks complete", shape=oval, style=filled, fillcolor=lightgreen];
      
      plan -> task -> review -> repeat;
      repeat -> task [label="Next task"];
      repeat -> done [label="No more tasks"];
    }

## Prompt Templates

- `implementer-prompt.md` - Used by task subagent
- `spec-reviewer-prompt.md` - Spec compliance review
- `code-quality-reviewer-prompt.md` - Code quality review

## Example Workflow

    You: I'm using Subagent-Driven Development to execute this plan.
    Task 1: Write tests for component X
    --- Fresh subagent handles Task 1 ---
    Review: Tests are good, but missing edge case Y
    Fix: Add edge case test
    Task 2: Implement component X
    --- Fresh subagent handles Task 2 ---
    Review: Implementation passes tests
    Task 3: Integrate and clean up
    --- Fresh subagent handles Task 3 ---
    Review: All green
    Done!

## Efficiency Gains

- 30-50% faster for 5-15 task plans
- Better task focus and fewer context leaks
- Easy to catch issues early with structured reviews

## Implementation Workflow

For each task, follow this exact sequence:

1. Assign task to fresh subagent
2. Subagent completes task
3. Run spec reviewer prompt
4. Run code quality reviewer prompt
5. Integrate results
6. Move to next task

## Advantages

- Fresh context per task
- No compounding confusion
- Easy review points
- Parallelizable in theory, sequential in practice

## Red Flags

Do NOT use if:
- Tasks are tightly coupled and require shared context
- You need real-time coordination across tasks
- Plan is unclear or still evolving

## Integration with Executing Plans

Use this skill when you already have a plan and want to execute it
in the current session with subagents.

Alternative workflow:
- Use executing-plans in a separate session if you want batch execution.
