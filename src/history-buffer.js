/* ===================================================
   history-buffer.js -- Fixed-capacity ring buffer for
   OHLC bar history. Overwrites oldest bars when full.
   =================================================== */

export class HistoryBuffer {
    /**
     * @param {number} capacity  Maximum number of bars stored
     */
    constructor(capacity = 256) {
        this._buf = new Array(capacity);
        this._cap = capacity;
        this._head = 0;   // next write slot
        this._size = 0;   // bars currently stored
        this._offset = 0; // day number of oldest stored bar
    }

    /**
     * Append a bar. Overwrites the oldest bar when at capacity.
     * @param {Object} bar  OHLC bar object { day, open, high, low, close, v, r }
     */
    push(bar) {
        this._buf[this._head] = bar;
        this._head = (this._head + 1) % this._cap;
        if (this._size < this._cap) {
            this._size++;
        } else {
            this._offset++;
        }
    }

    /**
     * Retrieve bar by absolute day index.
     * @param {number} day
     * @returns {Object|undefined}
     */
    get(day) {
        const i = day - this._offset;
        if (i < 0 || i >= this._size) return undefined;
        return this._buf[(this._head - this._size + i + this._cap) % this._cap];
    }

    /**
     * Most recent bar, or undefined if empty.
     * @returns {Object|undefined}
     */
    last() {
        if (this._size === 0) return undefined;
        return this._buf[(this._head - 1 + this._cap) % this._cap];
    }

    /** Total days ever produced (old array.length semantics). */
    get length() { return this._offset + this._size; }

    /** Day number of oldest stored bar. */
    get minDay() { return this._offset; }

    /** Day number of newest stored bar, or -1 if empty. */
    get maxDay() { return this._size > 0 ? this._offset + this._size - 1 : -1; }

    /** Number of bars currently in buffer. */
    get size() { return this._size; }

    /** Reset to empty state. */
    clear() {
        this._head = 0;
        this._size = 0;
        this._offset = 0;
    }

    /**
     * Reverse stored bars in place and re-number days.
     * Used for synthetic backfill: simulate forward from target
     * state, then reverse so history arrives at that state.
     */
    reverse() {
        if (this._size < 2) return;

        // Extract bars in chronological order
        const bars = new Array(this._size);
        for (let i = 0; i < this._size; i++) {
            const idx = (this._head - this._size + i + this._cap) % this._cap;
            bars[i] = this._buf[idx];
        }

        // Reverse and re-number days, swap open/close
        bars.reverse();
        for (let i = 0; i < this._size; i++) {
            const bar = bars[i];
            bar.day = this._offset + i;
            const tmpOpen = bar.open;
            bar.open = bar.close;
            bar.close = tmpOpen;
        }

        // Write back into a clean contiguous layout
        this._head = 0;
        for (let i = 0; i < this._size; i++) {
            this._buf[i] = bars[i];
        }
        this._head = this._size % this._cap;
    }
}
