import type { OCRInitInfo, OCRResult } from "./ocrTypes";

/**
 * The only contract the UI knows about. Replace the implementation to swap
 * OCR engines.
 */
export interface OCRProvider {
  readonly name: string;
  initialize(): Promise<OCRInitInfo>;
  getInitInfo(): OCRInitInfo | null;
  recognize(input: Blob): Promise<OCRResult>;
  dispose(): Promise<void>;
}

export class OCRError extends Error {
  readonly stage: "init" | "recognize";
  override readonly cause?: unknown;

  constructor(stage: "init" | "recognize", message: string, cause?: unknown) {
    super(message);
    this.name = "OCRError";
    this.stage = stage;
    this.cause = cause;
  }
}
