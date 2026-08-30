import React, { useState, useEffect } from 'react';
import { alertService } from '../services/alertService';
import { WatchlistItem, PriceAlert } from '../types';
import { BellIcon, TrashIcon, StarIcon, PlusIcon, XMarkIcon, StarIconSolid } from './IconComponents';

interface PriceAlertsProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicker: (ticker: string) => void;
  currentTicker?: string;
}

export const PriceAlerts: React.FC<PriceAlertsProps> = ({ isOpen, onClose, onSelectTicker, currentTicker }) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      setWatchlist(alertService.getWatchlist());
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <>
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-x-3 bottom-3 top-auto sm:inset-auto sm:right-6 sm:top-20 sm:bottom-auto sm:w-96 h-[80vh] sm:h-[550px] max-h-[90vh] z-50 flex flex-col">
        <div className="w-full h-full bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
            <h3 className="font-bold text-cyan-400 flex items-center gap-2">
              <StarIconSolid className="w-5 h-5 text-yellow-400" />
              Danh mục theo dõi ({watchlist.length})
            </h3>
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center px-4">
                  <StarIcon className="w-12 h-12 text-gray-600 mb-2" />
                  <p className="text-gray-400 font-medium">Chưa có mã nào trong danh sách</p>
                  <p className="text-xs text-gray-500 mt-1">Bấm nút "Theo dõi" trên bất kỳ mã nào để lưu lại tại đây.</p>
                </div>
              ) : (
                watchlist.map((item) => (
                  <div 
                    key={item.symbol}
                    onClick={() => {
                      onSelectTicker(item.symbol);
                      onClose();
                    }}
                    className="p-3 bg-gray-700/50 hover:bg-gray-700/80 rounded-xl cursor-pointer flex justify-between items-center group transition-all border border-gray-700/50 hover:border-cyan-500/50"
                  >
                    <div>
                      <div className="font-bold text-lg text-white group-hover:text-cyan-400 transition-colors">{item.symbol}</div>
                      <div className="text-[11px] text-gray-400">{item.name || 'Theo dõi thị giá'}</div>
                    </div>
                    <button 
                      onClick={(e) => handleRemove(e, item.symbol)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Xóa khỏi danh mục"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {currentTicker && (
              <div className="p-3 bg-gray-900 border-t border-gray-700">
                <button 
                  onClick={handleToggleWatchlist}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    watchlist.some(i => i.symbol === currentTicker.toUpperCase())
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-md'
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
        </div>
    </>
  );
};
