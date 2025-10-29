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

import { useState, useEffect } from 'react'
import { Icon } from './icons';;
import * as BABYLON from '@babylonjs/core';
import { useConfig } from '../contexts/ConfigContext';

const DebugOverlay = ({ scene, positionManager }) => {
  const { uiConfig, updateUIConfig } = useConfig();
  const [activeTab, setActiveTab] = useState('debug'); // 'debug' or 'config'
  const [showAxis, setShowAxis] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [showPickingBox, setShowPickingBox] = useState(false);
  const [is3DView, setIs3DView] = useState(false);
  const [clipPlaneY, setClipPlaneY] = useState(6.5);
  const [coords, setCoords] = useState({ x: 0, y: 0, scale: 12 });
  
  // Preset editing states
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [boundaryLeft, setBoundaryLeft] = useState(0);
  const [boundaryRight, setBoundaryRight] = useState(0);
  const [boundaryTop, setBoundaryTop] = useState(0);
  const [boundaryBottom, setBoundaryBottom] = useState(0);
  
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

  // Picking box visibility
  useEffect(() => {
    if (!scene) return;
    
    const animationManager = scene.metadata?.animationManager;
    if (!animationManager || !animationManager.pickingBox) return;
    
    // Toggle wireframe visibility via alpha (keeps it pickable)
    const material = animationManager.pickingBox.material;
    if (material) {
      material.alpha = showPickingBox ? 0.3 : 0; // 0.3 = visible, 0 = invisible
    }
  }, [showPickingBox, scene]);

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

  // Toggle 3D view camera
  const toggle3DView = () => {
    if (!scene || !scene.metadata) return;
    
    const mmdCamera = scene.metadata.mmdCamera;
    const arcRotateCamera = scene.metadata.arcRotateCamera;
    
    if (!mmdCamera || !arcRotateCamera) {
      console.warn('[DebugOverlay] Cameras not found in scene metadata');
      return;
    }
    
    const newIs3DView = !is3DView;
    setIs3DView(newIs3DView);
    
    if (newIs3DView) {
      scene.activeCamera = arcRotateCamera;
      console.log('[DebugOverlay] Switched to 3D view camera');
    } else {
      scene.activeCamera = mmdCamera;
      console.log('[DebugOverlay] Switched to MMD camera');
    }
  };

  // Update clipping plane Y value (Portrait Mode)
  const updateClipPlaneY = (newY) => {
    if (!scene || !scene.clipPlane) return;
    
    setClipPlaneY(newY);
    // Update the clipping plane - normal pointing down (0,-1,0) clips below Y
    scene.clipPlane = new BABYLON.Plane(0, -1, 0, newY);
    console.log(`[DebugOverlay] Updated clipping plane to Y = ${newY}`);
  };

  // Update offset values
  const updateOffset = (axis, value) => {
    if (!positionManager) return;
    
    const newOffset = { ...positionManager.offset };
    newOffset[axis] = parseFloat(value);
    
    if (axis === 'x') setOffsetX(value);
    if (axis === 'y') setOffsetY(value);
    
    // Apply new offset
    positionManager.setPositionPixels(
      positionManager.positionX,
      positionManager.positionY,
      positionManager.modelWidthPx,
      positionManager.modelHeightPx,
      positionManager.effectiveHeightPx,
      newOffset
    );
  };

  // Update boundary values
  const updateBoundary = (edge, value) => {
    if (!positionManager) return;
    
    const newBoundaries = { ...positionManager.customBoundaries };
    newBoundaries[edge] = parseFloat(value);
    
    if (edge === 'left') setBoundaryLeft(value);
    if (edge === 'right') setBoundaryRight(value);
    if (edge === 'top') setBoundaryTop(value);
    if (edge === 'bottom') setBoundaryBottom(value);
    
    positionManager.setCustomBoundaries(newBoundaries);
  };

  // Initialize clipPlaneY from scene metadata
  useEffect(() => {
    if (scene?.metadata?.portraitClipPlaneY) {
      setClipPlaneY(scene.metadata.portraitClipPlaneY);
    }
  }, [scene]);

  // Initialize offset and boundary values from positionManager
  useEffect(() => {
    if (!positionManager) return;
    
    if (positionManager.offset) {
      setOffsetX(positionManager.offset.x || 0);
      setOffsetY(positionManager.offset.y || 0);
    }
    
    if (positionManager.customBoundaries) {
      setBoundaryLeft(positionManager.customBoundaries.left || 0);
      setBoundaryRight(positionManager.customBoundaries.right || 0);
      setBoundaryTop(positionManager.customBoundaries.top || 0);
      setBoundaryBottom(positionManager.customBoundaries.bottom || 0);
    }
  }, [positionManager]);

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

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('debug')}
          className={`flex-1 px-3 py-2 rounded text-sm transition-all ${
            activeTab === 'debug' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Debug
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 px-3 py-2 rounded text-sm transition-all ${
            activeTab === 'config' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Preset Config
        </button>
      </div>

      {/* Debug Tab Content */}
      {activeTab === 'debug' && (
        <>
            {/* Camera Movement Controls */}
            <div className="mb-4">
              <div className="text-xs mb-2 text-gray-400">Camera Movement</div>
              <div className="grid grid-cols-3 gap-1.5 w-[190px]">
                <div></div>
                <button
                  onClick={() => moveCamera('up')}
                  className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
                ><Icon name="arrow-up" size={16} /></button>
                <div></div>
                
                <button
                  onClick={() => moveCamera('left')}
                  className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
                ><Icon name="arrow-left" size={16} /></button>
                <button
                  onClick={resetCamera}
                  className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 cursor-pointer text-[10px] transition-all hover:bg-gray-600"
                >
                  Reset
                </button>
                <button
                  onClick={() => moveCamera('right')}
                  className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
                ><Icon name="arrow-right" size={16} /></button>
                
                <div></div>
                <button
                  onClick={() => moveCamera('down')}
                  className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 cursor-pointer text-sm transition-all hover:bg-gray-600"
                ><Icon name="arrow-down" size={16} /></button>
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
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={showPickingBox}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setShowPickingBox(newValue);
                  if (scene?.pickingBox) {
                    scene.pickingBox.isVisible = newValue;
                  }
                }}
                className="mr-2"
              />
              Show Picking Box
            </label>
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={uiConfig.backgroundDetection?.showDebug || false}
                onChange={(e) => updateUIConfig('backgroundDetection.showDebug', e.target.checked)}
                className="mr-2"
              />
              Show Debug Markers
            </label>
            <label className="flex items-center text-xs cursor-pointer hover:text-gray-300">
              <input
                type="checkbox"
                checked={is3DView}
                onChange={toggle3DView}
                className="mr-2"
              />
              3D View (Debug Camera)
            </label>
          </div>
        </div>
          </>
        )}

        {/* Preset Config Tab Content */}
        {activeTab === 'config' && (
          <>
            {/* Portrait Mode Clipping Plane Control */}
            {scene?.clipPlane && (
              <div className="mb-4">
                <div className="text-xs mb-2 text-gray-400">Portrait Mode Clipping</div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-300">
                    Clip Plane Y: {clipPlaneY.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="0.1"
                    value={clipPlaneY}
                    onChange={(e) => updateClipPlaneY(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-[10px] text-gray-500">
                    Adjust where lower body is clipped
                  </div>
                </div>
              </div>
            )}

            {/* Preset Offset Controls */}
            <div className="mb-4">
          <div className="text-xs mb-2 text-gray-400">
            {scene?.metadata?.isPortraitMode ? 'Portrait Offset' : 'Offset'}
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-300">Offset X</label>
              <input
                type="number"
                step="0.1"
                value={offsetX || 0}
                onChange={(e) => updateOffset('x', e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-300">Offset Y</label>
              <input
                type="number"
                step="0.1"
                value={offsetY || 0}
                onChange={(e) => updateOffset('y', e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
              />
            </div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Camera position offset in world units
          </div>
        </div>

        {/* Preset Boundary Controls */}
        <div className="mt-4">
          <div className="text-xs mb-2 text-gray-400">
            {scene?.metadata?.isPortraitMode ? 'Portrait Boundaries' : 'Boundaries'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-300">Left</label>
              <input
                type="number"
                step="1"
                value={boundaryLeft || 0}
                onChange={(e) => updateBoundary('left', e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-300">Right</label>
              <input
                type="number"
                step="1"
                value={boundaryRight || 0}
                onChange={(e) => updateBoundary('right', e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-300">Top</label>
              <input
                type="number"
                step="1"
                value={boundaryTop || 0}
                onChange={(e) => updateBoundary('top', e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-300">Bottom</label>
              <input
                type="number"
                step="1"
                value={boundaryBottom || 0}
                onChange={(e) => updateBoundary('bottom', e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
              />
            </div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Boundary padding (+ = more restrictive, - = less)
          </div>
        </div>
          </>
        )}

        {/* Instructions */}
        <div className="mt-4 pt-2.5 border-t border-gray-600 text-[10px] text-gray-500">
          💡 Arrow keys move model, zoom adjusts size
        </div>
    </>
  );
};

export default DebugOverlay;
