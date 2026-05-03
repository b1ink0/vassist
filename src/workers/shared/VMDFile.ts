/**
 * Worker-local VMD file model and serializer.
 * Keeps worker generation independent from app service-layer module resolution.
 */

type ShiftJisMap = Record<string, readonly number[]>;

interface VMDBoneFrame {
  name: string;
  frame: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  interpolation: Uint8Array;
}

const VOWEL_SHIFT_JIS_MAP: ShiftJisMap = {
  あ: [0x82, 0xa0],
  い: [0x82, 0xa2],
  う: [0x82, 0xa4],
  え: [0x82, 0xa6],
  お: [0x82, 0xa8],
};

const SHIFT_JIS_TO_CHAR: Record<string, string> = {
  "0x82A0": "あ",
  "0x82A2": "い",
  "0x82A4": "う",
  "0x82A6": "え",
  "0x82A8": "お",
};

export class VMDMorphFrame {
  name: string;
  frame: number;
  weight: number;

  constructor(name: string, frame: number, weight: number) {
    this.name = name;
    this.frame = frame;
    this.weight = weight;
  }

  toBytes(): Uint8Array {
    const buffer = new ArrayBuffer(23);
    const view = new DataView(buffer);

    const nameBytes = this.encodeShiftJIS(this.name);
    const nameArray = new Uint8Array(buffer, 0, 15);
    for (let i = 0; i < Math.min(15, nameBytes.length); i++) {
      nameArray[i] = nameBytes[i] ?? 0;
    }

    view.setUint32(15, this.frame, true);
    view.setFloat32(19, this.weight, true);

    return new Uint8Array(buffer);
  }

  private encodeShiftJIS(str: string): Uint8Array {
    const bytes: number[] = [];
    for (const char of str) {
      const mapped = VOWEL_SHIFT_JIS_MAP[char];
      if (mapped) {
        bytes.push(...mapped);
      } else {
        bytes.push(char.charCodeAt(0));
      }
    }
    return new Uint8Array(bytes);
  }
}

export class VMDFile {
  modelName: string;
  header: Uint8Array;
  boneFrames: VMDBoneFrame[];
  morphFrames: VMDMorphFrame[];
  cameraFrames: Uint8Array[];
  lightFrames: Uint8Array[];
  shadowFrames: Uint8Array[];

  constructor(modelName = "Model") {
    this.modelName = modelName;
    this.header = new Uint8Array([
      0x56, 0x6f, 0x63, 0x61, 0x6c, 0x6f, 0x69, 0x64, 0x20, 0x4d, 0x6f, 0x74,
      0x69, 0x6f, 0x6e, 0x20, 0x44, 0x61, 0x74, 0x61, 0x20, 0x30, 0x30, 0x30,
      0x32, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    this.boneFrames = [];
    this.morphFrames = [];
    this.cameraFrames = [];
    this.lightFrames = [];
    this.shadowFrames = [];
  }

  load(arrayBuffer: ArrayBuffer): void {
    const data = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    this.header = data.slice(0, 30);

    const modelNameBytes = data.slice(30, 50);
    this.modelName = this.decodeShiftJIS(modelNameBytes);

    let offset = 50;

    const boneCount = view.getUint32(offset, true);
    offset += 4;
    this.boneFrames = [];
    for (let i = 0; i < boneCount; i++) {
      const boneFrame: VMDBoneFrame = {
        name: this.decodeShiftJIS(data.slice(offset, offset + 15)),
        frame: view.getUint32(offset + 15, true),
        position: [
          view.getFloat32(offset + 19, true),
          view.getFloat32(offset + 23, true),
          view.getFloat32(offset + 27, true),
        ],
        rotation: [
          view.getFloat32(offset + 31, true),
          view.getFloat32(offset + 35, true),
          view.getFloat32(offset + 39, true),
          view.getFloat32(offset + 43, true),
        ],
        interpolation: data.slice(offset + 47, offset + 111),
      };
      this.boneFrames.push(boneFrame);
      offset += 111;
    }

    const morphCount = view.getUint32(offset, true);
    offset += 4;
    this.morphFrames = [];
    for (let i = 0; i < morphCount; i++) {
      const morph = new VMDMorphFrame(
        this.decodeShiftJIS(data.slice(offset, offset + 15)),
        view.getUint32(offset + 15, true),
        view.getFloat32(offset + 19, true),
      );
      this.morphFrames.push(morph);
      offset += 23;
    }

    const cameraCount = view.getUint32(offset, true);
    offset += 4;
    this.cameraFrames = [];
    for (let i = 0; i < cameraCount; i++) {
      this.cameraFrames.push(data.slice(offset, offset + 61));
      offset += 61;
    }

    const lightCount = view.getUint32(offset, true);
    offset += 4;
    this.lightFrames = [];
    for (let i = 0; i < lightCount; i++) {
      this.lightFrames.push(data.slice(offset, offset + 28));
      offset += 28;
    }

    if (offset < data.length) {
      const shadowCount = view.getUint32(offset, true);
      offset += 4;
      this.shadowFrames = [];
      for (let i = 0; i < shadowCount; i++) {
        this.shadowFrames.push(data.slice(offset, offset + 9));
        offset += 9;
      }
    }
  }

  save(): ArrayBuffer {
    let totalSize = 30 + 20 + 4;
    totalSize += this.boneFrames.length * 111;
    totalSize += 4 + this.morphFrames.length * 23;
    totalSize += 4 + this.cameraFrames.length * 61;
    totalSize += 4 + this.lightFrames.length * 28;
    totalSize += 4 + this.shadowFrames.length * 9;

    const buffer = new ArrayBuffer(totalSize);
    const data = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;

    data.set(this.header, offset);
    offset += 30;

    const modelNameBytes = this.encodeShiftJIS(this.modelName);
    const modelNameArray = data.subarray(offset, offset + 20);
    for (let i = 0; i < Math.min(20, modelNameBytes.length); i++) {
      modelNameArray[i] = modelNameBytes[i] ?? 0;
    }
    offset += 20;

    view.setUint32(offset, this.boneFrames.length, true);
    offset += 4;
    for (const bone of this.boneFrames) {
      const nameBytes = this.encodeShiftJIS(bone.name);
      for (let i = 0; i < Math.min(15, nameBytes.length); i++) {
        data[offset + i] = nameBytes[i] ?? 0;
      }
      view.setUint32(offset + 15, bone.frame, true);
      view.setFloat32(offset + 19, bone.position[0], true);
      view.setFloat32(offset + 23, bone.position[1], true);
      view.setFloat32(offset + 27, bone.position[2], true);
      view.setFloat32(offset + 31, bone.rotation[0], true);
      view.setFloat32(offset + 35, bone.rotation[1], true);
      view.setFloat32(offset + 39, bone.rotation[2], true);
      view.setFloat32(offset + 43, bone.rotation[3], true);
      data.set(bone.interpolation, offset + 47);
      offset += 111;
    }

    view.setUint32(offset, this.morphFrames.length, true);
    offset += 4;
    for (const morph of this.morphFrames) {
      const morphBytes = morph.toBytes();
      data.set(morphBytes, offset);
      offset += 23;
    }

    view.setUint32(offset, this.cameraFrames.length, true);
    offset += 4;
    for (const camera of this.cameraFrames) {
      data.set(camera, offset);
      offset += 61;
    }

    view.setUint32(offset, this.lightFrames.length, true);
    offset += 4;
    for (const light of this.lightFrames) {
      data.set(light, offset);
      offset += 28;
    }

    view.setUint32(offset, this.shadowFrames.length, true);
    offset += 4;
    for (const shadow of this.shadowFrames) {
      data.set(shadow, offset);
      offset += 9;
    }

    return buffer;
  }

  addMorphFrame(name: string, frame: number, weight: number): void {
    this.morphFrames.push(new VMDMorphFrame(name, frame, weight));
  }

  getMorphFrames(): VMDMorphFrame[] {
    return this.morphFrames;
  }

  setMorphFrames(frames: VMDMorphFrame[]): void {
    this.morphFrames = frames;
  }

  private decodeShiftJIS(bytes: Uint8Array): string {
    let result = "";
    let i = 0;
    while (i < bytes.length && bytes[i] !== 0) {
      const currentByte = bytes[i] ?? 0;
      if (currentByte === 0x82 && i + 1 < bytes.length) {
        const nextByte = bytes[i + 1] ?? 0;
        const key = `0x82${nextByte.toString(16).toUpperCase().padStart(2, "0")}`;
        if (SHIFT_JIS_TO_CHAR[key]) {
          result += SHIFT_JIS_TO_CHAR[key];
          i += 2;
          continue;
        }
      }
      result += String.fromCharCode(currentByte);
      i++;
    }
    return result.replace(/\0/g, "");
  }

  private encodeShiftJIS(str: string): Uint8Array {
    const bytes: number[] = [];
    for (const char of str) {
      const mapped = VOWEL_SHIFT_JIS_MAP[char];
      if (mapped) {
        bytes.push(...mapped);
      } else {
        bytes.push(char.charCodeAt(0));
      }
    }
    return new Uint8Array(bytes);
  }
}
