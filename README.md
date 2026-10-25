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
.\setup.ps1 mybotname          # bot name: up to 12 letters/numbers, unique on its server
```

```sh
# Linux / macOS
git clone --recurse-submodules https://github.com/RadfordPublic/Rs-harness.git
cd Rs-harness
./setup.sh mybotname
```

Leave out the bot name to just install. New bots point at your local server (`server.ps1`, see
below) by default; add `--demo` to use the public demo server (`rs-sdk-demo.fly.dev`) instead.

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
| `setup.*` / `play.*` / `client.*` / `server.*` / `watch.*` | Setup, launch Claude, start a headless client, run a local server, open a bot in your browser. |
| `share.*` | Share your local server with friends over Tailscale. |

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

You can run the whole game on your PC. It's private, keeps no data on anyone else's server, and can
run faster than the demo server.

```powershell
.\server.ps1                    # or ./server.sh. Leave it running.
.\setup.ps1 mybot               # in another terminal: bots point at localhost by default
.\play.ps1                      # play as normal
```

The first start builds the browser client and packs the game data, which takes a few minutes. Wait
for `World ready: Visit http://localhost:8888/rs2.cgi`. The gateway (`ws://localhost:7780`) runs in a
second window on Windows, or in the background on Linux/macOS.

- **Faster game:** set `NODE_TICKRATE=200` (or as low as `30`) in `rs-sdk/server/engine/.env`, or
  type `::speed 100` in-game. The default is 400 ms per tick.
- **Bots are per server.** A local bot doesn't exist on the demo server and vice versa. Create a
  separate one with `--demo` for the demo server, or edit `SERVER=` in its `bot.env`.
- Local accounts and saves are kept in `rs-sdk/server/engine/data/`.

### Letting friends connect (Tailscale)

[Tailscale](https://tailscale.com) gives your server a private HTTPS address without opening router
ports. The free plan covers a handful of friends.

```powershell
winget install Tailscale.Tailscale   # once, then sign in: tailscale up
.\share.ps1                          # or ./share.sh, while server.ps1 is running
```

It prints your address, e.g. `https://mypc.tail1234.ts.net`. Invite friends to your tailnet from the
Tailscale admin console (or share just this machine). They install Tailscale, then:

- **Play in a browser:** `https://mypc.tail1234.ts.net/rs2.cgi`
- **Run bots:** `.\setup.ps1 theirbot --server=mypc.tail1234.ts.net`

`.\share.ps1 -Public` uses Tailscale Funnel instead, so anyone with the link can connect without
installing Tailscale. `.\share.ps1 -Stop` stops sharing. Sharing only works while your PC and
`server.ps1` are running. The first run may ask you to enable HTTPS certificates for your tailnet.
