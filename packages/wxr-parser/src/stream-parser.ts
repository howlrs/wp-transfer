import type { Readable } from "node:stream";
import sax from "sax";
import type { Tag } from "sax";

/**
 * A parse error collected during SAX streaming.
 */
export interface WxrParseError {
  message: string;
  line?: number;
  column?: number;
}

/**
 * Events emitted by the WXR stream parser to collectors.
 */
export interface WxrSaxEvents {
  onOpenTag(tag: Tag): void;
  onCloseTag(name: string): void;
  onText(text: string): void;
  onCdata(cdata: string): void;
}

/**
 * A collector that can receive SAX events.
 */
export interface WxrCollector extends Partial<WxrSaxEvents> {}

/**
 * Internal state tracked by the stream parser.
 */
export interface StreamParserState {
  /** Current element path stack, e.g. ["rss", "channel", "item"] */
  tagStack: string[];
  /** Accumulated text content for the current element */
  textBuffer: string;
}

/**
 * Result returned by createWxrSaxStream, including any collected parse errors.
 */
export interface WxrSaxStreamResult {
  errors: WxrParseError[];
}

/**
 * Parse a WXR XML stream using SAX, dispatching events to collectors.
 *
 * sax.createStream(strict=false) is used because WXR exports are not
 * strictly valid XML. strict=false also means sax does NOT resolve
 * external entities, which provides XXE safety by default.
 */
export function createWxrSaxStream(
  stream: Readable,
  collectors: WxrCollector[],
  onWarning?: (error: WxrParseError) => void,
): Promise<WxrSaxStreamResult> {
  return new Promise<WxrSaxStreamResult>((resolve, reject) => {
    const errors: WxrParseError[] = [];

    const saxStream = sax.createStream(false, {
      lowercase: true,
      trim: false,
    });

    saxStream.on("opentag", (tag: Tag) => {
      for (const c of collectors) {
        c.onOpenTag?.(tag);
      }
    });

    saxStream.on("closetag", (name: string) => {
      for (const c of collectors) {
        c.onCloseTag?.(name);
      }
    });

    saxStream.on("text", (text: string) => {
      for (const c of collectors) {
        c.onText?.(text);
      }
    });

    saxStream.on("cdata", (cdata: string) => {
      for (const c of collectors) {
        c.onCdata?.(cdata);
      }
    });

    saxStream.on("error", (err: Error) => {
      const parseError: WxrParseError = {
        message: err.message,
        line: saxStream._parser.line,
        column: saxStream._parser.column,
      };
      errors.push(parseError);
      onWarning?.(parseError);

      // sax can recover from errors in non-strict mode; clear and resume
      saxStream._parser.error = null as unknown as Error;
      saxStream._parser.resume();
    });

    saxStream.on("end", () => {
      resolve({ errors });
    });

    stream.on("error", (err: Error) => {
      reject(err);
    });

    stream.pipe(saxStream);
  });
}
