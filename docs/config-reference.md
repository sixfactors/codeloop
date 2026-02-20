# Configuration Reference

All configuration lives in `.codeloop/config.yaml`.

## Full Schema

```yaml
# Project identity
project:
  name: "my-project"           # Project name (used in status output)

# Scopes map file paths to knowledge sections.
# /commit uses scopes to determine which gotchas/patterns to load.
scopes:
  <scope-name>:
    paths: ["glob/**"]           # File patterns that belong to this scope
    gotcha_sections: ["Section"] # Gotcha sections to load for this scope
    pattern_sections: ["Section"] # Pattern sections to load for this scope

# Quality checks run during /commit Phase 1.
# Organized by scope — only runs checks for active scopes.
quality_checks:
  <scope-name>:
    - name: "Check Name"         # Display name
      command: "shell command"    # Command to run (exit 0 = pass, non-zero = fail)

# Diff scan rules check the actual diff content.
# Applied globally (not scoped).
diff_scan:
  - pattern: "regex"             # Regex pattern to search for in diff
    files: "*.ts,*.js"           # Comma-separated file globs to check
    exclude: "*.test.*"          # Comma-separated file globs to exclude
    severity: CRITICAL           # CRITICAL or WARNING
    message: "Human-readable"    # Message shown in review output

# Conventional commit configuration.
commit:
  types: [feat, fix, ...]       # Allowed commit type prefixes
  format: "type(scope): msg"    # Commit message format hint

# Codeloop behavior settings.
codeloop:
  critical_frequency: 3          # Gotcha freq at or above this → CRITICAL in review
  promote_frequency: 10          # Suggest promoting to rules.md at this freq
  max_knowledge_lines: 200       # Warn when knowledge files exceed this line count
```

## Scopes

Scopes are the key mechanism for keeping reviews focused. When you commit, `/commit` maps each changed file to scopes, then loads only the matching gotcha and pattern sections.

Example: If you only changed files in `app/`, and your config has:

```yaml
scopes:
  frontend:
    paths: ["app/**", "components/**"]
    gotcha_sections: ["Frontend", "React"]
```

Then `/commit` only loads gotchas from the "Frontend" and "React" sections — not backend gotchas.

### Path Matching

Paths use glob patterns. A file matches a scope if it matches any of the scope's path patterns.

### Multiple Scopes

A file can match multiple scopes. All matching scopes' sections are loaded.

### No Config Fallback

If `config.yaml` doesn't exist or has no scopes, `/commit` loads all gotchas and patterns (equivalent to a single "all" scope).

## Quality Checks

Quality checks are shell commands that should exit 0 on success. Any non-zero exit is reported as a CRITICAL finding.

Pipe output through `| tail -20` to keep the review output manageable.

## Diff Scan

Diff scan rules search the actual diff content (not just file names). They're useful for catching:

- Debug statements (console.log, print, pdb)
- Security issues (.env files, hardcoded secrets)
- Style violations (explicit `any` types, TODO comments)

The `exclude` field prevents false positives in test files.

## Codeloop Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `critical_frequency` | 3 | Gotchas at this freq → CRITICAL in review |
| `promote_frequency` | 10 | Suggest moving to rules.md |
| `max_knowledge_lines` | 200 | Warn in `codeloop status` if exceeded |
