import { useState, useEffect } from 'react';
import { Button } from '../ui';
import { cn } from '../../utils/cn';
import { useDesktop } from '../../contexts/DesktopContext';

interface DesktopShareSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string;
}

const DesktopScreenShareDialog = () => {
  const { api } = useDesktop();
  const [sources, setSources] = useState<DesktopShareSource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    console.log('DesktopScreenShareDialog mounted, api:', api);
    
    // Listen for sources from main process
    if (api?.ipc) {
      const unsubscribe = api.ipc.on('picker:sources', (sourcesData: unknown) => {
        console.log('Received sources:', sourcesData);
        if (Array.isArray(sourcesData)) {
          setSources(sourcesData as DesktopShareSource[]);
          return;
        }
        setSources([]);
      });

      // Request sources
      console.log('Sending picker:ready');
      api.ipc.send('picker:ready');

      return () => {
        unsubscribe();
      };
    }
  }, [api]);

  const handleSelect = () => {
    if (selectedId && api?.ipc) {
      console.log('Sending picker:select with sourceId:', selectedId);
      api.ipc.send('picker:select', selectedId);
    }
  };

  const handleCancel = () => {
    if (api?.ipc) {
      console.log('Sending picker:cancel');
      api.ipc.send('picker:cancel');
    }
  };

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));

  return (
    <div className="w-full h-screen bg-[#1a1a1a] text-white p-5 overflow-y-auto font-sans">
      <h1 className="text-lg font-semibold mb-5">Choose what to share</h1>

      {screens.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Screens</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {screens.map(source => (
              <div
                key={source.id}
                className={cn('glass-container rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02] hover:border-blue-400/50 flex flex-col gap-2.5', selectedId === source.id && 'border-blue-400 bg-blue-900/30')}
                onClick={() => setSelectedId(source.id)}
              >
                <img 
                  src={source.thumbnail} 
                  alt={source.name} 
                  className="w-full h-40 object-contain bg-[#1a1a1a] rounded"
                />
                <div className="flex items-center gap-2">
                  {source.appIcon && (
                    <img src={source.appIcon} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                  )}
                  <div className="text-sm font-medium text-white flex-1 truncate">{source.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {windows.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Windows</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {windows.map(source => (
              <div
                key={source.id}
                className={cn('glass-container rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02] hover:border-blue-400/50 flex flex-col gap-2.5', selectedId === source.id && 'border-blue-400 bg-blue-900/30')}
                onClick={() => setSelectedId(source.id)}
              >
                <img 
                  src={source.thumbnail} 
                  alt={source.name} 
                  className="w-full h-40 object-contain bg-[#1a1a1a] rounded"
                />
                <div className="flex items-center gap-2">
                  {source.appIcon && (
                    <img src={source.appIcon} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                  )}
                  <div className="text-sm font-medium text-white flex-1 truncate">{source.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sources.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No screens or windows available to share
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2.5 border-t border-white/10 sticky bottom-0 bg-[#1a1a1a] pb-5">
        <Button 
          variant="default"
          className="px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-white/20"
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button 
          variant="default"
          className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-500/30 hover:bg-blue-500/40"
          onClick={handleSelect}
          disabled={!selectedId}
        >
          Share
        </Button>
      </div>
    </div>
  );
};

export default DesktopScreenShareDialog;
