---
name: ship
description: Commit and push the current changes in this Base44 project, then deploy them to production via the Base44 CLI. Use when the user runs /ship.
---

# ship

Runs entirely in this project directory (`wr-dashboard-fiscal`), which is linked to
Base44 app id `6a29c42d30df194eb8930ccb` via `base44/.app.jsonc`. Running `/ship`
is itself the user's confirmation to publish — do not ask again before deploying.

## Steps

1. **Environment**: ensure Node 22 is active for this shell before running any
   `base44` command:
   ```
   export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm use 22
   ```

2. **Inspect changes**: run `git status` and `git diff` (staged + unstaged) to see
   what changed. If there is nothing to commit and nothing new to deploy, say so
   and stop — do not run an empty deploy.

3. **Commit**: stage the relevant files (avoid `git add -A`/`.`; add files by name)
   and create a commit with a concise message describing the *why* of the change,
   following this repo's existing commit style (see `git log`). End the message
   with:
   ```
   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   ```
   Skip this step if the working tree is already clean.

4. **Push**: `git push` to the current branch's upstream. If there is no upstream
   yet, push and set it (`git push -u origin <branch>`).

5. **Deploy to production**: from the project root, run:
   ```
   npx base44 deploy --yes --build
   ```
   This deploys entities, functions, agents, connectors, and the site to the
   live app in one shot. Do not add `--no-build` — always build the site before
   deploying so production serves the latest bundle.

6. **Report**: summarize what was committed/pushed and confirm the deploy
   succeeded (or report the CLI error if it failed, without retrying blindly).

## Notes

- This is a live-production action: `base44 deploy` publishes directly to the
  real app (`https://dashboard-wr.base44.app`), not a staging area.
- If `git push` fails (e.g. diverged branch), stop and surface the error instead
  of force-pushing.
- If `base44 deploy` fails, do not fall back to `--no-build` or skip steps to
  force it through — report the failure so it can be diagnosed.
