# PR Quality Checks

An automated PR quality validation system powered by [GitHub Agentic Workflows (gh-aw)](https://github.com/github/gh-aw) and GitHub Copilot. When a pull request is opened or updated, a Copilot agent validates it against a defined quality contract and posts a managed comment with the results. The workflow blocks merging if any check fails.

## How It Works

```
PR opened / edited
      ↓
Copilot agent reads PR title, description, assignees, and changed files
      ↓
Validates against 9-point quality contract
      ↓
Posts or updates a comment on the PR with results
      ↓
Exits 1 (blocks merge) if any check fails — exits 0 if all pass
```

## Quality Checks

| Check | Rule |
|-------|------|
| **A** | PR title follows [Conventional Commits](https://www.conventionalcommits.org/) format: `type(scope): description` |
| **B** | Description includes all required sections: `Why`, `What Changed`, `Validation / Tests` |
| **C** | `Why` section clearly explains motivation — no empty, TODO, or TBD placeholders |
| **D** | `What Changed` accurately reflects the actual diff |
| **E** | `Validation / Tests` provides concrete evidence (unit tests, manual steps, CI results, staging checks) |
| **F** | `Screenshots` section contains actual images or `N/A` (if present) |
| **G** | `Linked Issue` references a real issue or `N/A` (if present) |
| **H** | PR has at least one assignee |
| **I** | PR is focused on a single concern — no mixing of unrelated changes |

## PR Description Template

Use this template when writing your PR description:

```markdown
## Why
Explain the motivation for this change. Include the problem, user impact, or business context.

## What Changed
Summarize the main changes. Mention affected components, behaviors, or files.

## Validation / Tests
Describe how this was validated. Include automated tests, manual steps, CI runs, or staging checks.

## Screenshots
Optional. Remove this section if not relevant, or write N/A.

## Linked Issue
Optional. Remove this section if not relevant, or write N/A. Reference related issues or tickets.
```

## Setup

### Prerequisites

- A repository with GitHub Actions enabled
- A `COPILOT_GITHUB_TOKEN` secret set in your repository settings (GitHub Copilot CLI token)
- The [gh-aw CLI](https://github.com/github/gh-aw) installed if you plan to modify and recompile workflows

### Installing

1. Copy the `.github/` folder from this repository into your own.
2. Add the `COPILOT_GITHUB_TOKEN` secret to your repository (**Settings → Secrets and variables → Actions**).
3. The workflow triggers automatically on pull request events — no further configuration required.

### Modifying the Validation Rules

Rules are defined in `.github/skills/pr-quality-checks/contract.md`. After editing:

```bash
gh aw compile
```

This regenerates `.github/workflows/pr-quality-check.lock.yml`. Commit both files.

> **Note:** Never edit `.lock.yml` directly — it is auto-generated and will be overwritten on the next compile.

## Workflow Triggers

The workflow runs on all pull request events **except** those authored by bots (`dependabot`, `renovate`, `github-actions`):

- `opened`
- `edited`
- `synchronize`
- `reopened`
- `labeled` / `unlabeled`
- `assigned` / `unassigned`

## Repository Structure

```
.github/
├── actions/
│   └── upsert-pr-quality-comment/   # Action that posts/updates the PR comment
├── agents/
│   └── pr-quality-validator.agent.md # Agent definition and trigger phrases
├── skills/
│   └── pr-quality-checks/
│       ├── contract.md              # Canonical validation rules (edit this)
│       ├── template.md              # PR description template
│       └── SKILL.md                 # Skill metadata
└── workflows/
    ├── pr-quality-check.md          # Workflow source (edit this)
    └── pr-quality-check.lock.yml    # Compiled workflow (auto-generated)
```
