---
name: pull-request-quality-checks
description: 'Validate pull requests against team quality standards. Use when asked to check, validate, or review a PR for convention compliance: title format (Conventional Commits), description completeness (why/what/how validated), assignee presence, and single-concern focus.'
argument-hint: 'PR number or URL to validate'
---

# Pull Request Quality Checks

Use the `pull_request_read` tool to fetch pull request data. Do NOT use `get_pull_request` — that tool does not exist.

- To get PR details (title, body, assignees): `pull_request_read` with `method: "get"`, `owner`, `repo`, `pullNumber`
- To get changed files: `pull_request_read` with `method: "get_files"`, `owner`, `repo`, `pullNumber`

Then run the six checks below. Record a PASS or FAIL result for each.

**Scope**: title, description, assignee, and change focus only — not code quality, logic, or test coverage.

### Check A: Title Must Follow Conventional Commits Format

The pull request title MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

**Valid format**: `type(optional-scope): description`
**With breaking change**: `type(optional-scope)!: description`

**Allowed types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Rules**:
- The type must be lowercase
- The colon must be followed by exactly one space
- The description after the colon must not be empty
- The scope in parentheses is optional but must be non-empty if present

Valid examples:
- `feat(auth): add OAuth2 login support`
- `fix: resolve null pointer in user service`
- `docs(readme): update installation steps`
- `chore!: drop support for Node 12`
- `refactor(api)!: rename all endpoints to use kebab-case`

Invalid examples:
- `Updated stuff` : missing type
- `feat:add login` : missing space after colon
- `Feature: Add login` : type must be lowercase
- `WIP` : no type or description
- `fix()`: empty scope

---

### Check B: Description Must Explain Why the Change Is Needed

The Pull Request description MUST explain **why this change is needed**.

Look for: motivation, the problem being solved, business or user context, a linked issue or ticket, or any explanation of the purpose. A reference like "Closes #123" or "Fixes #456" satisfies this check since the linked issue provides the context.

**Fail if**: the description is empty, or there is no explanation of the reason for the change.

---

### Check C: Description Must Explain What Was Changed

The pull request description MUST briefly explain **what was changed**.

Look for: a summary of the modifications, affected components, files, or systems, key logic or behaviours introduced or removed.

**Fail if**: there is no mention of what the change actually does, even in brief.

---

### Check D: Description Must Explain How Changes Were Validated

The pull request description MUST explain **how the changes were validated**.

Look for: unit tests, integration tests, end-to-end tests, manual testing steps, CI results, staging environment verification, screenshots, or any method used to confirm correctness.

**Fail if**: there is no mention of how the changes were verified to work.

---

### Check E: Assignees List Must Not Be Empty

The pull request MUST have at least one person assigned to it.

**Fail if**: no assignees are set on the pull request.

---

### Check F: File Changes Should Focus on a Single Concern

The pull request should be focused on a single, coherent concern. It should not mix unrelated changes that make it harder to review, understand, or revert.

Use the list of changed files alongside the title and description to assess whether all changes clearly serve the same stated purpose.

**Pass if**: the changed files are consistent with a single topic or tightly related concerns — for example, a feature and its tests, or a bug fix alongside its documentation update.

**Fail if**: the pull request mixes clearly unrelated concerns without explanation — for example, combining a new feature, an unrelated refactor, and dependency upgrades with no stated connection between them.

Apply reasonable judgment. Only fail when the lack of focus is clear and significant, not for minor incidental changes.

---

## Reporting Findings

Return a result for each check (A–F) with a PASS or FAIL status.

- **All checks pass**: report an overall PASS with a per-check summary.
- **Any check fails**: report an overall FAIL with a per-check breakdown. For each failing check, include specific and actionable feedback — reference the exact issue and provide a concrete correction or example. Only report failing checks; omit checks that pass.

If the description is completely empty, fail Checks B, C, and D.