/** FNV-1a 32-bit (spec §8.5): integers as 4 little-endian bytes, floats as 8, null as the canonical NaN. */
export const FNV_OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

const scratch = new DataView(new ArrayBuffer(8));

export class Fnv {
  h = FNV_OFFSET;

  byte(b: number): void {
    this.h = Math.imul(this.h ^ (b & 0xff), PRIME) >>> 0;
  }

  int(n: number): void {
    const v = n | 0;
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  float(x: number | null): void {
    if (x === null) {
      scratch.setUint32(0, 0, true);
      scratch.setUint32(4, 0x7ff80000, true);
    } else {
      scratch.setFloat64(0, x, true);
    }
    for (let i = 0; i < 8; i++) this.byte(scratch.getUint8(i));
  }
}
