/**
 * BVMD Converter Service
 * Converts VMD data to BVMD format using babylon-mmd's BvmdConverter
 * Creates blob URLs for use with AnimationManager's speak() method
 */

import { Scene } from '@babylonjs/core/scene';
import { VmdLoader } from 'babylon-mmd/esm/Loader/vmdLoader';
import { BvmdConverter } from 'babylon-mmd/esm/Loader/Optimized/bvmdConverter';

export class BVMDConverterService {
    constructor(scene) {
        this.scene = scene;
        this.vmdLoader = new VmdLoader(scene);
        this.vmdLoader.loggingEnabled = false; // Disable logging for production
        
        // Track blob URLs for cleanup
        this.blobUrls = new Set();
        
        console.log('[BVMDConverter] Initialized with BVMD version:', BvmdConverter.Version.join('.'));
    }

    /**
     * Convert VMD ArrayBuffer to BVMD blob URL
     * @param {ArrayBuffer} vmdData - VMD file data
     * @param {string} filename - Optional filename for debugging
     * @returns {Promise<string>} BVMD blob URL
     */
    async convertVMDToBVMD(vmdData, filename = 'lipsync.vmd') {
        try {
            console.log(`[BVMDConverter] Converting VMD to BVMD (${vmdData.byteLength} bytes)`);
            
            // Create a File object from ArrayBuffer (VmdLoader expects File)
            const vmdBlob = new Blob([vmdData], { type: 'application/octet-stream' });
            const vmdFile = new File([vmdBlob], filename, { type: 'application/octet-stream' });
            
            // Load VMD using babylon-mmd's VmdLoader
            const animation = await this.vmdLoader.loadAsync(filename, [vmdFile]);
            
            console.log('[BVMDConverter] VMD loaded, converting to BVMD...');
            
            // Convert to BVMD using BvmdConverter
            const bvmdArrayBuffer = BvmdConverter.Convert(animation);
            
            console.log(`[BVMDConverter] BVMD created (${bvmdArrayBuffer.byteLength} bytes)`);
            
            // Create blob and URL
            const bvmdBlob = new Blob([bvmdArrayBuffer], { type: 'application/octet-stream' });
            const bvmdUrl = URL.createObjectURL(bvmdBlob);
            
            // Track for cleanup
            this.blobUrls.add(bvmdUrl);
            
            console.log('[BVMDConverter] BVMD blob URL created:', bvmdUrl);
            
            return bvmdUrl;
            
        } catch (error) {
            console.error('[BVMDConverter] Conversion failed:', error);
            throw new Error(`Failed to convert VMD to BVMD: ${error.message}`);
        }
    }

    /**
     * Convert multiple VMD files to BVMD
     * @param {Array<ArrayBuffer>} vmdDataArray - Array of VMD data
     * @returns {Promise<Array<string>>} Array of BVMD blob URLs
     */
    async convertMultiple(vmdDataArray) {
        const bvmdUrls = [];
        
        for (let i = 0; i < vmdDataArray.length; i++) {
            try {
                const url = await this.convertVMDToBVMD(vmdDataArray[i], `lipsync_${i}.vmd`);
                bvmdUrls.push(url);
            } catch (error) {
                console.error(`[BVMDConverter] Failed to convert VMD ${i}:`, error);
                bvmdUrls.push(null); // Push null for failed conversions
            }
        }
        
        return bvmdUrls;
    }

    /**
     * Clean up blob URLs
     * @param {string|string[]} urls - URL or array of URLs to clean up
     */
    cleanup(urls = null) {
        if (urls === null) {
            // Clean up all tracked URLs
            console.log(`[BVMDConverter] Cleaning up all ${this.blobUrls.size} blob URLs`);
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls.clear();
        } else {
            // Clean up specific URLs
            const urlArray = Array.isArray(urls) ? urls : [urls];
            urlArray.forEach(url => {
                URL.revokeObjectURL(url);
                this.blobUrls.delete(url);
            });
            console.log(`[BVMDConverter] Cleaned up ${urlArray.length} blob URLs`);
        }
    }

    /**
     * Get number of tracked blob URLs
     * @returns {number} Number of URLs
     */
    getTrackedUrlCount() {
        return this.blobUrls.size;
    }
}
