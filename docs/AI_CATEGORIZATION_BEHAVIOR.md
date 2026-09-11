# AI Categorization Behavior

Ravel treats AI categorization as optional assistance, never as a prerequisite for recording money.

## V1 contract

- Transaction save is never blocked on an AI response.
- While the user is typing, Ravel may request a category suggestion after a short debounce.
- If a strong existing-category suggestion arrives before save, that category is used immediately.
- If the user saves first, Ravel saves using the local/default category and may make one post-save AI categorization attempt when auto-categorization is enabled.
- A late AI result may update only the transaction that was just saved, and only when that transaction has not changed since creation and its provisional category is still unchanged.
- Manual category choices always win. Late AI must not overwrite them.
- New-category recommendations remain suggestions requiring user action; they are not created automatically after save.
- Ravel does not periodically recategorize historical transactions.

## Hosted inference

The hosted Groq path uses `openai/gpt-oss-20b` by default with low reasoning effort, hidden reasoning, strict JSON-schema output, and a short server timeout. The intent is opportunistic low-latency assistance rather than making model latency part of the transaction-entry critical path.

Production telemetry records only request duration, finish reason, and whether an existing/new category candidate was produced. Transaction descriptions, amounts, and model output are not logged by this telemetry.
