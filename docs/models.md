# Video models: length and frame rate

What the three models Draw Control offers take and give back, checked 14 November 2026. Our guide video is always 24 fps with 24 × seconds + 1 frames (on the 8k+1 grid). Each model's output rate is its own, so the clip readout shows seconds only.

| Model | Clip length | Guide video it accepts | Output fps |
| --- | --- | --- | --- |
| Kling VIDEO 4.0 | 3–30 s (Flash 3–20 s) | 3–30 s, 24–60 fps | **Not published** for 4.0 |
| Seedance 2.5 | 4–30 s, or auto | up to 30 s | **Not published** for 2.5 |
| MiniMax H3 | 4–15 s | 2–15 s (15 s total), 23.976–60 fps | **24 fps**, apparently fixed |

Example 1 runs 14 s: all three take that length (MiniMax H3 is the tightest, at 15 s), but the page's 3 USD limit refuses Seedance 2.5 at 14 s (its estimate is over it; Kling 4.0 is up to 2.63 USD, MiniMax H3 up to 2.95 USD in the fake-provider dev run).

Example 2 runs 12 s: the page's 3 USD limit refuses Seedance 2.5 there too; Kling 4.0 is up to 2.26 USD and MiniMax H3 up to 2.53 USD (fake-provider dev run, 15 Nov 2026).

The lengths and guide limits come from the vendored Model Arena spec (built from Runware's schemas), which marks the output fps of all three as "not stated". None of the three takes an fps setting, and Runware returns no fps field.

## Prompt length and timed prompts

Checked 15 November 2026 against Runware's schemas (`runware.ai/docs/models/<model>/schema.json`, `positivePrompt`) and each model's prompting guide on Runware.

| Model | Prompt limit (schema) | What the guide says | Timed syntax the page writes |
| --- | --- | --- | --- |
| Kling VIDEO 4.0 | 1–26,000 characters | "Put actions on the clock. Seconds like `3–7 s` place each action where you want it in the clip"; long briefs run "overall settings, then timed events, then audio" | `0.0–2.5 s: …` |
| Seedance 2.5 | 2–50,000 characters | The field "allows up to 10,000 characters", and detail drops well before that. Beats as `[0-3s]`, `[3-6s]` windows, continuous, one-second granularity; single points ("at the 5-second mark") also work; not for high-frequency micro-control | `[0-2.5s] …` |
| MiniMax H3 | 2–7,000 characters | No timestamp syntax. Tie moments with "as", "when", "then" ("a thunderclap as the lightning strikes"); keep spoken lines short | `0.0–2.5 s: …` (plain lines; the clauses inside use "as") |

What the page does with this:

- **Field limits** (`SHOT_LIMITS`, core `recipe.ts`): subject and environment 500 characters, action 2000, legend 300. With the reference and camera lines the composed prompt stays under about 4,000 characters, below MiniMax H3's 7,000, the smallest of the three.
- **Per-model check** (`promptWarning` in `generate.ts`): the cost question names a prompt longer than the chosen model takes (Kling 26,000; Seedance 10,000, the guide's figure rather than the schema's 50,000; MiniMax 7,000).
- **Timed** writes Seedance's brackets when Seedance is chosen and plain seconds otherwise. The times have one decimal (block edges sit on beats, often half seconds); Seedance's guide prefers whole seconds, so round there by hand if a window looks too fine.

Sources: [Kling 4.0 prompting](https://runware.ai/docs/models/klingai-video-4-0/guides/prompting) (23 Oct 2026), [Seedance 2.5 prompting](https://runware.ai/docs/models/bytedance-seedance-2-5/guides/prompting) (7 Aug 2026), [MiniMax H3 sound and voice](https://runware.ai/docs/models/minimax-h3/guides/sound-and-voice) (30 Jul 2026); the vendored Model Arena spec carries the same limits (`prompting.maxChars`) and the Seedance rule "Pace beats with time windows such as [0-3s]".

## Sources

- **Kling 4.0:** the launch post gives "native video generation from 3 to 30 seconds" and no fps ([kling.ai/blog/kling-4-ai-video-model](https://kling.ai/blog/kling-4-ai-video-model), 30 Sep 2026). An earlier Kling post with no model version says "1080p/30 fps output" ([kling.ai/blog/fps-motion-intensity-ai-video-quality](https://kling.ai/blog/fps-motion-intensity-ai-video-quality), 5 Dec 2025), so 30 fps is likely but not confirmed for 4.0.
- **Seedance 2.5:** Runware says "frames = duration × the model's frame rate" without a value ([runware.ai/docs/models/bytedance-seedance-2-5](https://runware.ai/docs/models/bytedance-seedance-2-5), 7 Aug 2026). BytePlus prices Seedance 2.0 at "16:9, 24 fps" ([byteplus.com/en/topic/578667](https://www.byteplus.com/en/topic/578667)), and third-party reviews claim 24 fps for 2.5. ByteDance's Ark API may report a `framespersecond` field; that lead is unverified.
- **MiniMax H3:** the model card lists "Output frame rate | 24 FPS" ([huggingface.co/MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)). MiniMax's own guide gives no fps ([platform.minimax.io/docs/guides/video-generation](https://platform.minimax.io/docs/guides/video-generation)).

## To confirm

Run `ffprobe` on a real output of each model (a paid run, so only with the owner's approval) and put the measured fps and frame count in the table.
