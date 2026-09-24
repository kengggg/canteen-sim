/**
 * Binary min-heap on typed arrays, keyed by (ms, kind, entityId, seq) (spec §8.5).
 * Keys are packed into two exact Float64 values: k1 = ms·8 + kind, k2 = entity·2³² + seq.
 */
export class EventQueue {
  private k1: Float64Array;
  private k2: Float64Array;
  private pType: Int32Array;
  private pArg: Int32Array;
  private pStamp: Int32Array;
  private seq = 0;
  size = 0;
  // Fields of the most recently popped event.
  ms = 0;
  kind = 0;
  entity = 0;
  type = 0;
  arg = 0;
  stamp = 0;

  constructor(capacity = 1024) {
    this.k1 = new Float64Array(capacity);
    this.k2 = new Float64Array(capacity);
    this.pType = new Int32Array(capacity);
    this.pArg = new Int32Array(capacity);
    this.pStamp = new Int32Array(capacity);
  }

  private grow(): void {
    const n = this.k1.length * 2;
    const f = (a: Float64Array) => { const b = new Float64Array(n); b.set(a); return b; };
    const i = (a: Int32Array) => { const b = new Int32Array(n); b.set(a); return b; };
    this.k1 = f(this.k1);
    this.k2 = f(this.k2);
    this.pType = i(this.pType);
    this.pArg = i(this.pArg);
    this.pStamp = i(this.pStamp);
  }

  private less(i: number, j: number): boolean {
    const a = this.k1[i], b = this.k1[j];
    return a < b || (a === b && this.k2[i] < this.k2[j]);
  }

  private swap(i: number, j: number): void {
    let t = this.k1[i]; this.k1[i] = this.k1[j]; this.k1[j] = t;
    t = this.k2[i]; this.k2[i] = this.k2[j]; this.k2[j] = t;
    let u = this.pType[i]; this.pType[i] = this.pType[j]; this.pType[j] = u;
    u = this.pArg[i]; this.pArg[i] = this.pArg[j]; this.pArg[j] = u;
    u = this.pStamp[i]; this.pStamp[i] = this.pStamp[j]; this.pStamp[j] = u;
  }

  push(ms: number, kind: number, entity: number, type: number, arg: number, stamp: number): void {
    if (this.size === this.k1.length) this.grow();
    let i = this.size++;
    this.k1[i] = ms * 8 + kind;
    this.k2[i] = entity * 4294967296 + this.seq++;
    this.pType[i] = type;
    this.pArg[i] = arg;
    this.pStamp[i] = stamp;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  peekMs(): number {
    return this.size === 0 ? Infinity : Math.floor(this.k1[0] / 8);
  }

  pop(): boolean {
    if (this.size === 0) return false;
    const k1 = this.k1[0];
    this.ms = Math.floor(k1 / 8);
    this.kind = k1 - this.ms * 8;
    this.entity = Math.floor(this.k2[0] / 4294967296);
    this.type = this.pType[0];
    this.arg = this.pArg[0];
    this.stamp = this.pStamp[0];
    const last = --this.size;
    if (last > 0) {
      this.k1[0] = this.k1[last];
      this.k2[0] = this.k2[last];
      this.pType[0] = this.pType[last];
      this.pArg[0] = this.pArg[last];
      this.pStamp[0] = this.pStamp[last];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < last && this.less(l, m)) m = l;
        if (r < last && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return true;
  }
}
