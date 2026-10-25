# Rs-harness

Personal harness for [rs-sdk](https://github.com/MaxBittker/rs-sdk), a TypeScript SDK and server
emulator for building RuneScape-style bots, played through Claude Code.
rs-sdk is pinned as a git submodule in `rs-sdk/`. Your bots live in `bots/` here, so your
scripts and notes stay in this repo.

## What you need

- **git**
- **[Bun](https://bun.sh)** (the setup script installs it if it's missing)
- **[Claude Code](https://code.claude.com)**: `npm install -g @anthropic-ai/claude-code`
- A browser. The MCP server opens a game client tab for each bot.

## Setup (once)

```powershell
# Windows (PowerShell)
git clone --recurse-submodules https://github.com/RadfordPublic/Rs-harness.git
cd Rs-harness
.\setup.ps1 mybotname          # bot name: up to 12 letters/numbers, must be unused on the demo server
```

```sh
# Linux / macOS
git clone --recurse-submodules https://github.com/RadfordPublic/Rs-harness.git
cd Rs-harness
./setup.sh mybotname
```

Leave out the bot name to just install. Add `--local` to point the bot at a local server instead of
the public demo server (`rs-sdk-demo.fly.dev`).

If PowerShell blocks the scripts, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## Play

```powershell
.\play.ps1                                   # or ./play.sh
.\play.ps1 "skip the tutorial on mybotname and chop some trees"
```

This starts Claude Code inside `rs-sdk/`, which picks up the project's `CLAUDE.md` and the
`rs-agent` MCP server. **Approve the MCP server when Claude Code asks.** Claude then drives the bot
with `execute_code`, which opens the browser game client on its own. Keep that tab open.

When you exit Claude Code, your bots are copied back into `bots/` here. Commit them when you're happy.

### Running a saved script without Claude

Standalone scripts need a game client attached. Use either the browser tab from above or the
headless client:

```powershell
.\client.ps1 mybotname                      # terminal 1: leave running
cd rs-sdk; bun bots/mybotname/script.ts     # terminal 2
bun sdk/cli.ts mybotname                    # check position, inventory, skills
```

## Layout

| Path | What |
|---|---|
| `rs-sdk/` | Upstream rs-sdk (submodule). Don't edit it here. |
| `bots/<name>/` | Your bot scripts and `lab_log.md`, tracked in git. `bot.env` is gitignored. |
| `tools/bots-sync.ts` | `save` copies `rs-sdk/bots` to `bots/`; `restore` copies the other way. |
| `setup.*` / `play.*` / `client.*` | Setup, launch Claude, start a headless client. |

> **Back up `bot.env`.** It holds your bot's password, and it is kept out of git on purpose because
> this repo may be public. If you lose it, you lose the account.

## Updating rs-sdk

```sh
git submodule update --remote rs-sdk
cd rs-sdk && bun install && cd server/webclient && bun install
cd ../../.. && git commit -am "Bump rs-sdk"
```

Update when a script fails with "Client out of date" or the lite client exits with code 3. That
means the server moved to a newer game revision.

## Running your own server (optional)

You get faster tick rates and no shared demo server. See the
[rs-sdk README](https://github.com/MaxBittker/rs-sdk#running-the-server-locally). In short, run the
engine, webclient and gateway in three terminals, then create bots with `--local`.
