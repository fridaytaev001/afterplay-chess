# Afterplay Chess — an opponent that remembers

Import your Chess.com games or a PGN export, inspect your playing habits, and challenge a model conditioned on that history. This is a new chess demo building on the context-based memory idea from Afterplay's Quoridor prototype.

## Deploy on Vercel

Import the `main` branch of `fridaytaev001/afterplay-chess`. Keep **Root Directory** as `./`, set **Framework Preset** to **Other**, and **Output Directory** to `public`. The included `vercel.json` disables installation and building; this demo has no npm dependencies.

In project environment variables, add:

```text
AI_GATEWAY_API_KEY=your Vercel AI Gateway key
AI_MODEL=anthropic/claude-sonnet-4.5
```

`AI_MODEL` is optional. Keep API keys in Vercel or a local `.env.local`, never in browser code or a commit. Deploy again after changing environment variables. The key needs usable AI Gateway credits.

Vercel deployments can also authenticate using a deployment-provided `VERCEL_OIDC_TOKEN` environment variable. An explicit Gateway API key takes precedence. Request headers and request-context tokens are never used as credentials. The status endpoint reports the authentication method but never the credential. If neither environment credential is available, configure the Gateway API key and redeploy.

## Multi-modal track routing

Two models run through AI Gateway: `anthropic/claude-sonnet-4.5` for the text-based counter-plan, and `google/gemini-2.5-flash-lite` for fast, lower-cost moves from a board PNG and text game context. `AI_STRATEGY_MODEL`/`AI_MODEL` and `AI_MOVE_MODEL` optionally override these defaults; keep them distinct and vision-capable.

The player can choose Fast & economical or Deliberate move routing. Fast requests prefer Gemini with an 8-second timeout; deliberate analysis prefers Sonnet with a 14-second timeout. Moves have a 500-output-token cap; analysis has a 1,200-token cap. These choices bound latency and output spend; actual response time and token use are shown for each successful call.

HTTP failures, timeouts, malformed JSON, and invalid shortlisted moves automatically try the alternate model. Results show the preferred and used model, each attempt, elapsed time, and usage. If both models fail, the position is retained and the player can retry or explicitly select engine practice. The Simulate primary outage checkbox skips the preferred request and sends a real request to the fallback model; the UI labels the outage as simulated.

For judging, use the synthetic sample, build memory (Sonnet), select AI with memory, play a move (Gemini), then check Simulate primary outage and play another move to demonstrate the fallback. Synthetic game history is labeled; model calls use the real configured Gateway key.

For a new copy, Vercel supports cloning a repository subdirectory:

[Deploy the chess demo](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffridaytaev001%2Fafterplay-chess&project-name=afterplay-chess&repository-name=afterplay-chess-demo&env=AI_GATEWAY_API_KEY&envDescription=Vercel%20AI%20Gateway%20key%20for%20the%20adaptive%20opponent)

The key is configured server-side. Engine practice remains available when AI is unconfigured; it is explicitly labeled and never substituted for a failed model request.

## Run locally

Install Node.js 22.9 or newer. No npm install is required. From this directory:

```sh
node --env-file-if-exists=.env.local server.mjs
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` and fill in your Gateway key to enable AI. Local binding is loopback only.

## Use it

1. Enter your public Chess.com username and import. The server checks up to three recent monthly archives, sequentially, and selects up to 40 recent standard games.
2. Alternatively, upload or paste a PGN and enter your player name exactly as it appears in White or Black headers. Matching ignores capitalization. Variants and custom-start positions are excluded.
3. Inspect opening choices, early queen activity, castling timing, and flank pawn movement. Each percentage displays its numerator and denominator.
4. Select **Build opponent memory**. The model produces conditional counter-plans with evidence references and limitations.
5. Open **Play a game**, select **AI · with your memory**, and start. You can play White or Black, choose a promotion piece, take back a turn, and export your game.
6. Compare one current position with and without memory. Both model calls see the same board, recent moves, and shortlisted candidates. The comparison does not apply a move. If the human is to move, it compares choices for that human color; the panel labels the side explicitly.
7. Add a practice game to memory when you want to update the observed profile. It clears the old counter-plan so you can rebuild it. Unfinished games are labeled as unfinished.

**Synthetic sample games** are fixtures for trying the interface. They are not real user results, benchmarks, or evidence of improved performance.

## How adaptation works

- chess.js validates chess rules and parses PGN.
- A small iterative alpha-beta search ranks legal moves using material and positional heuristics. It returns up to six candidates within 80 approximate evaluation points of its top choice. These are prototype search scores, not Stockfish centipawns.
- The language model receives those candidates, a PNG image of the current board, the authoritative FEN, recent moves, and (in adapted mode) the imported player profile and counter-plan. It chooses an exact candidate UCI move. Browser play sends both image and text to a vision-capable model; direct API clients may omit the image for text-only use.
- The server validates that selection again. Invalid responses and network/model failures are errors; the UI retains the position and offers retry.
- Model weights do not change. There is no fine-tuning or self-play training in this version.

The no-memory comparison removes the imported profile and counter-plan, while retaining current-game moves. It is not a test of all forms of memory. Identical decisions are a valid result. Different decisions do not establish improved play, Elo, or win rate. We do not infer tactical mistakes from queen or castling statistics.

This search is intentionally small and may make poor chess decisions. The shortlist can omit a better move. Longer-term work includes a stronger engine, tactical-loss analysis, player-color-specific profiles, and controlled outcome evaluation.

## Data and keys

Imported history and counter-plans are saved in browser localStorage. The import endpoint uses Chess.com's read-only public API. Building a counter-plan sends imported PGN to this app's server, which computes a profile. Model calls send a summarized profile and up to ten game evidence records, not raw PGN. During play, a generated image of the current board, its FEN, and recent moves also go to the model. The backend does not persist a player database.

The status endpoint indicates whether a Gateway key is configured; it does not verify that the key or credits work. The first AI request validates that connection in practice. A public demo uses the project owner's Gateway credits; configure usage controls in the provider dashboard before broader distribution.

## Validation

```sh
node --test tests/app.test.mjs
node --check public/app.js
```

18 checks cover PGN parsing and names, malformed input, custom positions, standard move-generation counts, castling, en passant, underpromotion, candidate legality, explicit no-key handling, server-side authorization, text/image request content, memory-condition separation, rejecting illegal model choices, Chess.com import URL validation, and HTTP request handling.

Model and import integration checks use mocked network responses. Desktop and mobile browser checks passed for sample import, profile rendering, move selection, an engine reply, undo, game evidence, browser-memory restoration, and the missing-key message. Browser QA used in-process HTTP routing because this environment blocks loopback requests. Live Chess.com fetches, real Gateway inference, and Vercel deployment remain unverified. A prototype that passes these checks is not evidence of superior chess strength.

## Three-minute demo

- **0:00–0:20:** “I built an opponent that remembers how I play. Today I brought Afterplay from Quoridor into chess.”
- **0:20–0:55:** Import your own games and point to one measured habit with its sample count.
- **0:55–1:20:** Generate a counter-plan and show which games support it.
- **1:20–2:10:** Start a match and show a model-selected legal move and its stated rationale.
- **2:10–2:40:** Compare the same position with and without player history. Report the actual result, including matching decisions.
- **2:40–3:00:** Explain context-based adaptation and the engine/model division. State what was built today versus the prior project.

Suggested submission description: “Afterplay Chess turns your public Chess.com games into a playing-style profile and an opponent prepared for your habits. It imports game history, exposes evidence behind each pattern, and uses Vercel AI Gateway to select legal moves with and without player memory.”

Suggested track: **Multi-modal Apps**. Browser play supplies a board image and text-based game context to the model. The current build does not run autonomous background work. Confirm how new work on an existing project is treated before submitting.

## References and license

- [Chess.com public API](https://www.chess.com/news/view/published-data-api)
- [Vercel AI Gateway REST API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/rest-api)
- [chess.js](https://github.com/jhlywa/chess.js), vendored from tag `v0.13.4` with the source license retained.

The vendored chess.js file retains Jeff Hlywa's BSD-2-Clause license notice in full. The application code is provided for this hackathon project without an additional license grant; choose a project license before broad open-source distribution.
