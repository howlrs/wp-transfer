import type { Readable } from "node:stream";
import sax from "sax";
import type { Tag } from "sax";

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
 * Parse a WXR XML stream using SAX, dispatching events to collectors.
 *
 * sax.createStream(strict=false) is used because WXR exports are not
 * strictly valid XML. strict=false also means sax does NOT resolve
 * external entities, which provides XXE safety by default.
 */
export function createWxrSaxStream(
  stream: Readable,
  collectors: WxrCollector[],
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
      // sax can recover from errors in non-strict mode; resume parsing
      saxStream._parser.error = null as unknown as Error;
      saxStream._parser.resume();
    });

    saxStream.on("end", () => {
      resolve();
    });

    stream.on("error", (err: Error) => {
      reject(err);
    });

    stream.pipe(saxStream);
  });
}
