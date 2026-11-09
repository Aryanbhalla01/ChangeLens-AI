# ChangeLens AI backend

A local, read-only Flask API for approved Git working trees. Repository registrations are
stored in SQLite. A stored path is revalidated against `CHANGELENS_ALLOWED_REPO_ROOTS`
whenever it is used; changing the allowlist does not grant access to previously connected
repositories outside the new roots.

Public GitHub repositories can also be connected by their canonical HTTPS URL. The backend
checks the repository's GitHub-reported size before cloning its full history into
`CHANGELENS_MANAGED_REPO_ROOT`, then registers that managed working tree through the same
read-only analysis APIs. GitHub public metadata and Git clone traffic require outbound HTTPS
access from the backend. The default repository-size limit is 100 MiB and the default clone
timeout is 120 seconds; the post-clone storage ceiling is twice the configured size limit.
Managed storage must be writable and should be on a persistent server-side volume in
deployments. Local repository connections remain restricted to `CHANGELENS_ALLOWED_REPO_ROOTS`.

The API does not accept user-supplied shell commands, write to connected repositories,
perform AI summaries, or calculate risk scores. Underlying Git operations may invoke a
trusted repository's configured fsmonitor hook as described below. Configure only repository
roots you trust. This development service binds to loopback by default and is not an
authenticated multi-user service.

Repository validation is path-based and is not race-free: a local actor able to modify an
approved repository can replace Git metadata between validation and a GitPython operation.
The metadata is checked both before and after repository construction, which narrows but does
not eliminate this time-of-check/time-of-use window. Use only trusted local repositories and
restrict write access to configured roots. Repository-local Git configuration is also treated
as trusted: `core.worktree` is checked against the selected working tree after GitPython opens
the repository, while `core.fsmonitor` is not disabled and may invoke its configured hook when
an underlying Git operation uses it. Do not connect repositories with untrusted local Git
configuration.

Git environment variables that redirect repository metadata, object storage, shallow/graft
metadata, or inject config are rejected when non-empty. This includes indexed
`GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*` variables.

## Requirements and setup (Windows PowerShell)

Use Python 3.14.3 and Git for Windows installed and available to GitPython. From the project
root:

```powershell
cd .\backend
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set `CHANGELENS_ALLOWED_REPO_ROOTS` to a directory containing the local Git
repositories that this API may read. For example:

```dotenv
CHANGELENS_ALLOWED_REPO_ROOTS=C:\Users\Jordan\source
```

Multiple Windows roots are separated by semicolons. Do not use a drive root or home directory
unless the API genuinely needs access to all repositories beneath it. The default CORS
allowlist is limited to the Vite development origins on localhost.

Set `CHANGELENS_MANAGED_REPO_ROOT` to a writable directory reserved for public GitHub clones.
The development default is `backend\app\instance\repositories`. For deployments, mount a
persistent volume there or configure another dedicated path; do not make the managed root a
user-controlled path or include it among local repository roots. Optional resource settings
are `CHANGELENS_MAX_PUBLIC_REPOSITORY_SIZE_MB` (default `100`) and
`CHANGELENS_PUBLIC_REPOSITORY_CLONE_TIMEOUT_SECONDS` (default `120`).

## Start the backend

```powershell
cd .\backend
.\.venv\Scripts\Activate.ps1
python .\run.py
```

The API listens on `http://127.0.0.1:5000`. SQLite is created at
`backend\app\instance\changelens.sqlite3` by default.

## Start the frontend

In another PowerShell window, from the project root:

```powershell
npm.cmd install
npm.cmd run dev
```

The frontend calls the health, repository, status, commit history, commit detail, and comparison
endpoints documented below. It uses `http://127.0.0.1:5000` by default. To use another API
origin, set `VITE_API_BASE_URL` before starting Vite, for example:

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:5000'
npm.cmd run dev
```

The repository page connects public GitHub URLs and lists repositories registered with the
backend. Repository selection, status, history, commit details, and bounded comparisons use
live API data. Local filesystem paths can still be registered through the backend API. The
frontend does not call or assume an `/api/overview` endpoint.

## API conventions

Successful responses use `{ "success": true, "data": ... }`. Errors use:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REPOSITORY",
    "message": "The selected directory is not a valid Git repository."
  }
}
```

Unexpected errors do not expose Python tracebacks or server paths. Registered repository IDs
are UUIDs; use IDs for subsequent requests instead of resending filesystem paths.

### Health

`GET /api/health`

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "application": "ChangeLens AI",
    "version": "0.1.0"
  }
}
```

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
```

### Repositories

- `POST /api/repositories/connect` — JSON body `{"path":"C:\\Users\\Jordan\\source\\my-repo"}`
  for a local repository, or `{"url":"https://github.com/owner/repository"}` for a public
  GitHub repository. Public URLs must use exactly the canonical HTTPS owner/repository path:
  no credentials, query, fragment, trailing slash, `.git` suffix, or extra path components.
  The backend applies the configured GitHub size limit, clones full history into the managed
  root with a bounded timeout, and removes an incomplete clone on failure. Returns `201` with
  repository ID, name/path, current branch, latest commit (or `null` for an empty repository),
  bounded commit count, and registration time.
- `GET /api/repositories` — registered repositories that are still valid and inside the
  configured roots. Registrations outside the active allowlist are omitted.
- `GET /api/repositories/{repository_id}` — repository metadata.
- `GET /api/repositories/{repository_id}/status` — branch, dirty state, staged/modified/
  untracked counts, and a commit count capped at the configured scan limit.

Connect example:

```powershell
$body = @{ path = 'C:\Users\Jordan\source\my-repo' } | ConvertTo-Json
$repo = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5000/api/repositories/connect `
  -ContentType 'application/json' -Body $body
$repo.data.id
```

Public GitHub repository example:

```powershell
$body = @{ url = 'https://github.com/owner/repository' } | ConvertTo-Json
$repo = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5000/api/repositories/connect `
  -ContentType 'application/json' -Body $body
$repo.data.id
```

### Commit history and details

- `GET /api/repositories/{repository_id}/commits?page=1&per_page=20&search=fix&branch=main`
  — real history ordered newest first. `per_page` is capped at 100; history search scans at
  most 10,000 commits. `pagination.total` is `null` when the scan limit is reached.
- `GET /api/repositories/{repository_id}/commits/{commit_hash}` — commit and parent metadata,
  plus added, modified, deleted, and renamed file lists. File lists are capped at 200 items
  and indicate truncation.

```powershell
$id = $repo.data.id
Invoke-RestMethod "http://127.0.0.1:5000/api/repositories/$id/commits?page=1&per_page=20"
Invoke-RestMethod "http://127.0.0.1:5000/api/repositories/$id/commits/$($repo.data.latestCommit.hash)"
```

Each history item includes full/short hash, author, commit date, message, a local branch name
when the commit is a branch tip, changed file count, insertions/deletions when available, and
a `statsAvailable` flag.

### Compare commits

`GET /api/repositories/{repository_id}/compare?base={hash}&target={hash}` returns base/target
commit summaries and file entries with `path`, optional `previousPath`, `changeType`, line
counts, `binary`, `truncated`, and unified `diff` text. Binary files contain no diff text.
Text blobs larger than the configured read bound are omitted and marked truncated. At most
100 file entries and 256,000 bytes of diff text are returned; each individual diff is capped
at 32,000 bytes. Files exceeding the 4,000 combined-line analysis bound are marked truncated;
counts are `null` if the byte or line limits prevent safe text analysis.

```powershell
$base = 'BASE_COMMIT_HASH'
$target = 'TARGET_COMMIT_HASH'
Invoke-RestMethod "http://127.0.0.1:5000/api/repositories/$id/compare?base=$base&target=$target"
```

Only hexadecimal commit object IDs (4–64 characters) are accepted; revision expressions,
paths, and Git options are rejected. Initial commits are represented as additions when
inspecting their details. Comparisons accept two actual commits, including commits without
parents.

### Python code analysis

`GET /api/repositories/{repository_id}/commits/{commit_hash}/analysis` analyzes changed
Python source lines against a small deterministic rule set. It uses the commit's first parent
as the base; merge commits therefore use first-parent semantics. Root commits are compared
against the empty tree.

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/api/repositories/$id/commits/$($repo.data.latestCommit.hash)/analysis"
```

The success envelope includes commit/base summaries, `baseStrategy` (`first_parent` or
`empty_tree`), changed Python `files`, evidence-backed `findings`, a `summary`, and `limits`.
Files include `path`, optional `previousPath`, `changeType`, nullable `additions`/`deletions`,
`binary`, `truncated`, `analyzable`, and bounded `changedLines`. Each changed-line entry has a
one-based line number, `lineSide` (`new` or `old`), `change` (`added` or `deleted`), and the
source text plus `contentTruncated`. A modification is represented as deleted old lines and
added new lines. Findings include a rule ID, title, descriptive severity (`warning` or
`notice`), file path and line reference, change direction, explanation, and the changed source
line as evidence. Severity labels are not risk scores.

Example response excerpt:

```json
{
  "success": true,
  "data": {
    "baseStrategy": "first_parent",
    "files": [{
      "path": "src/example.py",
      "previousPath": null,
      "changeType": "modified",
      "additions": 1,
      "deletions": 1,
      "binary": false,
      "truncated": false,
      "analyzable": true,
      "changedLines": [{
        "lineNumber": 24,
        "lineSide": "new",
        "change": "added",
        "content": "result = eval(value)",
        "contentTruncated": false
      }]
    }],
    "findings": [{
      "ruleId": "PY001",
      "title": "Dynamic code execution",
      "severity": "warning",
      "path": "src/example.py",
      "lineNumber": 24,
      "lineSide": "new",
      "change": "added",
      "evidence": "result = eval(value)"
    }]
  }
}
```

The current rules are lexical checks on changed lines only:

| Rule | Pattern |
| --- | --- |
| `PY001` | Calls to `eval()` or `exec()` |
| `PY002` | A single-line `subprocess` call with `shell=True` |
| `PY003` | Bare `except:` handlers |
| `PY004` | Credential-like names assigned a quoted literal |

These are deterministic heuristics, not a full Python parser, security audit, or AI analysis.
They can miss multiline or indirect patterns and can produce false positives, especially for
credential-like literals. Findings on deleted lines show that a pattern was removed; they do
not imply it remains in the target commit.

Analysis reuses the bounded Git diff reader: the first 100 diff entries are retained, with one
additional entry inspected to detect file-list truncation. Total diff text is capped at
256,000 bytes, each file diff at 32,000 bytes, blob reads at 128,000 bytes, and combined file
lines at 4,000. The response includes at most 2,000 changed-line entries and 200 findings,
with individual evidence strings capped at 1,000 characters. Binary files, oversized files,
and truncated diffs are returned as metadata but are not analyzed. The file limit is applied
before Python filtering, so Python changes beyond that bounded scan may be omitted;
`summary.filesTruncated` and `summary.truncated` indicate incomplete results. A
content-preserving rename has no changed source lines to inspect.

## Run tests

From `backend` with the virtual environment active:

```powershell
python -m pytest -q
```

Tests create temporary Git repositories under a temporary approved root and direct Git away
from any global user configuration.

## Known limitations

- This is a local development API without authentication. Keep the loopback binding and do not
  expose it to untrusted networks.
- Local repositories must be non-bare Git working trees below explicitly configured roots.
  Public repositories are cloned into the configured managed root and limited by GitHub's
  size metadata, the clone timeout, and a post-clone storage check.
- Only local branches are supported as history filters; remote refs and arbitrary Git revision
  expressions are intentionally unsupported.
- Counts/history scans are bounded. Very large commits/comparisons can report unavailable
  statistics or truncated file/diff data.
- Python code analysis is limited to the documented changed-line heuristics and may be
  incomplete when diff/file/line limits are reached.
- SQLite registrations persist locally, but registered repositories are not synchronized
  between machines.
- AI insights and risk scoring are not implemented.
