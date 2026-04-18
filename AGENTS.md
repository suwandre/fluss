## Task Workflow

Read `tasks/TASKS.md` and `tasks/progress.md` before starting any work.

### Builder role

1. Work on the NEXT incomplete task only. Do not skip ahead or batch tasks.
2. Before finishing: run `bun run build` (or typecheck) and fix all errors.
3. Check that nothing from previous tasks was accidentally removed or overridden — compare against `tasks/progress.md`.
4. Append a summary of what was done + any gotchas to `tasks/progress.md`.
5. Mark the task complete in `tasks/TASKS.md`.
6. `git add`, commit (compact message describing the change), push.

### Reviewer role

1. Read the latest commit diff and `tasks/progress.md`.
2. Check for: bugs, type errors, accidental deletions, inconsistencies vs `architecture/` docs.
3. If issues found: fix them, then commit with prefix `fix:`.
4. If clean: output `LGTM` and nothing else.

### Language Preferences

- English

### Response Style

1. **Main message first** - Lead with the core answer or conclusion
2. **Key details second** - Provide supporting information and context

## Development General Guidelines

- Avoid nested if statements.
- Follow the single responsibility principle.
- Follow the guard clause pattern.
- Keep things smart and simple.
- Refer to available skills when possible.
- Use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Tools

- Context7 MCP: use for any library/API docs without being asked
- `/compact`: run manually when context gets heavy mid-task
- ralph: for long multi-task loops — ask Claude to "plan with ralph" then run the loop externally

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
