/**
 * BVMD Conversion Core
 * Worker-safe BVMD conversion logic
 * Attempts to use babylon-mmd with NullEngine in worker context
 * Used by both offscreen worker and SharedWorker
 */

export class BVMDConversionCore {
    /**
     * Convert VMD ArrayBuffer to BVMD ArrayBuffer
     * @param {ArrayBuffer} vmdData - VMD file data
     * @param {Scene} scene - Babylon scene (with NullEngine for workers)
     * @param {string} filename - Optional filename for debugging
     * @returns {Promise<ArrayBuffer>} BVMD data
     */
    static async convertVMDToBVMD(vmdData, scene, filename = 'lipsync.vmd') {
        try {
            // Dynamically import babylon-mmd modules
            // This allows the code to work in both main thread and worker contexts
            const { VmdLoader } = await import('babylon-mmd/esm/Loader/vmdLoader');
            const { BvmdConverter } = await import('babylon-mmd/esm/Loader/Optimized/bvmdConverter');
            
            console.log(`[BVMDCore] Converting VMD to BVMD (${vmdData.byteLength} bytes)`);
            
            // Create VmdLoader
            const vmdLoader = new VmdLoader(scene);
            vmdLoader.loggingEnabled = false;
            
            // Create a File object from ArrayBuffer (VmdLoader expects File)
            const vmdBlob = new Blob([vmdData], { type: 'application/octet-stream' });
            const vmdFile = new File([vmdBlob], filename, { type: 'application/octet-stream' });
            
            // Load VMD using babylon-mmd's VmdLoader
            const animation = await vmdLoader.loadAsync(filename, [vmdFile]);
            
            console.log('[BVMDCore] VMD loaded, converting to BVMD...');
            
            // Convert to BVMD using BvmdConverter
            const bvmdArrayBuffer = BvmdConverter.Convert(animation);
            
            console.log(`[BVMDCore] BVMD created (${bvmdArrayBuffer.byteLength} bytes)`);
            
            return bvmdArrayBuffer;
            
        } catch (error) {
            console.error('[BVMDCore] Conversion failed:', error);
            throw new Error(`Failed to convert VMD to BVMD: ${error.message}`);
        }
    }

    /**
     * Create a minimal Babylon scene for BVMD conversion in worker context
     * Returns null if Babylon is not available or fails to initialize
     */
    static async createWorkerScene() {
        try {
            const { Scene } = await import('@babylonjs/core/scene');
            const { NullEngine } = await import('@babylonjs/core/Engines/nullEngine');
            
            console.log('[BVMDCore] Creating NullEngine for worker context...');
            const engine = new NullEngine();
            const scene = new Scene(engine);
            
            console.log('[BVMDCore] Worker scene created successfully');
            return scene;
        } catch (error) {
            console.error('[BVMDCore] Failed to create worker scene:', error);
            return null;
        }
    }
}
