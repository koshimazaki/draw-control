/**
 * Track analysis off the page's thread: a long track (minutes) analyses here so the page keeps
 * drawing and playing. It runs the same core analysis as the page (no second analyser).
 */
import { analyseSamples, waveformMinMax } from "@motion-studio/core/internal";

self.onmessage = (e: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  const { channels, sampleRate } = e.data;
  try {
    const features = analyseSamples(channels, sampleRate), wave = waveformMinMax(channels, sampleRate);
    (self as unknown as Worker).postMessage({ features, wave });
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: (err as Error).message });
  }
};
