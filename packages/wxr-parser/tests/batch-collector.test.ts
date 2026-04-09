import { describe, it, expect, vi } from "vitest";
import { BatchCollector } from "../src/batch-collector.js";

describe("BatchCollector", () => {
  it("flushes when batch size is reached", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<number>({ batchSize: 3, onFlush });

    collector.add(1);
    collector.add(2);
    expect(onFlush).not.toHaveBeenCalled();

    collector.add(3);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("does not flush below batch size", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<string>({ batchSize: 5, onFlush });

    collector.add("a");
    collector.add("b");
    collector.add("c");

    expect(onFlush).not.toHaveBeenCalled();
    expect(collector.bufferSize).toBe(3);
  });

  it("finalize() flushes remaining items", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<number>({ batchSize: 10, onFlush });

    collector.add(1);
    collector.add(2);
    collector.finalize();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([1, 2]);
  });

  it("finalize() returns total count", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<number>({ batchSize: 2, onFlush });

    collector.add(1);
    collector.add(2); // flush: 2
    collector.add(3);
    const total = collector.finalize(); // flush remaining: 1

    expect(total).toBe(3);
  });

  it("accumulates totalProcessed across multiple flushes", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<number>({ batchSize: 2, onFlush });

    collector.add(1);
    collector.add(2); // flush
    expect(collector.totalProcessed).toBe(2);

    collector.add(3);
    expect(collector.totalProcessed).toBe(3); // 2 flushed + 1 buffered

    collector.add(4); // flush
    expect(collector.totalProcessed).toBe(4);
  });

  it("bufferSize reports current buffer length", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<number>({ batchSize: 3, onFlush });

    expect(collector.bufferSize).toBe(0);
    collector.add(1);
    expect(collector.bufferSize).toBe(1);
    collector.add(2);
    expect(collector.bufferSize).toBe(2);
    collector.add(3); // flush
    expect(collector.bufferSize).toBe(0);
  });

  it("empty finalize returns 0", () => {
    const onFlush = vi.fn();
    const collector = new BatchCollector<number>({ batchSize: 5, onFlush });

    const total = collector.finalize();
    expect(total).toBe(0);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("flush callback receives a copy, not the internal buffer", () => {
    let captured: number[] = [];
    const collector = new BatchCollector<number>({
      batchSize: 2,
      onFlush: (items) => { captured = items; },
    });

    collector.add(1);
    collector.add(2); // flush
    expect(captured).toEqual([1, 2]);

    // Adding more items should not mutate the previously flushed array
    collector.add(3);
    expect(captured).toEqual([1, 2]);
  });
});
