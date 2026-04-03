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

Apply the `pull-request-quality-checks` skill to validate this pull request.

- Pull request number: `${{ github.event.pull_request.number }}`
- Repository: `${{ github.repository }}`

## Fetching Pull Request Details

Use the `pull_request_read` tool (NOT `get_pull_request`, which does not exist) to fetch pull request data:

- **Get PR details** (title, body, assignees): call `pull_request_read` with `method: "get"`, `owner`, `repo`, and `pullNumber`.
- **Get changed files**: call `pull_request_read` with `method: "get_files"`, `owner`, `repo`, and `pullNumber`.

Do NOT call `get_pull_request` — that tool name is invalid and will fail.

## Reporting Results

After running all checks using the skill, **write the verdict to `/tmp/pr-check-status` as your first action** — before calling any safe output tool:

- All checks pass: `echo "PASS" > /tmp/pr-check-status`
- Any check fails: `echo "FAIL" > /tmp/pr-check-status`

### If ALL checks pass (A through F)

1. Call `upsert_pr_quality_comment` exactly once with:
   - `item_number`: the triggering Pull Request number
   - `create_if_missing`: `false`
   - `body`: the resolved comment below

   This updates an existing managed PR quality comment when the PR becomes compliant again, but it does not create a first-run success comment.

---

<!-- pr-quality-check-bot -->

All quality requirements are satisfied. Thanks for keeping the bar high! ✓

---

### If ANY check fails

1. Call the `upsert_pr_quality_comment` safe output tool exactly once, with:
   - `item_number` set to the triggering pull request number
   - `create_if_missing` set to `true`
   - `body` composed as follows:

   Start with the marker line `<!-- pr-quality-check-bot -->`, then write the comment body as natural prose. Only mention checks that actually failed — skip checks that passed. Reference the specific issue found in this pull request, not generic placeholder text.

   Use this structure:

   ```
   <!-- pr-quality-check-bot -->

   A few things need attention before this can merge:

   - <Concise, specific feedback for each failing check — one bullet per failure>

   Once you've made the updates, this check will re-run automatically.
   ```

---

## Important Guidelines

- Only call `upsert_pr_quality_comment` once per run, and do not use any other comment-writing tool for this workflow.
- Only mention failing requirements in the action-required comment. Do not mention checks that already pass.
