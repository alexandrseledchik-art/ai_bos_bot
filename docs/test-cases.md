# Telegram UAT Cases

1. `Хочу разобрать бизнес`
- Expected input type: `free_text_vague`
- Expected mode: `clarification_mode`
- Expected action: `clarify`
- The bot should narrow the goal instead of asking a generic “расскажите подробнее”.

2. `Хочу увеличить прибыль`
- Expected input type: `free_text_vague`
- Expected mode: `clarification_mode`
- Expected action: `clarify`
- The bot should surface likely directions and ask one strong follow-up.

3. `https://example.com`
- Expected input type: `url_only`
- Expected mode: `website_screening_mode`
- Expected action: `screen`
- The bot should do only external screening and end with a branching question.

4. `https://example.com продажи просели, не понимаю где проблема`
- Expected input type: `url_plus_problem`
- Expected mode: `website_screening_mode` or `diagnostic_mode` depending on signal
- Expected action: `screen` or `clarify`, but not confident internal diagnosis from URL alone.

5. `Что ты умеешь?`
- Expected action: `answer`
- The bot should answer capability-wise, not launch a diagnosis.

6. `Хочу продать бизнес`
- Expected input type: `free_text_problem`
- Expected mode: `clarification_mode` or `diagnostic_mode` depending on reasoning
- Expected action: `clarify`
- The next question should move toward the main sale barrier, not a generic survey.

7. `Хочу продать бизнес. Выручка нестабильна, всё держится на мне, покупатель задаёт неудобные вопросы`
- Expected input type: `free_text_problem`
- Expected mode: `diagnostic_mode`
- Expected action: `diagnose`
- The bot should produce a preliminary diagnostic result with constraint and first wave.

8. Voice message with poor transcript
- Expected behavior: honest uncertainty
- The bot should either use the transcript carefully or ask one clarifying question, not fake a confident reading.

9. Image without clear business linkage
- Expected behavior: mention visible context only
- The bot should not infer internal business state beyond what is visible.

10. Continue saved case from Mini App
- Open a saved result, use the `Продолжить кейс в Telegram` link, then send a new message in chat.
- Expected behavior: the bot should continue from prior context, not restart a blank intake.
