import React, { useState, useEffect } from 'react';
import { alertService } from '../services/alertService';
import { WatchlistItem, PriceAlert } from '../types';
import { BellIcon, TrashIcon, StarIcon, PlusIcon, XMarkIcon, StarIconSolid } from './IconComponents';

interface PriceAlertsProps {
  onSelectTicker: (ticker: string) => void;
  currentTicker?: string;
}

export const PriceAlerts: React.FC<PriceAlertsProps> = ({ onSelectTicker, currentTicker }) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setWatchlist(alertService.getWatchlist());
    setAlerts(alertService.getAlerts());
  }, []);

  const handleToggleWatchlist = () => {
    if (!currentTicker) return;
    const isWatched = watchlist.some(i => i.symbol === currentTicker.toUpperCase());
    if (isWatched) {
      setWatchlist(alertService.removeFromWatchlist(currentTicker.toUpperCase()));
    } else {
      setWatchlist(alertService.addToWatchlist(currentTicker.toUpperCase()));
    }
  };

  const handleRemove = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    setWatchlist(alertService.removeFromWatchlist(symbol));
  };

  return (
    <div className={`fixed right-4 bottom-4 z-50 transition-all duration-300 ${isExpanded ? 'w-80 h-[500px]' : 'w-12 h-12'}`}>
      {!isExpanded ? (
        <button 
          onClick={() => setIsExpanded(true)}
          className="w-full h-full bg-cyan-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-cyan-500 transition-colors"
        >
          <StarIcon className="w-6 h-6" />
        </button>
      ) : (
        <div className="w-full h-full bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
            <h3 className="font-bold text-cyan-400 flex items-center gap-2">
              <StarIconSolid className="w-5 h-5" />
              Danh mục theo dõi
            </h3>
            <button onClick={() => setIsExpanded(false)} className="text-gray-400 hover:text-white">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {watchlist.length === 0 ? (
              <div className="text-center py-10 text-gray-500 italic text-sm">
                Chưa có mã nào trong danh sách.
              </div>
            ) : (
              watchlist.map((item) => (
                <div 
                  key={item.symbol}
                  onClick={() => onSelectTicker(item.symbol)}
                  className="p-3 bg-gray-700/50 hover:bg-gray-700 rounded-xl cursor-pointer flex justify-between items-center group transition-all"
                >
                  <div>
                    <div className="font-bold text-white">{item.symbol}</div>
                    <div className="text-[10px] text-gray-400">Added: {new Date(item.addedAt).toLocaleDateString()}</div>
                  </div>
                  <button 
                    onClick={(e) => handleRemove(e, item.symbol)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-red-400 transition-all"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {currentTicker && (
            <div className="p-4 bg-gray-900 border-t border-gray-700">
              <button 
                onClick={handleToggleWatchlist}
                className={`w-full py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                  watchlist.some(i => i.symbol === currentTicker.toUpperCase())
                  ? 'bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40'
                  : 'bg-cyan-600 text-white hover:bg-cyan-500'
                }`}
              >
                {watchlist.some(i => i.symbol === currentTicker.toUpperCase()) ? (
                  <>Bỏ theo dõi {currentTicker.toUpperCase()}</>
                ) : (
                  <>Theo dõi {currentTicker.toUpperCase()}</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
