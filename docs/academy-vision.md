# Oxsig AI Academy

Oxsig Academy is an AI-native learning environment that turns a learner request into a structured, interactive course.

## Product loop

1. Learner asks to learn a topic, e.g. `Teach me Docker basics`.
2. Academy generates a structured course with objectives, concise teaching sections, visual explanations, and practice checkpoints.
3. When a checkpoint requires hands-on work, Academy connects the learner to the existing Cyber Lab and interactive terminal.
4. The learner runs the real command or task.
5. Oxsig captures real evidence and the AI explains success, failure, and the next step.
6. Progress, mastery, streaks, badges, and prerequisites can be layered on top of the same learning state.

## Architectural rule

AI adapts and generates the teaching content, but Oxsig owns the course contract: lesson structure, learning objectives, assessments, progress, allowed lab capabilities, and completion rules. This prevents the curriculum from becoming an unbounded chat transcript.

## MVP

The first slice should make this real:

- `/academy` page
- prompt: `Teach me Docker basics`
- AI-generated course title, overview, objectives, and lessons
- lesson sections that distinguish explanation, visual model, and practice
- practice steps carry an explicit command and lab requirement
- no automatic command execution from course generation
- reuse existing authenticated AI configuration and Cyber Lab safety boundaries

Later iterations add course persistence, lesson narration, inline question/answer, lab evidence evaluation, progress, assessments, streaks, badges, and adaptive roadmaps.
