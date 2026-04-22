# Business Diagnosis Telegram Assistant

## Product core
- Telegram chat is the main interface for understanding, screening, clarifying, diagnosing, and following up.
- Mini App is only for storing, opening, and continuing saved analyses.
- Model thinks; code orchestrates.

## Supported inputs
- text
- link
- voice/audio via speech-to-text
- image with visible context

## Prompt architecture
1. Router prompt
2. Diagnostic prompt
3. Renderer prompt

## Router actions
- capability
- website_screening
- tool_navigation
- ask_question
- diagnostic_result

## Key rules
- Do not infer internal diagnosis from a website alone.
- Do not treat a reference link as proof the business belongs to the user.
- If data is weak, ask one strong next question instead of faking depth.
- If the goal is already clear, ask about the main current barrier to that goal.
- Do not repeat the same class of question if the user already showed they do not know the answer.
- Keep Telegram replies compact, useful, and non-template-like.

## Success criteria
- Stable action selection
- No fake certainty
- Strong follow-up questions
- Honest website screening
- Diagnosis in chat
- Mini App only as memory and saved artifacts
