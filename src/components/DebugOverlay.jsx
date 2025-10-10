/**
 * DebugOverlay - All-in-one debug component for camera controls and visualization
 * 
 * Features:
 * - Camera movement controls (up/down/left/right)
 * - Zoom controls (in/out)
 * - Toggle axis visualization
 * - Toggle coordinate display
 * - Toggle bounding box
 * - Smooth camera movement (no reloading)
 */

import { useState, useEffect } from 'react';
import * as BABYLON from '@babylonjs/core';

const DebugOverlay = ({ scene, positionManager, embedded = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showAxis, setShowAxis] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, scale: 12 });
  
  // Refs for visualization objects
  const [axisHelper, setAxisHelper] = useState(null);

  // Update coordinates display
  useEffect(() => {
    if (!positionManager || !showCoords) return;
    
    const interval = setInterval(() => {
      setCoords({
        x: positionManager.offset?.x?.toFixed(2) || 0,
        y: positionManager.offset?.y?.toFixed(2) || 0,
        scale: positionManager.modelHeightPx?.toFixed(0) || 500
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [positionManager, showCoords]);

  // Axis visualization
  useEffect(() => {
    if (!scene) return;
    
    if (showAxis && !axisHelper) {
      // Create axis lines
      const axisSize = 20;
      
      // X-axis (red)
      const xAxis = BABYLON.MeshBuilder.CreateLines("xAxis", {
        points: [
          new BABYLON.Vector3(-axisSize, 0, 0),
          new BABYLON.Vector3(axisSize, 0, 0)
        ]
      }, scene);
      xAxis.color = new BABYLON.Color3(1, 0, 0);
      
      // Y-axis (green)
      const yAxis = BABYLON.MeshBuilder.CreateLines("yAxis", {
        points: [
          new BABYLON.Vector3(0, -axisSize, 0),
          new BABYLON.Vector3(0, axisSize, 0)
        ]
      }, scene);
      yAxis.color = new BABYLON.Color3(0, 1, 0);
      
      // Z-axis (blue)
      const zAxis = BABYLON.MeshBuilder.CreateLines("zAxis", {
        points: [
          new BABYLON.Vector3(0, 0, -axisSize),
          new BABYLON.Vector3(0, 0, axisSize)
        ]
      }, scene);
      zAxis.color = new BABYLON.Color3(0, 0, 1);
      
      setAxisHelper({ xAxis, yAxis, zAxis });
    } else if (!showAxis && axisHelper) {
      // Remove axis
      axisHelper.xAxis?.dispose();
      axisHelper.yAxis?.dispose();
      axisHelper.zAxis?.dispose();
      setAxisHelper(null);
    }
  }, [showAxis, scene, axisHelper]);

  // Camera movement functions
  const moveCamera = (direction, amount = 1) => {
    if (!positionManager) return;
    
    const currentOffset = positionManager.offset || { x: 0, y: 0 };
    const newOffset = { ...currentOffset };
    
    switch(direction) {
      case 'up':
        newOffset.y -= amount; // Negative = camera down = model up
        break;
      case 'down':
        newOffset.y += amount; // Positive = camera up = model down
        break;
      case 'left':
        newOffset.x += amount; // Positive = camera right = model left
        break;
      case 'right':
        newOffset.x -= amount; // Negative = camera left = model right
        break;
    }
    
    // Update position manager offset
    positionManager.offset = newOffset;
    positionManager.updateCameraFrustum();
  };

  const zoom = (direction) => {
    if (!positionManager) return;
    
    const currentSize = positionManager.modelHeightPx || 500;
    const currentWidth = positionManager.modelWidthPx || 300;
    const zoomAmount = 50; // Change size by 50px
    const newSize = direction === 'in' 
      ? currentSize + zoomAmount  // Zoom IN = BIGGER (no limit)
      : currentSize - zoomAmount; // Zoom OUT = SMALLER (no limit)
    const newWidth = newSize * 0.6; // Maintain aspect ratio
    
    console.log(`[DebugOverlay] Zooming ${direction}: ${currentSize}px → ${newSize}px`);
    
    // CRITICAL: Calculate current center position
    const oldCenterX = positionManager.positionX + currentWidth / 2;
    const oldCenterY = positionManager.positionY + currentSize / 2;
    
    // Update model size
    positionManager.modelHeightPx = newSize;
    positionManager.modelWidthPx = newWidth;
    
    // CRITICAL: Recalculate position to keep center in same place
    positionManager.positionX = oldCenterX - newWidth / 2;
    positionManager.positionY = oldCenterY - newSize / 2;
    
    // Update camera frustum with new size AND position
    positionManager.updateCameraFrustum();
  };

  const resetCamera = () => {
    if (!positionManager) return;
    
    console.log('[DebugOverlay] Resetting camera to default');
    
    // Reset offset to 0,0
    positionManager.offset = { x: 0, y: 0 };
    
    // Reset size to 500px (default)
    positionManager.modelHeightPx = 500;
    positionManager.modelWidthPx = 300;
    
    positionManager.updateCameraFrustum();
  };

  // If embedded mode, render without wrapper and always visible
  if (embedded) {
    return (
      <>
        {/* Coordinate Display */}
        {showCoords && (
          <div className="mb-4 p-2.5 bg-black/70 text-green-500 font-mono text-xs rounded border border-green-500/30">
            <div>Camera Offset X: {coords.x}</div>
            <div>Camera Offset Y: {coords.y}</div>
            <div>Model Height: {coords.scale}px</div>
          </div>
        )}

        {/* Camera Movement Controls */}
        <div className="mb-4 grid grid-cols-1">
          <div className="text-xs mb-2 text-gray-400 justify-self-start">Camera Movement</div>
          <div className="grid grid-cols-3 gap-1.5 w-[190px] justify-self-center">
            <div></div>
            <button
              onClick={() => moveCamera('up')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              ↑
            </button>
            <div></div>
            
            <button
              onClick={() => moveCamera('left')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              ←
            </button>
            <button
              onClick={resetCamera}
              className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 cursor-pointer text-[10px] transition-all hover:bg-gray-600"
            >
              Reset
            </button>
            <button
              onClick={() => moveCamera('right')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              →
            </button>
            
            <div></div>
            <button
              onClick={() => moveCamera('down')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              ↓
            </button>
            <div></div>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="mb-4">
          <div className="text-xs mb-2 text-gray-400">Zoom</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => zoom('in')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all w-full hover:bg-gray-600"
            >
              Zoom In (+)
            </button>
            <button
              onClick={() => zoom('out')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all w-full hover:bg-gray-600"
            >
              Zoom Out (−)
            </button>
          </div>
        </div>

        {/* Visualization Toggles */}
        <div>
          <div className="text-xs mb-2 text-gray-400">Visualization</div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={showAxis}
                onChange={(e) => setShowAxis(e.target.checked)}
                className="mr-2"
              />
              Show Axis (RGB = XYZ)
            </label>
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={showCoords}
                onChange={(e) => setShowCoords(e.target.checked)}
                className="mr-2"
              />
              Show Coordinates
            </label>
          </div>
        </div>
      </>
    );
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-5 right-5 px-5 py-2.5 bg-gray-800 text-white border-none rounded cursor-pointer z-[1000] text-sm hover:bg-gray-700"
      >
        Show Debug Controls
      </button>
    );
  }

  return (
    <>
      {/* Coordinate Display */}
      {showCoords && (
        <div className="fixed top-5 left-5 p-2.5 bg-black/70 text-green-500 font-mono text-xs rounded z-[1001]">
          <div>Camera Offset X: {coords.x}</div>
          <div>Camera Offset Y: {coords.y}</div>
          <div>Model Height: {coords.scale}px</div>
        </div>
      )}

      {/* Debug Control Panel */}
      <div className="fixed bottom-5 right-5 p-4 bg-black/80 text-white rounded-lg z-[1000]">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2.5">
          <h3 className="m-0 text-base">Debug Controls</h3>
          <button
            onClick={() => setIsVisible(false)}
            className="bg-red-600 text-white border-none rounded px-2.5 py-1 cursor-pointer text-xs hover:bg-red-700"
          >
            Hide
          </button>
        </div>

        {/* Camera Movement Controls */}
        <div className="mb-4">
          <div className="text-xs mb-2 text-gray-400">Camera Movement</div>
          <div className="grid grid-cols-3 gap-1.5 w-[190px]">
            <div></div>
            <button
              onClick={() => moveCamera('up')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              ↑
            </button>
            <div></div>
            
            <button
              onClick={() => moveCamera('left')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              ←
            </button>
            <button
              onClick={resetCamera}
              className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 cursor-pointer text-[10px] transition-all hover:bg-gray-600"
            >
              Reset
            </button>
            <button
              onClick={() => moveCamera('right')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              →
            </button>
            
            <div></div>
            <button
              onClick={() => moveCamera('down')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
            >
              ↓
            </button>
            <div></div>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="mb-4">
          <div className="text-xs mb-2 text-gray-400">Zoom</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => zoom('in')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all w-full hover:bg-gray-600"
            >
              Zoom In (+)
            </button>
            <button
              onClick={() => zoom('out')}
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all w-full hover:bg-gray-600"
            >
              Zoom Out (−)
            </button>
          </div>
        </div>

        {/* Visualization Toggles */}
        <div>
          <div className="text-xs mb-2 text-gray-400">Visualization</div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={showAxis}
                onChange={(e) => setShowAxis(e.target.checked)}
                className="mr-2"
              />
              Show Axis (RGB = XYZ)
            </label>
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={showCoords}
                onChange={(e) => setShowCoords(e.target.checked)}
                className="mr-2"
              />
              Show Coordinates
            </label>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-4 pt-2.5 border-t border-gray-600 text-[10px] text-gray-500">
          💡 Arrow keys move model, zoom adjusts size
        </div>
      </div>
    </>
  );
};

export default DebugOverlay;
