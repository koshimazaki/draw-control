# Motion Studio

A browser motion studio: a neutral mannequin dances to your track, an agent edits the moves phase by phase, and the result exports as a guide clip that video models can follow.

Status: planning. Nothing is built yet; the documents below are the plan.

- [Product requirements](docs/PRD.md)
- [Implementation plan](docs/plan.md)

Companion repo: **model-arena**, which plays a guide's results from several video models side by side. The two share files (the guide bundle), not code.

## Levels

| Level | What you do | Needs |
| --- | --- | --- |
| L0 | Open the page, pick a move, play, export the guide | nothing |
| L1 | Load your track for the beat grid, edit phases on the timeline, let an agent edit the recipe | an agent (CLI or MCP) |
| L2 | Send the guide to video models | your own provider key |
| L3 | Generate motion with MotionBricks on serverless GPUs; import a dancer from video | a serverless account |

Licence: MIT. No Mixamo files, motion datasets or body models ship in this repo; you load your own.
