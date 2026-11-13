/**
 * AudioUtils.ts
 * Adapted from ViBe (vicharanashala/vibe) audio utilities.
 *
 * Includes:
 * 1. WebM duration metadata fixer for Chromium MediaRecorder output
 * 2. Audio level calculation and meter helpers
 */

export function padTime(time: number): string {
  return String(time).padStart(2, "0");
}

export function formatAudioTimestamp(time: number): string {
  const hours = (time / 3600) | 0;
  time -= hours * 3600;
  const minutes = (time / 60) | 0;
  time -= minutes * 60;
  const seconds = time | 0;
  return `${hours ? padTime(hours) + ":" : ""}${padTime(minutes)}:${padTime(seconds)}`;
}

interface Section {
  name: string;
  type: string;
}

const sections: Record<number, Section> = {
  0xa45dfa3: { name: "EBML", type: "Container" },
  0x286: { name: "EBMLVersion", type: "Uint" },
  0x2f7: { name: "EBMLReadVersion", type: "Uint" },
  0x2f2: { name: "EBMLMaxIDLength", type: "Uint" },
  0x2f3: { name: "EBMLMaxSizeLength", type: "Uint" },
  0x282: { name: "DocType", type: "String" },
  0x287: { name: "DocTypeVersion", type: "Uint" },
  0x285: { name: "DocTypeReadVersion", type: "Uint" },
  0x6c: { name: "Void", type: "Binary" },
  0x3f: { name: "CRC-32", type: "Binary" },
  0x8538067: { name: "Segment", type: "Container" },
  0x549a966: { name: "Info", type: "Container" },
  0xad7b1: { name: "TimecodeScale", type: "Uint" },
  0x489: { name: "Duration", type: "Float" },
};

class WebmBase {
  name: string;
  type: string;
  source?: Uint8Array;
  constructor(name: string, type: string) {
    this.name = name;
    this.type = type;
  }
  setSource(source: Uint8Array) {
    this.source = source;
  }
}

class WebmUint extends WebmBase {
  getValue(): number {
    let val = 0;
    for (let i = 0; i < (this.source?.length || 0); i++) {
      val = val * 256 + this.source![i];
    }
    return val;
  }
  setValue(val: number) {
    this.source = new Uint8Array(4);
    for (let i = 3; i >= 0; i--) {
      this.source[i] = val % 256;
      val = Math.floor(val / 256);
    }
  }
}

class WebmFloat extends WebmBase {
  getValue(): number | null {
    if (!this.source || (this.source.length !== 4 && this.source.length !== 8)) return null;
    const view = new DataView(this.source.buffer, this.source.byteOffset, this.source.byteLength);
    return this.source.length === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  }
  setValue(value: number) {
    this.source = new Uint8Array(8);
    const view = new DataView(this.source.buffer);
    view.setFloat64(0, value, false);
  }
}

class WebmContainer extends WebmBase {
  offset = 0;
  data: { id: number; idHex: string; data: WebmBase }[] = [];

  readUint(draft = false): number {
    if (!this.source || this.offset >= this.source.length) return 0;
    let b = this.source[this.offset];
    let width = 0;
    let value = 0;
    while (width < 8 && !(b & (0x80 >> width))) {
      width++;
    }
    width++;
    value = b & (0xff >> width);
    for (let i = 1; i < width; i++) {
      value = value * 256 + this.source[this.offset + i];
    }
    if (!draft) this.offset += width;
    return value;
  }

  setSource(source: Uint8Array) {
    this.source = source;
    this.data = [];
    this.offset = 0;
    while (this.offset < source.length) {
      const id = this.readUint();
      const length = this.readUint();
      if (this.offset + length > source.length) break;
      const data = source.subarray(this.offset, this.offset + length);
      this.offset += length;

      const info = sections[id] || { name: "Unknown", type: "Binary" };
      let ctr = WebmBase;
      if (info.type === "Container") ctr = WebmContainer;
      else if (info.type === "Uint") ctr = WebmUint;
      else if (info.type === "Float") ctr = WebmFloat;

      const section = new ctr(info.name, info.type);
      section.setSource(data);
      this.data.push({ id, idHex: id.toString(16), data: section });
    }
  }

  getSectionById(id: number): WebmBase | undefined {
    return this.data.find((s) => s.id === id)?.data;
  }
}

/**
 * Fixes duration on MediaRecorder output WebM files.
 */
export function webmFixDuration(
  blob: Blob,
  duration: number,
  type = "video/webm"
): Promise<Blob> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.addEventListener("loadend", () => {
        try {
          const result = reader.result as ArrayBuffer;
          const container = new WebmContainer("File", "File");
          container.setSource(new Uint8Array(result));
          const segment = container.getSectionById(0x8538067) as WebmContainer;
          if (segment) {
            const info = segment.getSectionById(0x549a966) as WebmContainer;
            if (info) {
              const dur = info.getSectionById(0x489) as WebmFloat;
              if (dur) dur.setValue(duration);
            }
          }
          resolve(new Blob([result], { type }));
        } catch {
          resolve(blob);
        }
      });
      reader.addEventListener("error", () => resolve(blob));
      reader.readAsArrayBuffer(blob);
    } catch {
      resolve(blob);
    }
  });
}
