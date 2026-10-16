#!/bin/sh
set -eu
message=${1:-}
test -n "$message" || { echo 'Supply m="release message"'; exit 1; }
branch=$(git branch --show-current)
test -n "$branch" && test "$branch" != main || { echo 'Start on a release branch'; exit 1; }
git diff --quiet || { echo 'Unstaged tracked changes remain'; exit 1; }
git diff --cached --quiet && { echo 'Stage reviewed source before releasing'; exit 1; }
git diff --cached --check
npm test
git fetch origin
if git show-ref --verify --quiet refs/remotes/origin/main; then
	git merge-base --is-ancestor origin/main HEAD
else
	test -z "$(git ls-remote --heads origin)" || { echo 'Remote has branches but no main; review before bootstrapping'; exit 1; }
fi
git commit -m "$message"
if git show-ref --verify --quiet refs/heads/main; then
	git switch main
elif git show-ref --verify --quiet refs/remotes/origin/main; then
	git switch -c main --track origin/main
else
	git switch -c main
fi
if git show-ref --verify --quiet refs/remotes/origin/main; then
	git merge --ff-only origin/main
fi
git merge --ff-only "$branch"
git push -u origin main
