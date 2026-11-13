/**
 * The prompt before Run: the chosen model's composed prompt with the
 * reference tags it uses, a line on what it takes from the guide, a link to
 * its prompting guide, and "Compare prompts" with Kling, Seedance and MiniMax
 * side by side for the same shot. Pure DOM from `previewPrompt`, so the
 * preview is exactly the prompt `planGuideLane` sends.
 */
import type { GuideShot } from "../../../../providers/runware-api/guide-bundle.ts";
import { type GuideFacts } from "../../../../providers/runware-api/guide-plan.ts";
export interface PreviewInput {
    shot: GuideShot | null;
    override: string;
    model: string;
    facts: GuideFacts;
}
/** The preview block; empty with a hint until the shot has a subject. */
export declare function promptPreview(i: PreviewInput): HTMLElement;
