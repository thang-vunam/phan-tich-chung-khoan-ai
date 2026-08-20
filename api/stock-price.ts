export interface StockNewsItem {
  title: string;
  url: string;
  link: string;
  publisher?: string;
  time?: string;
}

async function fetchLatestStockNews(symbol: string): Promise<StockNewsItem[]> {
  try {
    const q1 = encodeURIComponent(`${symbol} (chứng khoán OR cổ phiếu) when:7d`);
    const q2 = encodeURIComponent(`${symbol} ("kết quả kinh doanh" OR "lợi nhuận" OR "doanh thu" OR "báo cáo tài chính" OR "quý")`);

    const [res1, res2] = await Promise.all([
      fetch(`https://news.google.com/rss/search?q=${q1}&hl=vi&gl=VN&ceid=VN:vi`).catch(() => null),
      fetch(`https://news.google.com/rss/search?q=${q2}&hl=vi&gl=VN&ceid=VN:vi`).catch(() => null)
    ]);

    const parseXml = async (res: any) => {
      if (!res || !res.ok) return [];
      const xml = await res.text();
      const items: StockNewsItem[] = [];
      const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>(?:[\s\S]*?<source[^>]*>(.*?)<\/source>)?/g;
      
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
        let rawTitle = (match[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const link = (match[2] || '').trim();
        const rawDate = (match[3] || '').trim();
        let source = (match[4] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

        if (!source && rawTitle.includes(' - ')) {
          const parts = rawTitle.split(' - ');
          source = parts.pop() || '';
          rawTitle = parts.join(' - ');
        }

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
        } catch (e) {}

        items.push({
          title: rawTitle,
          url: link,
          link: link,
          publisher: source || 'Tin tức tài chính',
          time: formattedTime
        });
      }
      return items;
    };

    const [items1, items2] = await Promise.all([parseXml(res1), parseXml(res2)]);
    
    // Ghép và lọc trùng lặp
    const seen = new Set<string>();
    const merged: StockNewsItem[] = [];
    for (const item of [...items1, ...items2]) {
      const key = item.title.toLowerCase().substring(0, 30);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    return merged.slice(0, 7);
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
    // Chạy song song: Lấy giá Live từ sàn + Chỉ số cả 3 sàn (HOSE, HNX, UPCOM) + Tin tức 7 ngày gần nhất
    const [apiRes, vnIndexRes, hnxRes, upcomRes, newsItems] = await Promise.all([
      fetch(url),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${now}&symbol=VNINDEX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${now}&symbol=HNX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${now}&symbol=UPCOM&resolution=1D`).catch(() => null),
      fetchLatestStockNews(symbol)
    ]);

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: `DNSE API returned status ${apiRes.status}` });
    }

    const parseIndex = (resObj: any) => {
      if (!resObj || !resObj.ok) return undefined;
      try {
        return resObj.json();
      } catch (e) {
        return undefined;
      }
    };

    const [vnData, hnxData, upcomData] = await Promise.all([
      parseIndex(vnIndexRes),
      parseIndex(hnxRes),
      parseIndex(upcomRes)
    ]);

    const getIndexInfo = (data: any, name: string) => {
      if (data && data.c && data.c.length > 0) {
        const idxClose = data.c[data.c.length - 1];
        const idxVol = data.v ? data.v[data.v.length - 1] : undefined;
        return {
          name,
          points: Number(idxClose.toFixed(2)),
          formatted: `${Number(idxClose.toFixed(2)).toLocaleString('vi-VN')} điểm`,
          volume: idxVol
        };
      }
      return undefined;
    };

    const vnIndexInfo = getIndexInfo(vnData, 'VN-INDEX');
    const hnxInfo = getIndexInfo(hnxData, 'HNX-INDEX');
    const upcomInfo = getIndexInfo(upcomData, 'UPCOM-INDEX');

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
        hnxIndex: hnxInfo,
        upcomIndex: upcomInfo,
        date: data.t ? new Date(data.t[count - 1] * 1000).toLocaleDateString('vi-VN') : undefined,
        source: 'Dữ liệu giao dịch sàn HOSE/HNX/UPCOM',
        news: newsItems
      });
    }

    return res.status(404).json({ error: `Không tìm thấy dữ liệu cho mã ${symbol}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
