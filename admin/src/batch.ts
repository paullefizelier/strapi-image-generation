import type { Asset, GenerateInput } from "./types";

/**
 * The batch: one description, then one reframe per extra ratio.
 *
 * This lives outside the component because it is the part that spends money,
 * and money logic that only exists inside a React callback is money logic
 * nobody tests. It shipped once with no way to stop it: the editor could close
 * the dialog and the loop kept issuing paid renders — up to a dollar of images
 * they believed they had cancelled.
 *
 * Cancelling therefore means "start nothing further", checked BEFORE each
 * render. The render already in flight is deliberately left to finish and be
 * saved: it is paid for either way, and throwing away an image the editor has
 * already been charged for is a worse outcome than one extra asset.
 */

export interface ReframeOptions {
  model?: string;
  imageSize?: string;
}

export interface BatchHandlers {
  generate: (input: GenerateInput) => Promise<{ asset: Asset }>;
  /** Polled before each render. True once the editor has asked to stop. */
  cancelled?: () => boolean;
  /** Turns a thrown value into something an editor can read. */
  describeError?: (error: unknown) => string;
  onStep?: (ratio: string) => void;
  onPrimary?: (asset: Asset) => void;
  onVariant?: (asset: Asset) => void;
  onFailed?: (ratio: string, message: string) => void;
}

export interface Failure {
  ratio: string;
  message: string;
}

export interface ReframeOutcome {
  variants: Asset[];
  /** Ratios that were attempted and came back wrong. */
  failed: Failure[];
  /** Ratios never attempted, because the editor stopped. */
  skipped: string[];
}

export interface BatchOutcome extends ReframeOutcome {
  primary: Asset;
}

const defaultDescribe = (error: unknown): string =>
  (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
    ?.message ?? String((error as Error)?.message ?? error);

/**
 * Decline one existing asset into further ratios, one call at a time.
 *
 * Sequential on purpose: the API draws one ratio per call, and several
 * 55-second renders inside one request would pass the proxy timeout. One
 * request per ratio also means a failure on the third keeps the first two.
 */
export async function runReframes(
  sourceFileId: number,
  ratios: string[],
  options: ReframeOptions,
  handlers: BatchHandlers,
): Promise<ReframeOutcome> {
  const { generate, cancelled, describeError = defaultDescribe, onStep, onVariant, onFailed } =
    handlers;

  const variants: Asset[] = [];
  const failed: Failure[] = [];
  const skipped: string[] = [];

  for (const [index, ratio] of ratios.entries()) {
    if (cancelled?.()) {
      skipped.push(...ratios.slice(index));
      break;
    }
    onStep?.(ratio);
    try {
      const { asset } = await generate({
        reframeOf: sourceFileId,
        aspectRatio: ratio,
        model: options.model,
        imageSize: options.imageSize,
      });
      variants.push(asset);
      onVariant?.(asset);
    } catch (error) {
      const message = describeError(error);
      failed.push({ ratio, message });
      onFailed?.(ratio, message);
    }
  }

  return { variants, failed, skipped };
}

/** The primary render, then its declinations. Throws only if the primary fails. */
export async function runBatch(
  primary: GenerateInput,
  extraRatios: string[],
  handlers: BatchHandlers,
): Promise<BatchOutcome> {
  handlers.onStep?.(primary.aspectRatio ?? "");
  const { asset } = await handlers.generate(primary);
  handlers.onPrimary?.(asset);

  const outcome = await runReframes(
    asset.id,
    extraRatios,
    { model: primary.model, imageSize: primary.imageSize },
    handlers,
  );
  return { primary: asset, ...outcome };
}
