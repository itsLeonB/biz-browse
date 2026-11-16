# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `itsLeonB/biz-browse`. Use `gh`.

- Create: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`. Add label or state filters as needed.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post an explanation with `gh issue comment`, then run `gh issue close <number>`.
- Link a sub-issue: `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>`. If unavailable, put `Part of #<parent>` at the top of the child body.
- Add a blocker: `gh issue create --blocked-by <number> ...` or `gh issue edit <child> --add-blocked-by <blocker>`. If unavailable, put `Blocked by: #<number>` at the top of the child body.
- Count open blockers: `gh api repos/{owner}/{repo}/issues/<number> --jq .issue_dependencies_summary.blocked_by`. Zero means the issue is unblocked.

Before creating an issue, check the target with `gh repo view --json nameWithOwner`. Confirm with the user if it is not their repo.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Set this to `yes` if external PRs should enter the triage queue. Use the corresponding `gh pr` commands to read, label, comment on, or close PRs.

## Skill operations

- Publish to the issue tracker: create a GitHub issue.
- Fetch the relevant ticket: read the GitHub issue.
- `/wayfinder`: use a `wayfinder:map` issue as the map, link child issues as sub-issues, and label children `wayfinder:<type>`. Claim an unassigned, unblocked child with `gh issue edit <number> --add-assignee @me`. On completion, comment on and close the child, then add a context pointer to the map.
