---
name: Pull Request Quality Check
description: Validates Pull Request title, description completeness (why/what/how), assignee presence, and scope focus. Blocks merge if requirements are not met.

on:
  pull_request:
    types: [opened, edited, synchronize, reopened, labeled, unlabeled, assigned, unassigned]
  skip-bots: [dependabot, renovate, github-actions]

permissions:
  contents: read
  pull-requests: read
  issues: read

engine:
  id: copilot
  model: gpt-4.1

tools:
  github:
    toolsets: [default]

safe-outputs:
  jobs:
    upsert-pr-quality-comment:
      description: Create or update the singleton PR quality comment for the current pull request.
      runs-on: ubuntu-latest
      output: Upserted PR quality comment.
      permissions:
        contents: read
        issues: write
        pull-requests: write
      inputs:
        body:
          description: The full Pull Request quality comment body. The managed marker will be normalized automatically.
          required: true
          type: string
        item_number:
          description: The pull request number to comment on. Defaults to the triggering Pull Request when omitted.
          required: false
          type: string
        create_if_missing:
          description: Whether to create a managed Pull Request quality comment when none already exists.
          required: false
          type: boolean
      steps:
        - name: Checkout repository
          uses: actions/checkout@v6
        - name: Upsert managed Pull Request quality comment
          uses: ./.github/actions/upsert-pr-quality-comment
          with:
            github-token: ${{ secrets.GH_AW_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
            marker: "<!-- pr-quality-check-bot -->"

post-steps:
  - name: Fail job if Pull Request quality check did not pass
    if: always()
    run: |
      if [ -f /tmp/pr-check-status ]; then
        status=$(cat /tmp/pr-check-status)
        if [ "$status" = "FAIL" ]; then
          echo "PR quality check failed. See the PR comment for details."
          exit 1
        fi
        echo "PR quality check passed."
      else
        echo "::warning::No PR quality check status found. The agent may not have completed its task. Treating as inconclusive."
        echo "No PR quality check status found — treating as inconclusive."
      fi
---

# Pull Request Quality Checks

Validate pull request #`${{ github.event.pull_request.number }}` in `${{ github.repository }}`.

## Step 1 — Fetch Pull Request Data

Call the **`pull_request_read`** tool twice. This is the ONLY tool that can read pull request data.

1. Get details (title, body, assignees):

   ```
   pull_request_read  method: "get"  owner: "<owner>"  repo: "<repo>"  pullNumber: <number>
   ```

2. Get changed files:

   ```
   pull_request_read  method: "get_files"  owner: "<owner>"  repo: "<repo>"  pullNumber: <number>
   ```

Replace `<owner>`, `<repo>`, and `<number>` with the values from the repository and pull request context above.

**Important:** The tool name is exactly `pull_request_read`. No other tool name works. Do NOT call `get_pull_request` — it does not exist and will fail.

## Step 2 — Run Quality Checks

Using the data from Step 1, evaluate each check below. Record PASS or FAIL for each.

### Check A — Title Follows Conventional Commits

The title MUST match: `type(optional-scope): description` or `type(optional-scope)!: description`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Rules:
- Type must be lowercase
- Colon must be followed by exactly one space
- Description after the colon must not be empty
- Scope in parentheses is optional but must be non-empty if present

### Check B — Description Explains Why

The description MUST explain why this change is needed: motivation, problem being solved, business context, or a linked issue. A reference like "Closes #123" satisfies this check. Fail if the description is empty or has no explanation of purpose.

### Check C — Description Explains What Changed

The description MUST summarize what was changed: affected components, files, key logic introduced or removed. Fail if there is no mention of what the change does.

### Check D — Description Explains How Changes Were Validated

The description MUST explain how the changes were validated: tests, manual steps, CI results, screenshots, or any verification method. Fail if there is no mention of validation.

### Check E — Assignee Present

The pull request MUST have at least one assignee. Fail if no assignees are set.

### Check F — Single Concern Focus

The pull request should focus on a single coherent concern. Use the changed files alongside the title and description to assess whether all changes serve the same purpose. Only fail when the lack of focus is clear and significant.

## Step 3 — Write Verdict

Write the verdict to `/tmp/pr-check-status` BEFORE calling any safe output tool:

- All checks pass: `echo "PASS" > /tmp/pr-check-status`
- Any check fails: `echo "FAIL" > /tmp/pr-check-status`

## Step 4 — Post Results Comment

Call `upsert_pr_quality_comment` exactly once.

### If ALL checks passed

Call with:
- `item_number`: `${{ github.event.pull_request.number }}`
- `create_if_missing`: `false`
- `body`:

```
<!-- pr-quality-check-bot -->

All quality requirements are satisfied. Thanks for keeping the bar high! ✓
```

### If ANY check failed

Call with:
- `item_number`: `${{ github.event.pull_request.number }}`
- `create_if_missing`: `true`
- `body`: Start with `<!-- pr-quality-check-bot -->`, then list only the failing checks with specific, actionable feedback. Do not mention passing checks.

```
<!-- pr-quality-check-bot -->

A few things need attention before this can merge:

- <Concise, specific feedback for each failing check — one bullet per failure>

Once you've made the updates, this check will re-run automatically.
```

## Rules

- Only call `upsert_pr_quality_comment` once per run.
- Only mention failing checks in the comment. Skip passing checks.
- Do not use any other comment-writing tool.
