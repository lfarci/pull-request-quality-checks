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
  model: gpt-5-mini

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
        echo "No PR quality check status found : treating as inconclusive."
      fi
---

# Pull Request Quality Checks

Apply the `pull-request-quality-checks` skill to validate this pull request.

- Pull request number: `${{ github.event.pull_request.number }}`
- Repository: `${{ github.repository }}`

## Reporting Results

After running all checks using the skill:

### If ALL checks pass (A through F)

1. Write `PASS` to `/tmp/pr-check-status`:
   ```bash
   echo "PASS" > /tmp/pr-check-status
   ```
2. Call `upsert_pr_quality_comment` exactly once with:
   - `item_number`: the triggering Pull Request number
   - `create_if_missing`: `false`
   - `body`: the resolved comment below

   This updates an existing managed PR quality comment when the PR becomes compliant again, but it does not create a first-run success comment.

---

<!-- pr-quality-check-bot -->
## Pull Request Quality Check: Resolved

All Pull Request quality requirements are now satisfied. No more action is needed.

---

### If ANY check fails

1. Write `FAIL` to `/tmp/pr-check-status`:
   ```bash
   echo "FAIL" > /tmp/pr-check-status
   ```

2. Call the `upsert_pr_quality_comment` safe output tool exactly once, with:
   - `item_number` set to the triggering pull request number
   - `create_if_missing` set to `true`
   - `body` set to the comment below

   Always include the marker `<!-- pr-quality-check-bot -->` as the very first line of the comment. The managed comment tool relies on this marker to update the existing pull request quality comment instead of creating a duplicate. Only include bullet points for requirements that are currently failing.

---

<!-- pr-quality-check-bot -->
## Pull Request Quality Check: Action Required

This Pull Request still has a few requirements to address before it is ready to merge:

- **Title**: The title `"Updated stuff"` does not follow Conventional Commits. Try: `fix: resolve login timeout issue` or `feat(profile): add avatar upload`.
- **Description : Why**: Please explain the motivation for this change.
- **Description : What**: Please add a short summary of what files or components were modified.
- **Description : How validated**: Please describe how you tested this change (e.g., "Added unit tests in `auth.test.ts`", "Tested manually on staging").
- **Assignee**: Please assign at least one person to this Pull Request.
- **Scope Focus**: This Pull Request appears to mix unrelated changes. Consider splitting it into separate Pull Requests, or add a note to the description explaining how the different changes are connected.

Once you've made the updates, this check will re-run automatically.

---

## Important Guidelines

- Only call `upsert_pr_quality_comment` once per run, and do not use any other comment-writing tool for this workflow.
- Only mention failing requirements in the action-required comment. Do not mention checks that already pass.
