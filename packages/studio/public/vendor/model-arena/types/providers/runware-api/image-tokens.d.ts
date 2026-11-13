/**
 * Token-priced image models (GPT-Image-2.6, MiniMax H3 Image). Three cases:
 *
 * - A strict bound, from an exact output-token count per image if Runware ever
 *   publishes one (`outputTokensPerImage`). None is published.
 * - An estimate, from approximate counts Runware publishes (`approx`). The
 *   MiniMax H3 Image and Highspeed pages (read 13 Nov 2026) say: output up to
 *   about 4 MP is about 4,100 image tokens, 4K about 16,400, each reference adds
 *   about 2,050 input tokens, and the optimiser's rewritten prompt counts as
 *   text input. The rewrite's length is not published, so the estimate takes
 *   the largest text-token count the published examples imply for the same
 *   mode, then adds a stated margin. It is an estimate, not a strict bound.
 * - Nothing (GPT-Image-2.6: "measure before you budget"). Such a run needs
 *   `allowUnpriced`, and its cap is compared with the highest published example.
 */
import type { CostEstimate } from "../types.ts";
export interface TokenExample {
    mode: string;
    usd: number;
    /** Reference images in the example request (examples.json). */
    references?: number;
    /** Output tokens of the example by the published approximate figures, when it is known which tier it fell in. */
    outputTokens?: number;
}
export interface ApproxTokens {
    /** Approximate output tokens by output area, ascending; above the last entry nothing is published. */
    output: {
        upToPixels: number;
        tokens: number;
        label: string;
        presets?: string[];
    }[];
    /** Approximate input tokens per reference image. */
    perReference: number;
    /** Added on top, as a fraction, because every figure is "about". */
    margin: number;
    source: string;
}
export interface TokenPricing {
    /** USD per token, from `x-pricing.rates[].amount`. */
    rates: {
        textInput: number;
        imageInput: number;
        imageOutput: number;
    };
    /** The same rates as `x-pricing.rates[].display` writes them. */
    ratesText: string;
    /** Runware's published example runs (`x-pricing.examples`), USD. */
    examples: TokenExample[];
    /** An exact output-token count per image, if one is ever published. Unset: none published. */
    outputTokensPerImage?: number;
    /** Exact input tokens per reference image, if published. Unset: none published. */
    inputTokensPerImage?: number;
    /** Approximate counts the model page publishes, for an estimate. */
    approx?: ApproxTokens;
}
export interface TokenQuery {
    /** The prompt; its UTF-8 byte length bounds its token count (a token is at least one byte). */
    prompt?: string;
    references: number;
    width?: number;
    height?: number;
    resolution?: string;
}
/** The strict upper bound in USD, or null when a figure it needs is not published. */
export declare function tokenBound(t: TokenPricing, q: TokenQuery): number | null;
/** The largest text-input token count the published examples of this mode leave unexplained by the image figures. */
export declare function rewriteAllowance(t: TokenPricing, references: number): number;
/** An estimate from approximate published counts, or null when the size is outside them. */
export declare function tokenApprox(t: TokenPricing, q: TokenQuery): CostEstimate | null;
export declare const highestExample: (t: TokenPricing) => number;
export declare const examplesText: (t: TokenPricing) => string;
export declare function tokenEstimate(t: TokenPricing, q: TokenQuery): CostEstimate;
