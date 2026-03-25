---
name: PR Quality Check
description: Validates PR title, description completeness (why/what/how), assignee presence, and scope focus. Blocks merge if requirements are not met.

on:
  pull_request:
    types: [opened, edited, synchronize, reopened, labeled, unlabeled, assigned, unassigned]
  skip-bots: [dependabot, renovate, github-actions]

permissions:
  contents: read
  pull-requests: read
  issues: read

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
          description: The full PR quality comment body. The managed marker will be normalized automatically.
          required: true
          type: string
        item_number:
          description: The pull request number to comment on. Defaults to the triggering PR when omitted.
          required: false
          type: string
        create_if_missing:
          description: Whether to create a managed PR quality comment when none already exists.
          required: false
          type: boolean
      steps:
        - name: Upsert managed PR quality comment
          uses: actions/github-script@v8
          env:
            GH_AW_PR_QUALITY_MARKER: "<!-- pr-quality-check-bot -->"
          with:
            github-token: ${{ secrets.GH_AW_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
            script: |
              const fs = require('fs');

              const marker = process.env.GH_AW_PR_QUALITY_MARKER;
              const outputFile = process.env.GH_AW_AGENT_OUTPUT;
              if (!outputFile) {
                core.setFailed('GH_AW_AGENT_OUTPUT is not set');
                return;
              }

              const agentOutput = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
              const items = agentOutput.items.filter((item) => item.type === 'upsert_pr_quality_comment');

              if (items.length === 0) {
                core.info('No PR quality comment requested.');
                return;
              }

              if (items.length > 1) {
                core.setFailed('Expected at most one upsert_pr_quality_comment item.');
                return;
              }

              const item = items[0];
              const issueNumber = Number(item.item_number || context.payload.pull_request?.number || context.issue.number);
              const createIfMissing = item.create_if_missing !== false && item.create_if_missing !== 'false';
              if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
                core.setFailed(`Invalid pull request number: ${item.item_number}`);
                return;
              }

              if (typeof item.body !== 'string' || item.body.length === 0) {
                core.setFailed('Comment body must be a non-empty string.');
                return;
              }

              let commentBody = item.body.replace(/^\uFEFF/, '').replace(/^\s+/, '');
              if (commentBody.startsWith(marker)) {
                const remainder = commentBody.slice(marker.length).replace(/^\r?\n?/, '').replace(/^\s*/, '');
                commentBody = remainder.length > 0 ? `${marker}\n${remainder}` : `${marker}\n`;
              } else {
                core.warning(`Comment body did not begin with "${marker}". Prepending the managed marker automatically.`);
                commentBody = `${marker}\n${commentBody}`;
              }

              const comments = await github.paginate(github.rest.issues.listComments, {
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: issueNumber,
                per_page: 100,
              });

              const managedComments = comments
                .filter((comment) =>
                  typeof comment.body === 'string' &&
                  comment.body.startsWith(marker) &&
                  comment.user?.type === 'Bot'
                )
                .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));

              const [primaryComment, ...duplicateComments] = managedComments;

              if (!primaryComment) {
                if (!createIfMissing) {
                  core.info('No managed PR quality comment exists, and create_if_missing is false. Skipping comment creation.');
                  return;
                }

                const createdComment = await github.rest.issues.createComment({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: issueNumber,
                  body: commentBody,
                });
                core.info(`Created PR quality comment ${createdComment.data.id}.`);
                return;
              }

              if (primaryComment.body !== commentBody) {
                await github.rest.issues.updateComment({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  comment_id: primaryComment.id,
                  body: commentBody,
                });
                core.info(`Updated PR quality comment ${primaryComment.id}.`);
              } else {
                core.info(`PR quality comment ${primaryComment.id} is already up to date.`);
              }

              for (const duplicateComment of duplicateComments) {
                await github.rest.issues.deleteComment({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  comment_id: duplicateComment.id,
                });
                core.info(`Deleted duplicate managed comment ${duplicateComment.id}.`);
              }

post-steps:
  - name: Fail job if PR quality check did not pass
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
        echo "No PR quality check status found — treating as inconclusive."
      fi
---

# PR Quality Check

You are a PR quality checker. Your job is to validate that pull requests follow the team's contribution standards for metadata and clarity.

**Out of scope**: Code review, implementation quality, logic errors, test coverage. Focus ONLY on the PR title, description, assignee, and change scope.

## Step 1: Read the PR

Use GitHub tools to fetch the pull request details:

- PR number: `${{ github.event.pull_request.number }}`
- Repository: `${{ github.repository }}`

Retrieve: the PR title, body (description), assignees, and the list of changed files.

## Step 2: Run Quality Checks

Run all six checks below. Record a PASS or FAIL result for each.

---

### Check A — Title: Conventional Commits Format

The PR title MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

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
- `Updated stuff` — missing type
- `feat:add login` — missing space after colon
- `Feature: Add login` — type must be lowercase
- `WIP` — no type or description
- `fix()`: empty scope

---

### Check B — Description: Why Is This Needed?

The PR description MUST explain **why this change is needed**.

Look for: motivation, the problem being solved, business or user context, a linked issue or ticket, or any explanation of the purpose. A reference like "Closes #123" or "Fixes #456" satisfies this check since the linked issue provides the context.

**Fail if**: the description is empty, or there is no explanation of the reason for the change.

---

### Check C — Description: What Was Changed?

The PR description MUST briefly explain **what was changed**.

Look for: a summary of the modifications, affected components, files, or systems, key logic or behaviours introduced or removed.

**Fail if**: there is no mention of what the change actually does, even in brief.

---

### Check D — Description: How Were Changes Validated?

The PR description MUST explain **how the changes were validated**.

Look for: unit tests, integration tests, end-to-end tests, manual testing steps, CI results, staging environment verification, screenshots, or any method used to confirm correctness.

**Fail if**: there is no mention of how the changes were verified to work.

---

### Check E — Assignee

The PR MUST have at least one person assigned to it.

**Fail if**: no assignees are set on the PR.

---

### Check F — Scope Focus

The PR should be focused on a single, coherent concern. It should not mix unrelated changes that make it harder to review, understand, or revert.

Use the list of changed files alongside the title and description to assess whether all changes clearly serve the same stated purpose.

**Pass if**: the changed files are consistent with a single topic or tightly related concerns — for example, a feature and its tests, or a bug fix alongside its documentation update.

**Fail if**: the PR mixes clearly unrelated concerns without explanation — for example, combining a new feature, an unrelated refactor, and dependency upgrades with no stated connection between them.

Apply reasonable judgment. Only fail when the lack of focus is clear and significant, not for minor incidental changes.

---

## Step 3: Report Results

### If ALL checks pass (A through F)

1. Write `PASS` to `/tmp/pr-check-status`:
   ```bash
   echo "PASS" > /tmp/pr-check-status
   ```
2. Call `upsert_pr_quality_comment` exactly once with:
   - `item_number`: the triggering PR number
   - `create_if_missing`: `false`
   - `body`: the resolved comment below

   This updates an existing managed PR quality comment when the PR becomes compliant again, but it does not create a first-run success comment.

---

<!-- pr-quality-check-bot -->
## PR Quality Check — Resolved

All PR quality requirements are now satisfied. No more action is needed.

---

### If ANY check fails

1. Write `FAIL` to `/tmp/pr-check-status`:
   ```bash
   echo "FAIL" > /tmp/pr-check-status
   ```

2. Call the `upsert_pr_quality_comment` safe output tool exactly once, with:
   - `item_number` set to the triggering PR number
   - `create_if_missing` set to `true`
   - `body` set to the comment below

   Always include the marker `<!-- pr-quality-check-bot -->` as the very first line of the comment. The managed comment tool relies on this marker to update the existing PR quality comment instead of creating a duplicate. Only include bullet points for requirements that are currently failing.

---

<!-- pr-quality-check-bot -->
## PR Quality Check — Action Required

This PR still has a few requirements to address before it is ready to merge:

- **Title**: The title `"Updated stuff"` does not follow Conventional Commits. Try: `fix: resolve login timeout issue` or `feat(profile): add avatar upload`.
- **Description — Why**: Please explain the motivation for this change.
- **Description — What**: Please add a short summary of what files or components were modified.
- **Description — How validated**: Please describe how you tested this change (e.g., "Added unit tests in `auth.test.ts`", "Tested manually on staging").
- **Assignee**: Please assign at least one person to this PR.
- **Scope Focus**: This PR appears to mix unrelated changes. Consider splitting it into separate PRs, or add a note to the description explaining how the different changes are connected.

Once you've made the updates, this check will re-run automatically.

---

## Important Guidelines

- Be constructive and helpful — not bureaucratic or harsh.
- Apply reasonable judgment; do not fail for minor formatting preferences.
- If the description is completely empty, fail Checks B, C, and D.
- Do not comment on code quality, naming conventions, or anything outside the scope of this check.
- Only mention failing requirements in the action-required comment. Do not mention checks that already pass.
- Only call `upsert_pr_quality_comment` once per run, and do not use any other comment-writing tool for this workflow.
- For Check F, only fail when the lack of focus is clear and significant. A PR that touches source and test files for the same change is expected and fine.
