# PR Demo Skill

Record a video demonstrating a GitHub PR's UI changes using the `reenact` tool, then post it as a PR comment.

## Invocation

```
/pr-demo <pr-number-or-url>
```

Examples:
- `/pr-demo 123`
- `/pr-demo https://github.com/owner/repo/pull/123`

## Instructions

Follow these steps exactly. Stop and report to the user if any step fails.

---

### Step 1: Parse the input

Extract the PR number and repository from the argument.

- If the argument is a plain number (e.g. `123`), use the current working directory's git remote to determine the owner/repo. Run:
  ```
  gh pr view <number> --json number,title,body,headRefName,baseRefName,url,files --jq '.'
  ```
- If the argument is a full URL (e.g. `https://github.com/owner/repo/pull/123`), extract the owner, repo, and number from the URL, then run:
  ```
  gh pr view <url> --json number,title,body,headRefName,baseRefName,url,files --jq '.'
  ```

Save the PR number, title, body, branch name, and the list of changed files.

### Step 2: Get the diff to understand UI changes

Run:
```
gh pr diff <number-or-url> --name-only
```

Then get the full diff for UI-relevant files (filter to files ending in `.html`, `.css`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.scss`, `.less`, `.hbs`, `.ejs`, `.pug`):

```
gh pr diff <number-or-url> -- '*.tsx' '*.jsx' '*.html' '*.vue' '*.svelte' '*.css' '*.scss'
```

If no UI-relevant files are found, inform the user that this PR does not appear to contain UI changes and ask whether to proceed anyway.

### Step 3: Check for an existing reenact script in the PR

Check whether the PR branch contains a reenact convention file. Try these paths in order:

```bash
git show origin/<head-branch>:reenact.yaml 2>/dev/null
git show origin/<head-branch>:.reenact/demo.yaml 2>/dev/null
```

If the current repo does not have the branch fetched, fetch it first:
```bash
git fetch origin <head-branch>
```

If either file exists, use it as the demo script. Skip to Step 5.

### Step 4: Generate a reenact YAML script

If no existing script was found, generate one dynamically. Analyze the diff from Step 2 to determine:

1. **What pages/routes changed** -- look for route definitions, page components, or URL patterns in the changed files.
2. **What elements were added or modified** -- look for new buttons, forms, inputs, modals, or layout changes.
3. **What the expected interaction flow is** -- based on the component names, prop changes, and DOM structure.

Create a YAML file at `/tmp/pr-demo-<pr-number>.yaml` with this structure:

```yaml
name: "PR #<number> Demo - <title>"
url: "<dev-server-url>"
viewport:
  width: 1280
  height: 720
steps:
  - wait: 1s
  # ... generated steps based on the diff analysis
```

Guidelines for generating steps:

- **Start with navigation**: Use `goto` to navigate to the page that was changed.
- **Add waits after navigation**: Always add `- wait: 1s` after navigating to a new page.
- **Interact with changed elements**: Click buttons, fill forms, hover over new elements. Use CSS selectors from the diff.
- **Use realistic data**: When typing into fields, use plausible example data, not "test123".
- **Show before and after states**: If the PR changes how something looks after interaction, include the interaction.
- **Scroll to show content**: Add `- scroll: down` if the changes are below the fold.
- **Keep it short**: Aim for 10-20 steps. The video should be 10-30 seconds.
- **End with a wait**: Always end with `- wait: 2s` so the final state is visible.

If you cannot determine the dev server URL, ask the user. Common defaults to try:
- `http://localhost:3000`
- `http://localhost:5173` (Vite)
- `http://localhost:4200` (Angular)
- `http://localhost:8080`

Before running reenact, confirm with the user:
1. That the dev server is running at the expected URL.
2. That the PR branch is checked out locally.

### Step 5: Validate the script with a dry run

Run:
```bash
npx reenact /tmp/pr-demo-<pr-number>.yaml --dry-run
```

If `reenact` is not installed globally, find the correct path. If you are inside the reenact repo itself, use:
```bash
node <reenact-repo>/dist/cli.js /tmp/pr-demo-<pr-number>.yaml --dry-run
```

If validation fails, fix the YAML and retry.

### Step 6: Record the video

Run:
```bash
npx reenact /tmp/pr-demo-<pr-number>.yaml --format mp4 -o /tmp/pr-demo-<pr-number>.mp4
```

Or with a local build:
```bash
node <reenact-repo>/dist/cli.js /tmp/pr-demo-<pr-number>.yaml --format mp4 -o /tmp/pr-demo-<pr-number>.mp4
```

This requires `ffmpeg` to be installed for MP4 output. If ffmpeg is not available, fall back to webm:
```bash
npx reenact /tmp/pr-demo-<pr-number>.yaml -o /tmp/pr-demo-<pr-number>.webm
```

Confirm the output file exists and is non-empty:
```bash
ls -lh /tmp/pr-demo-<pr-number>.mp4
```

### Step 7: Upload the video and comment on the PR

GitHub does not support direct video uploads via the CLI or REST API. Use one of the following strategies, in order of preference:

**Strategy A: Convert to GIF and embed inline (preferred for short demos)**

Convert the video to a GIF using ffmpeg. This works for demos under ~15 seconds.

```bash
ffmpeg -y -i /tmp/pr-demo-<pr-number>.mp4 \
  -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
  /tmp/pr-demo-<pr-number>.gif
```

Check the GIF file size:
```bash
ls -lh /tmp/pr-demo-<pr-number>.gif
```

If the GIF is under 10MB, upload it to the PR. GitHub allows image uploads via the API using a two-step process:

1. First, get an upload URL by posting to the user-content endpoint. Since this is complex via CLI, instead create a GitHub Gist containing the GIF:

```bash
gh gist create /tmp/pr-demo-<pr-number>.gif --public -d "PR #<number> demo recording"
```

Then retrieve the raw URL from the gist output and use it in the comment.

If `gh gist create` does not support binary files, skip to Strategy B.

**Strategy B: Upload as a release asset**

Create or reuse a "pr-demos" release in the repo, then attach the video:

```bash
# Create the release if it does not exist
gh release create pr-demos --title "PR Demo Recordings" --notes "Automated PR demo videos" 2>/dev/null || true

# Upload the video as a release asset (delete existing asset with same name first)
gh release delete-asset pr-demos pr-demo-<pr-number>.mp4 2>/dev/null || true
gh release upload pr-demos /tmp/pr-demo-<pr-number>.mp4
```

Get the download URL:
```bash
gh release view pr-demos --json assets --jq '.assets[] | select(.name == "pr-demo-<pr-number>.mp4") | .url'
```

**Strategy C: Provide instructions to the user**

If both strategies above fail, inform the user:

1. The video has been saved to `/tmp/pr-demo-<pr-number>.mp4`.
2. They can manually drag and drop the video into the GitHub PR comment box in their browser.
3. Alternatively, they can upload it to any file hosting service and share the link.

Do not skip posting the comment -- proceed with a placeholder link and tell the user to edit it.

### Step 8: Post the PR comment

Compose the comment body and post it. Use a heredoc for proper formatting:

```bash
gh pr comment <number-or-url> --body "$(cat <<'COMMENT_EOF'
## UI Demo Recording

**PR:** #<number> - <title>

<video-embed-or-link>

---

This recording was generated automatically by [reenact](https://github.com/your-org/reenact) based on the UI changes in this PR.

<details>
<summary>Reenact script used</summary>

\`\`\`yaml
<contents of the yaml script>
\`\`\`

</details>
COMMENT_EOF
)"
```

For the video embed:
- If you have a GIF URL: `![PR Demo](https://the-gif-url.gif)`
- If you have an MP4 release asset URL: `[Download demo video](https://the-asset-url.mp4)`
- If neither worked: `Video saved locally at /tmp/pr-demo-<pr-number>.mp4 -- attach manually.`

### Step 9: Report results

Tell the user:
- The PR comment URL (from `gh pr comment` output, or construct it as `<pr-url>#issuecomment-...`)
- The local video path
- Whether the script was auto-generated or found in the repo
- Any issues encountered

---

## Error handling

- **reenact not found**: Check if the tool is available via `npx reenact --version`, or look for a local build at `./dist/cli.js` in the current repo. If unavailable, tell the user to install it with `npm install -g reenact` or `npm install` in the reenact repo.
- **ffmpeg not found**: Fall back to webm format and note this in the PR comment.
- **Dev server not running**: Ask the user to start it and provide the URL.
- **Dry run fails**: Review the generated YAML for invalid selectors or unknown actions. Fix and retry.
- **Video is empty or recording fails**: Check if the URL is reachable. Try with `--headed` flag to debug visually.
- **gh CLI not authenticated**: Run `gh auth status` to check. If not authenticated, instruct the user to run `gh auth login`.
- **PR not found**: Verify the PR number/URL. Check `gh pr list` for valid PRs.

## Dependencies

- `gh` (GitHub CLI) -- authenticated with repo access
- `reenact` (this tool) -- installed globally or available locally
- `ffmpeg` -- required for MP4 output and GIF conversion; optional if using webm
- A running dev server for the target application
- The PR branch checked out locally (for finding convention files)
