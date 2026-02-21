
## General

### Never commit secrets [freq:1]
API keys, tokens, passwords in code or config files. Use environment variables or a secrets manager. Even if you "remove it later," git history is forever.

### Merge conflicts need manual review [freq:1]
Auto-resolved merge conflicts (especially in lock files, generated code, or schema files) can silently break things. Always verify the merged result compiles and tests pass.

### File permissions in git [freq:1]
Accidentally committing executable bits (`chmod +x`) on files that don't need it. Check `git diff --stat` for mode changes before committing.
