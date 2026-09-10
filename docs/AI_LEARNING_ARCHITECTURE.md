# Oxsig AI Learning Architecture

## Core principle

Oxsig owns authorization, environment state, execution, evidence, learner state, and policy. The AI provider supplies reasoning and generation only.

A model must never become the source of truth for whether a machine exists, whether an action ran, or whether a learner is authorized to act. Those facts come from Oxsig and its infrastructure.

## Learning model

Oxsig should not choose between a static course and an AI chat. Each Operation provides a structured curriculum while the AI teaches that curriculum adaptively.

The intended loop is:

1. Learn the concept.
2. Visualize it with a compact diagram when useful.
3. See or request a demonstration.
4. Practice in the live lab.
5. Interpret real evidence.
6. Receive feedback or a hint.
7. Repeat with less assistance.
8. Assess transfer in a fresh environment.

The curriculum is deterministic; the teaching path is adaptive.

## Teaching modes

The Operation AI workspace exposes four learner-controlled modes:

- **Learn** — explain concepts first; use analogies, examples, and diagrams when useful. Demonstrate only when requested.
- **Guided** — coach through the objective and ask for learner reasoning before giving away important decisions when useful.
- **Challenge** — the learner drives; withhold commands and direct next-step answers until the learner attempts the step or asks for a hint.
- **Operator** — concise and action-oriented for experienced users, while preserving Oxsig approval and execution controls.

These modes change instructional behavior, not infrastructure authorization.

## Provider architecture

Application code calls the Oxsig provider registry instead of calling a vendor API directly.

```text
Operation / Academy
       |
       v
Oxsig AI Orchestrator
       |
       v
Provider Registry
   |       |       |
 OpenAI  Bedrock  self-hosted/future
```

`OXSIG_AI_PROVIDER` selects the provider. `openai` is the first adapter. New providers must implement the same structured-generation contract rather than introducing provider-specific logic into learning features.

## Voice architecture

Voice is an Oxsig learning capability, not a feature owned by a particular Operation. ElevenLabs remains the current voice implementation behind Oxsig voice hooks and APIs.

The Operation AI workspace supports:

- speech-to-text for learner questions;
- text-to-speech for AI explanations;
- ordinary text use when voice is unavailable or undesired.

A future voice provider should be replaceable without changing the Instructor UI.

## Execution boundary

The model can propose an action, but Oxsig decides whether it may execute.

```text
Learner request
      |
      v
AI proposes action
      |
      v
Oxsig policy + scope validation
      |
      v
Visible learner approval
      |
      v
Bound lab terminal execution
      |
      v
Recorded evidence
      |
      v
AI interpretation / learner reflection
```

Execution must remain bound to the exact lab identity for which the command was proposed. Changing the selected machine invalidates the pending action until it is regenerated or the original target is re-selected.

## Evidence rule

The AI never invents execution results. Terminal output, exit status, receipts, and evidence IDs come from Oxsig execution infrastructure. AI analysis operates on that recorded evidence.

## Concept-only learning

A running VM is not required for conceptual teaching. A learner should be able to open an Operation and ask questions such as "What is Docker?" or "Explain Kerberos with an analogy" before provisioning a machine.

When relationships are easier to understand visually, the Instructor may return a compact text diagram. The UI preserves line breaks so the same response can combine explanation, analogy, example, and visualization without requiring a static lesson page.

## Security policy separation

Provider safety behavior and Oxsig execution policy are separate concerns.

Oxsig policy should eventually be centralized and context-aware so that an authorized training range can permit the techniques appropriate to that exercise while still preventing actions outside the assigned environment. Provider adapters must not contain Oxsig authorization logic.

## Next provider work

The current provider registry contains the OpenAI adapter. Bedrock and self-hosted adapters should be added behind the same interface. Before enabling a provider for command-capable exercises, validate structured-output reliability, latency, cost, tool reasoning, and policy behavior in Oxsig's controlled lab scenarios.
