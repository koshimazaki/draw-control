# Video models: length and frame rate

What the three models Draw Control offers take and give back, checked 14 November 2026. Our guide video is always 24 fps with 24 × seconds + 1 frames (on the 8k+1 grid). Each model's output rate is its own, so the clip readout shows seconds only.

| Model | Clip length | Guide video it accepts | Output fps |
| --- | --- | --- | --- |
| Kling VIDEO 4.0 | 3–30 s (Flash 3–20 s) | 3–30 s, 24–60 fps | **Not published** for 4.0 |
| Seedance 2.5 | 4–30 s, or auto | up to 30 s | **Not published** for 2.5 |
| MiniMax H3 | 4–15 s | 2–15 s (15 s total), 23.976–60 fps | **24 fps**, apparently fixed |

Example 1 runs 14 s: all three take that length (MiniMax H3 is the tightest, at 15 s), but the page's 3 USD limit refuses Seedance 2.5 at 14 s (its estimate is over it; Kling 4.0 is up to 2.63 USD, MiniMax H3 up to 2.95 USD in the fake-provider dev run).

The lengths and guide limits come from the vendored Model Arena spec (built from Runware's schemas), which marks the output fps of all three as "not stated". None of the three takes an fps setting, and Runware returns no fps field.

## Sources

- **Kling 4.0:** the launch post gives "native video generation from 3 to 30 seconds" and no fps ([kling.ai/blog/kling-4-ai-video-model](https://kling.ai/blog/kling-4-ai-video-model), 30 Sep 2026). An earlier Kling post with no model version says "1080p/30 fps output" ([kling.ai/blog/fps-motion-intensity-ai-video-quality](https://kling.ai/blog/fps-motion-intensity-ai-video-quality), 5 Dec 2025), so 30 fps is likely but not confirmed for 4.0.
- **Seedance 2.5:** Runware says "frames = duration × the model's frame rate" without a value ([runware.ai/docs/models/bytedance-seedance-2-5](https://runware.ai/docs/models/bytedance-seedance-2-5), 7 Aug 2026). BytePlus prices Seedance 2.0 at "16:9, 24 fps" ([byteplus.com/en/topic/578667](https://www.byteplus.com/en/topic/578667)), and third-party reviews claim 24 fps for 2.5. ByteDance's Ark API may report a `framespersecond` field; that lead is unverified.
- **MiniMax H3:** the model card lists "Output frame rate | 24 FPS" ([huggingface.co/MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)). MiniMax's own guide gives no fps ([platform.minimax.io/docs/guides/video-generation](https://platform.minimax.io/docs/guides/video-generation)).

## To confirm

Run `ffprobe` on a real output of each model (a paid run, so only with the owner's approval) and put the measured fps and frame count in the table.
