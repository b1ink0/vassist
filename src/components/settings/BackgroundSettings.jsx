/**
 * BackgroundSettings Component
 * Custom background image management for Android
 */

import { useState, useRef, useEffect } from 'react';
import Icon from '../icons/Icon';
import Logger from '../../services/LoggerService';
import { backgroundStorageService } from '../../services/BackgroundStorageService';

const BackgroundSettings = ({ isLightBackground }) => {
  const [backgrounds, setBackgrounds] = useState([]);
  const [uploadState, setUploadState] = useState({ uploading: false, error: null });
  const [activeBackgroundId, setActiveBackgroundId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadBackgrounds();
  }, []);

  const loadBackgrounds = async () => {
    try {
      const list = await backgroundStorageService.getBackgroundsList();
      setBackgrounds(list);
      const active = list.find(bg => bg.isActive);
      setActiveBackgroundId(active?.id || null);
    } catch (error) {
      Logger.error('BackgroundSettings', 'Failed to load backgrounds:', error);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    
    setUploadState({ uploading: true, error: null });
    
    try {
      await backgroundStorageService.saveBackground(file);
      await loadBackgrounds();
      setUploadState({ uploading: false, error: null });
    } catch (error) {
      setUploadState({ uploading: false, error: error.message });
    }
  };

  const handleSetActive = async (id) => {
    try {
      await backgroundStorageService.setActiveBackground(id);
      setActiveBackgroundId(id);
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent('backgroundChanged'));
    } catch (error) {
      Logger.error('BackgroundSettings', 'Failed to set active background:', error);
    }
  };

  const handleClear = async () => {
    try {
      await backgroundStorageService.clearActiveBackground();
      setActiveBackgroundId(null);
      await loadBackgrounds();
      window.dispatchEvent(new CustomEvent('backgroundChanged'));
    } catch (error) {
      Logger.error('BackgroundSettings', 'Failed to clear background:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await backgroundStorageService.deleteBackground(id);
      if (activeBackgroundId === id) {
        setActiveBackgroundId(null);
        window.dispatchEvent(new CustomEvent('backgroundChanged'));
      }
      await loadBackgrounds();
    } catch (error) {
      Logger.error('BackgroundSettings', 'Failed to delete background:', error);
    }
  };

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      <h4 className="text-sm font-semibold text-white mb-3">Custom Background</h4>
      
      <p className="text-xs text-white/50 -mt-2 mb-3">
        Upload custom background images for your assistant.
      </p>
      
      {/* Upload Button */}
      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
          className="hidden"
        />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState.uploading}
          className="w-full p-3 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="upload" size={24} className="mx-auto mb-1 text-white/70" />
          <p className="text-sm text-white/90">
            {uploadState.uploading ? 'Uploading...' : 'Upload Background Image'}
          </p>
          <p className="text-xs text-white/50">JPEG, PNG, WebP, GIF (max 10MB)</p>
        </button>

        {uploadState.error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-400/20">
            <p className="text-xs text-red-200">{uploadState.error}</p>
          </div>
        )}
      </div>

      {/* Clear Background Button */}
      {activeBackgroundId && (
        <button
          onClick={handleClear}
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2`}
        >
          <Icon name="x" size={14} />
          Clear Background
        </button>
      )}

      {/* Background List */}
      {backgrounds.length > 0 && (
        <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
          {backgrounds.map((bg) => (
            <div
              key={bg.id}
              className={`relative group rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                bg.isActive 
                  ? 'border-white/50 ring-2 ring-white/20' 
                  : 'border-transparent hover:border-white/30'
              }`}
              onClick={() => handleSetActive(bg.id)}
            >
              <div className="aspect-video bg-white/5">
                {bg.previewUrl && (
                  <img 
                    src={bg.previewUrl} 
                    alt={bg.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                <p className="text-[10px] text-white truncate">{bg.name}</p>
              </div>
              
              {bg.isActive && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <Icon name="check" size={10} className="text-white" />
                </div>
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(bg.id);
                }}
                className="absolute top-1 left-1 w-5 h-5 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
              >
                <Icon name="trash-2" size={10} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BackgroundSettings;
