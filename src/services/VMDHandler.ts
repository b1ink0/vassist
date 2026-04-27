/**
 * VMD File Handler for Browser
 * Handles reading and writing VMD (Vocaloid Motion Data) files
 * Adapted for use in the Virtual Assistant project
 */

class VMDMorphFrame {
    constructor(name, frame, weight) {
        this.name = name;
        this.frame = frame;
        this.weight = weight;
    }

    toBytes() {
        const buffer = new ArrayBuffer(23);
        const view = new DataView(buffer);
        
        // Encode name to Shift-JIS
        const nameBytes = this.encodeShiftJIS(this.name);
        const nameArray = new Uint8Array(buffer, 0, 15);
        for (let i = 0; i < Math.min(15, nameBytes.length); i++) {
            nameArray[i] = nameBytes[i];
        }
        
        // Frame number (32-bit unsigned int, little-endian)
        view.setUint32(15, this.frame, true);
        
        // Weight (32-bit float, little-endian)
        view.setFloat32(19, this.weight, true);
        
        return new Uint8Array(buffer);
    }

    encodeShiftJIS(str) {
        // Simplified Shift-JIS encoding for Japanese vowels
        const map = {
            'あ': [0x82, 0xA0],
            'い': [0x82, 0xA2],
            'う': [0x82, 0xA4],
            'え': [0x82, 0xA6],
            'お': [0x82, 0xA8]
        };
        
        const bytes = [];
        for (const char of str) {
            if (map[char]) {
                bytes.push(...map[char]);
            } else {
                // Fallback to ASCII
                bytes.push(char.charCodeAt(0));
            }
        }
        return new Uint8Array(bytes);
    }
}

export class VMDFile {
    constructor(modelName = "Model") {
        this.modelName = modelName;
        this.header = new Uint8Array([
            0x56, 0x6F, 0x63, 0x61, 0x6C, 0x6F, 0x69, 0x64, 0x20, 0x4D,
            0x6F, 0x74, 0x69, 0x6F, 0x6E, 0x20, 0x44, 0x61, 0x74, 0x61,
            0x20, 0x30, 0x30, 0x30, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00
        ]); // "Vocaloid Motion Data 0002\0\0\0\0\0"
        this.boneFrames = [];
        this.morphFrames = [];
        this.cameraFrames = [];
        this.lightFrames = [];
        this.shadowFrames = [];
    }

    load(arrayBuffer) {
        const data = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);
        
        // Read header
        this.header = data.slice(0, 30);
        
        // Read model name
        const modelNameBytes = data.slice(30, 50);
        this.modelName = this.decodeShiftJIS(modelNameBytes);
        
        let offset = 50;
        
        // Read bone frames
        const boneCount = view.getUint32(offset, true);
        offset += 4;
        this.boneFrames = [];
        for (let i = 0; i < boneCount; i++) {
            const boneFrame = {
                name: this.decodeShiftJIS(data.slice(offset, offset + 15)),
                frame: view.getUint32(offset + 15, true),
                position: [
                    view.getFloat32(offset + 19, true),
                    view.getFloat32(offset + 23, true),
                    view.getFloat32(offset + 27, true)
                ],
                rotation: [
                    view.getFloat32(offset + 31, true),
                    view.getFloat32(offset + 35, true),
                    view.getFloat32(offset + 39, true),
                    view.getFloat32(offset + 43, true)
                ],
                interpolation: data.slice(offset + 47, offset + 111)
            };
            this.boneFrames.push(boneFrame);
            offset += 111;
        }
        
        // Read morph frames
        const morphCount = view.getUint32(offset, true);
        offset += 4;
        this.morphFrames = [];
        for (let i = 0; i < morphCount; i++) {
            const morph = new VMDMorphFrame(
                this.decodeShiftJIS(data.slice(offset, offset + 15)),
                view.getUint32(offset + 15, true),
                view.getFloat32(offset + 19, true)
            );
            this.morphFrames.push(morph);
            offset += 23;
        }
        
        // Read camera frames
        const cameraCount = view.getUint32(offset, true);
        offset += 4;
        this.cameraFrames = [];
        for (let i = 0; i < cameraCount; i++) {
            this.cameraFrames.push(data.slice(offset, offset + 61));
            offset += 61;
        }
        
        // Read light frames
        const lightCount = view.getUint32(offset, true);
        offset += 4;
        this.lightFrames = [];
        for (let i = 0; i < lightCount; i++) {
            this.lightFrames.push(data.slice(offset, offset + 28));
            offset += 28;
        }
        
        // Read shadow frames (if present)
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

    save() {
        // Calculate total size
        let totalSize = 30 + 20 + 4; // header + model name + bone count
        totalSize += this.boneFrames.length * 111;
        totalSize += 4 + this.morphFrames.length * 23;
        totalSize += 4 + this.cameraFrames.length * 61;
        totalSize += 4 + this.lightFrames.length * 28;
        totalSize += 4 + this.shadowFrames.length * 9;
        
        const buffer = new ArrayBuffer(totalSize);
        const data = new Uint8Array(buffer);
        const view = new DataView(buffer);
        let offset = 0;
        
        // Write header
        data.set(this.header, offset);
        offset += 30;
        
        // Write model name
        const modelNameBytes = this.encodeShiftJIS(this.modelName);
        const modelNameArray = data.subarray(offset, offset + 20);
        for (let i = 0; i < Math.min(20, modelNameBytes.length); i++) {
            modelNameArray[i] = modelNameBytes[i];
        }
        offset += 20;
        
        // Write bone frames
        view.setUint32(offset, this.boneFrames.length, true);
        offset += 4;
        for (const bone of this.boneFrames) {
            const nameBytes = this.encodeShiftJIS(bone.name);
            for (let i = 0; i < Math.min(15, nameBytes.length); i++) {
                data[offset + i] = nameBytes[i];
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
        
        // Write morph frames
        view.setUint32(offset, this.morphFrames.length, true);
        offset += 4;
        for (const morph of this.morphFrames) {
            const morphBytes = morph.toBytes();
            data.set(morphBytes, offset);
            offset += 23;
        }
        
        // Write camera frames
        view.setUint32(offset, this.cameraFrames.length, true);
        offset += 4;
        for (const camera of this.cameraFrames) {
            data.set(camera, offset);
            offset += 61;
        }
        
        // Write light frames
        view.setUint32(offset, this.lightFrames.length, true);
        offset += 4;
        for (const light of this.lightFrames) {
            data.set(light, offset);
            offset += 28;
        }
        
        // Write shadow frames
        view.setUint32(offset, this.shadowFrames.length, true);
        offset += 4;
        for (const shadow of this.shadowFrames) {
            data.set(shadow, offset);
            offset += 9;
        }
        
        return buffer;
    }

    addMorphFrame(name, frame, weight) {
        this.morphFrames.push(new VMDMorphFrame(name, frame, weight));
    }

    getMorphFrames() {
        return this.morphFrames;
    }

    decodeShiftJIS(bytes) {
        // Simplified Shift-JIS decoding
        const map = {
            '0x82A0': 'あ',
            '0x82A2': 'い',
            '0x82A4': 'う',
            '0x82A6': 'え',
            '0x82A8': 'お'
        };
        
        let result = '';
        let i = 0;
        while (i < bytes.length && bytes[i] !== 0) {
            if (bytes[i] === 0x82 && i + 1 < bytes.length) {
                const key = `0x82${bytes[i + 1].toString(16).toUpperCase().padStart(2, '0')}`;
                if (map[key]) {
                    result += map[key];
                    i += 2;
                    continue;
                }
            }
            result += String.fromCharCode(bytes[i]);
            i++;
        }
        return result.replace(/\0/g, '');
    }

    encodeShiftJIS(str) {
        // Simplified Shift-JIS encoding
        const map = {
            'あ': [0x82, 0xA0],
            'い': [0x82, 0xA2],
            'う': [0x82, 0xA4],
            'え': [0x82, 0xA6],
            'お': [0x82, 0xA8]
        };
        
        const bytes = [];
        for (const char of str) {
            if (map[char]) {
                bytes.push(...map[char]);
            } else {
                bytes.push(char.charCodeAt(0));
            }
        }
        return new Uint8Array(bytes);
    }
}
