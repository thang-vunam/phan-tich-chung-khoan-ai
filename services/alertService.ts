import { WatchlistItem, PriceAlert } from '../types';

const STORAGE_KEYS = {
  WATCHLIST: 'vsa_watchlist',
  ALERTS: 'vsa_alerts'
};

export const alertService = {
  // Watchlist
  getWatchlist(): WatchlistItem[] {
    const data = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
    return data ? JSON.parse(data) : [];
  },
  
  addToWatchlist(ticker: string, name?: string): WatchlistItem[] {
    const list = this.getWatchlist();
    if (list.find(i => i.symbol === ticker)) return list;
    
    const newList = [...list, {
      symbol: ticker.toUpperCase(),
      name,
      addedAt: Date.now()
    }];
    localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(newList));
    return newList;
  },
  
  removeFromWatchlist(ticker: string): WatchlistItem[] {
    const list = this.getWatchlist();
    const newList = list.filter(i => i.symbol !== ticker);
    localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(newList));
    return newList;
  },

  // Alerts
  getAlerts(): PriceAlert[] {
    const data = localStorage.getItem(STORAGE_KEYS.ALERTS);
    return data ? JSON.parse(data) : [];
  },
  
  addAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'isActive'>): PriceAlert[] {
    const alerts = this.getAlerts();
    const newAlert: PriceAlert = {
      ...alert,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      isActive: true
    };
    const newList = [...alerts, newAlert];
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(newList));
    return newList;
  },
  
  removeAlert(id: string): PriceAlert[] {
    const alerts = this.getAlerts();
    const newList = alerts.filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(newList));
    return newList;
  },
  
  toggleAlert(id: string): PriceAlert[] {
    const alerts = this.getAlerts();
    const newList = alerts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a);
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(newList));
    return newList;
  }
};
