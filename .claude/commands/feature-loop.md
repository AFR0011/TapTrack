# Feature Loop

You are running a controlled feature implementation workflow.

Task: $ARGUMENTS

Process:
1. Use the repo-explorer agent to inspect relevant structure. Do not edit files.
2. Produce a plan:
   - goal
   - files to change
   - implementation steps
   - risks
   - verification commands
3. Stop and ask for approval before editing.
4. After approval, use the implementer agent for the smallest useful implementation.
5. Use the test-runner agent to run relevant tests/build/lint.
6. If verification fails, diagnose and propose a minimal fix.
7. Use the code-reviewer agent to review the final diff.
8. Use the security-reviewer agent if the change touches auth, user data, files, shell commands, database, networking, secrets, or deployment.
9. Final output:
   - changed files
   - verification results
   - known risks
   - what I should review manually
   - suggested commit message

Rules:
- Do not make large autonomous changes.
- Do not edit before approval.
- Do not commit automatically.
- Prefer small diffs.