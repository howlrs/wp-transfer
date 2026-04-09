/**
 * Batch Collector
 *
 * Wraps any array-based collector with batch flushing to limit memory usage.
 * When the batch size is reached, calls the flush callback and clears the buffer.
 */

export interface BatchCollectorOptions<T> {
  batchSize: number;
  onFlush: (items: T[]) => void;
}

export class BatchCollector<T> {
  private buffer: T[] = [];
  private readonly batchSize: number;
  private readonly onFlush: (items: T[]) => void;
  private totalFlushed = 0;

  constructor(options: BatchCollectorOptions<T>) {
    this.batchSize = options.batchSize;
    this.onFlush = options.onFlush;
  }

  add(item: T): void {
    this.buffer.push(item);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    this.totalFlushed += this.buffer.length;
    this.onFlush([...this.buffer]);
    this.buffer = [];
  }

  /** Flush remaining items and return total count */
  finalize(): number {
    this.flush();
    return this.totalFlushed;
  }

  get bufferSize(): number {
    return this.buffer.length;
  }

  get totalProcessed(): number {
    return this.totalFlushed + this.buffer.length;
  }
}
