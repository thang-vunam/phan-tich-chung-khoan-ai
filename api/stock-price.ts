export interface StockNewsItem {
  title: string;
  url: string;
  link: string;
  publisher?: string;
  time?: string;
}

async function fetchLatestStockNews(symbol: string): Promise<StockNewsItem[]> {
  try {
    const query = encodeURIComponent(`${symbol} chứng khoán OR cổ phiếu when:7d`);
    const gNewsUrl = `https://news.google.com/rss/search?q=${query}&hl=vi&gl=VN&ceid=VN:vi`;
    
    const res = await fetch(gNewsUrl);
    if (!res.ok) return [];

    const xml = await res.text();
    const items: StockNewsItem[] = [];
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>(?:[\s\S]*?<source[^>]*>(.*?)<\/source>)?/g;
    
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 6) {
      let rawTitle = (match[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      const link = (match[2] || '').trim();
      const rawDate = (match[3] || '').trim();
      let source = (match[4] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

      // If source not extracted from <source>, extract from end of title (e.g. "... - VnEconomy")
      if (!source && rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        source = parts.pop() || '';
        rawTitle = parts.join(' - ');
      }

      // Format time
      let formattedTime = 'Gần đây';
      try {
        const pubTime = new Date(rawDate);
        const diffHours = Math.round((Date.now() - pubTime.getTime()) / (1000 * 3600));
        if (diffHours < 24) {
          formattedTime = diffHours <= 1 ? 'Vừa xong' : `${diffHours} giờ trước`;
        } else {
          const diffDays = Math.round(diffHours / 24);
          formattedTime = `${diffDays} ngày trước`;
        }
      } catch (e) {
        // Keep default
      }

      items.push({
        title: rawTitle,
        url: link,
        link: link,
        publisher: source || 'Tin tức tài chính',
        time: formattedTime
      });
    }

    return items;
  } catch (err) {
    console.warn(`Could not fetch news for ${symbol}:`, err);
    return [];
  }
}

export default async function handler(req: any, res: any) {
  const symbol = ((req.query.symbol as string) || '').trim().toUpperCase();
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400 * 7;
  const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${now}&symbol=${symbol}&resolution=1D`;

  try {
    // Chạy song song: Lấy giá Live từ sàn + Chỉ số VN-Index thực tế + Tin tức 7 ngày gần nhất
    const [apiRes, indexRes, newsItems] = await Promise.all([
      fetch(url),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${now}&symbol=VNINDEX&resolution=1D`).catch(() => null),
      fetchLatestStockNews(symbol)
    ]);

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: `DNSE API returned status ${apiRes.status}` });
    }

    let vnIndexInfo: { points: number; formatted: string; volume?: number } | undefined;
    if (indexRes && indexRes.ok) {
      try {
        const indexData = await indexRes.json();
        if (indexData.c && indexData.c.length > 0) {
          const idxClose = indexData.c[indexData.c.length - 1];
          const idxVol = indexData.v ? indexData.v[indexData.v.length - 1] : undefined;
          vnIndexInfo = {
            points: Number(idxClose.toFixed(2)),
            formatted: `${Number(idxClose.toFixed(2)).toLocaleString('vi-VN')} điểm`,
            volume: idxVol
          };
        }
      } catch (e) {
        // ignore
      }
    }

    const data = await apiRes.json();
    if (data.c && data.c.length > 0) {
      const count = data.c.length;
      const lastClose = data.c[count - 1];
      const lastHigh = data.h ? data.h[count - 1] : lastClose;
      const lastLow = data.l ? data.l[count - 1] : lastClose;
      const lastVol = data.v ? data.v[count - 1] : 0;
      const priceVND = Math.round(lastClose * 1000);

      return res.status(200).json({
        ticker: symbol,
        price: priceVND,
        formattedPrice: `${priceVND.toLocaleString('vi-VN')} VND`,
        high: Math.round(lastHigh * 1000),
        low: Math.round(lastLow * 1000),
        volume: lastVol,
        vnIndex: vnIndexInfo,
        date: data.t ? new Date(data.t[count - 1] * 1000).toLocaleDateString('vi-VN') : undefined,
        source: 'Dữ liệu giao dịch sàn HOSE/HNX',
        news: newsItems
      });
    }

    return res.status(404).json({ error: `Không tìm thấy dữ liệu cho mã ${symbol}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
