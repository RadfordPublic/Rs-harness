# Rs-harness

This repo wraps [rs-sdk](https://github.com/MaxBittker/rs-sdk) (git submodule at `rs-sdk/`).

- Gameplay work (creating bots, writing bot scripts, `execute_code`) happens **inside `rs-sdk/`**:
  its `CLAUDE.md`, `.mcp.json` (rs-agent MCP server) and every SDK path assume that directory as cwd.
  Launch with `./play.sh` / `.\play.ps1` rather than running `claude` here.
- `bots/` in this repo is the git-tracked copy of `rs-sdk/bots/<name>/`. Sync with
  `bun tools/bots-sync.ts save|restore`. Never commit `bot.env` (gitignored; holds the account password).
- Don't commit changes inside `rs-sdk/`; update it by bumping the submodule.
