export interface StockNewsItem {
  title: string;
  url: string;
  link: string;
  publisher?: string;
  time?: string;
}

async function fetchLatestStockNews(symbol: string): Promise<StockNewsItem[]> {
  try {
    const q1 = encodeURIComponent(`"${symbol}" (chứng khoán OR cổ phiếu) when:7d`);
    const q2 = encodeURIComponent(`"${symbol}" ("kết quả kinh doanh" OR "lợi nhuận" OR "doanh thu" OR "báo cáo tài chính" OR "quý")`);

    const [res1, res2] = await Promise.all([
      fetch(`https://news.google.com/rss/search?q=${q1}&hl=vi&gl=VN&ceid=VN:vi`).catch(() => null),
      fetch(`https://news.google.com/rss/search?q=${q2}&hl=vi&gl=VN&ceid=VN:vi`).catch(() => null)
    ]);

    const tickerRegex = new RegExp(`\\b${symbol}\\b`, 'i');

    const parseXml = async (res: any) => {
      if (!res || !res.ok) return [];
      const xml = await res.text();
      const items: StockNewsItem[] = [];
      const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>(?:[\s\S]*?<source[^>]*>(.*?)<\/source>)?/g;
      
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
        let rawTitle = (match[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        
        // BẮT BUỘC: Tiêu đề bài báo phải chứa chính xác mã cổ phiếu ${symbol}
        if (!tickerRegex.test(rawTitle)) {
          continue;
        }

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

export interface FinancialQuarter {
  period: string;
  revenue: number;
  formattedRevenue: string;
  grossProfit: number;
  formattedGrossProfit: string;
  grossMargin: number;
  netProfit: number;
  formattedNetProfit: string;
  totalAssets?: number;
  formattedTotalAssets?: string;
  totalLiabilities?: number;
  formattedTotalLiabilities?: string;
  equity?: number;
  formattedEquity?: string;
  debtToEquity?: number;
}

export interface FinancialStatementsSummary {
  industryGroup?: string;
  quarters: FinancialQuarter[];
  latestYearSummary?: {
    totalRevenue: number;
    formattedTotalRevenue: string;
    totalNetProfit: number;
    formattedTotalNetProfit: string;
  };
}

async function fetchFinancialStatements(symbol: string): Promise<FinancialStatementsSummary | undefined> {
  try {
    const url = `https://api.simplize.vn/api/company/fi/ratio/${symbol}?period=Q&size=4`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (!data || !data.data || !Array.isArray(data.data.items) || data.data.items.length === 0) {
      return undefined;
    }

    const items = data.data.items;
    const quarters: FinancialQuarter[] = [];

    const fmtTỷ = (val: number) => `${(val / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`;

    for (const item of items) {
      const rev = item.is4 || item.is1 || 0;
      const gp = item.is2 || 0;
      const np = item.is3 !== undefined ? Math.abs(item.is3) : 0;
      const grossMargin = rev > 0 ? Number(((gp / rev) * 100).toFixed(1)) : 0;

      const assets = item.bs1 || 0;
      const liab = item.bs6 || 0;
      const eq = item.bs10 || 0;
      const de = eq > 0 ? Number((liab / eq).toFixed(2)) : undefined;

      quarters.push({
        period: item.periodDateName || 'N/A',
        revenue: rev,
        formattedRevenue: fmtTỷ(rev),
        grossProfit: gp,
        formattedGrossProfit: fmtTỷ(gp),
        grossMargin,
        netProfit: np,
        formattedNetProfit: fmtTỷ(np),
        totalAssets: assets,
        formattedTotalAssets: assets > 0 ? fmtTỷ(assets) : undefined,
        totalLiabilities: liab,
        formattedTotalLiabilities: liab > 0 ? fmtTỷ(liab) : undefined,
        equity: eq,
        formattedEquity: eq > 0 ? fmtTỷ(eq) : undefined,
        debtToEquity: de
      });
    }

    let totalRev = 0;
    let totalNp = 0;
    quarters.forEach(q => {
      totalRev += q.revenue;
      totalNp += q.netProfit;
    });

    return {
      industryGroup: data.data.industryGroup,
      quarters,
      latestYearSummary: {
        totalRevenue: totalRev,
        formattedTotalRevenue: fmtTỷ(totalRev),
        totalNetProfit: totalNp,
        formattedTotalNetProfit: fmtTỷ(totalNp)
      }
    };
  } catch (err) {
    console.warn(`Could not fetch financial statements for ${symbol}:`, err);
    return undefined;
  }
}

export default async function handler(req: any, res: any) {
  const symbol = ((req.query.symbol as string) || '').trim().toUpperCase();
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const now = Math.floor(Date.now() / 1000);
  const fromIntraday = now - 3600 * 6; // 6 giờ gần nhất (nến 1 phút trong phiên)
  const fromDaily = now - 86400 * 30; // 30 ngày nến để tính đỉnh đáy và xu hướng động

  try {
    // Chạy song song: Lấy giá Live 1-phút trong phiên + Nến ngày lịch sử + Nến 30 phiên của 3 sàn (HOSE, HNX, UPCOM) + Tin tức kép + BCTC Simplize
    const [stock1mRes, stock1dRes, vnIndex1mRes, vnIndex1dRes, hnxRes, upcomRes, newsItems, financials] = await Promise.all([
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${fromIntraday}&to=${now}&symbol=${symbol}&resolution=1`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${fromDaily}&to=${now}&symbol=${symbol}&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromIntraday}&to=${now}&symbol=VNINDEX&resolution=1`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromDaily}&to=${now}&symbol=VNINDEX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromDaily}&to=${now}&symbol=HNX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromDaily}&to=${now}&symbol=UPCOM&resolution=1D`).catch(() => null),
      fetchLatestStockNews(symbol),
      fetchFinancialStatements(symbol)
    ]);

    const parseJson = async (resObj: any) => {
      if (!resObj || !resObj.ok) return undefined;
      try {
        return await resObj.json();
      } catch (e) {
        return undefined;
      }
    };

    const [stock1mData, stock1dData, vn1mData, vn1dData, hnxData, upcomData] = await Promise.all([
      parseJson(stock1mRes),
      parseJson(stock1dRes),
      parseJson(vnIndex1mRes),
      parseJson(vnIndex1dRes),
      parseJson(hnxRes),
      parseJson(upcomRes)
    ]);

    if (!stock1mData && !stock1dData) {
      return res.status(404).json({ error: `Không tìm thấy dữ liệu giao dịch cho mã ${symbol}` });
    }

    const computeDynamicTrend = (dailyData: any, live1mData: any, name: string) => {
      if (!dailyData || !dailyData.c || dailyData.c.length === 0) return undefined;
      const count = dailyData.c.length;
      let current = dailyData.c[count - 1];

      // Nếu có nến 1 phút Live hôm nay, cập nhật điểm số chính xác đến từng phút
      if (live1mData && live1mData.c && live1mData.c.length > 0) {
        current = live1mData.c[live1mData.c.length - 1];
      }

      const sampleSize = Math.min(count, 15);
      const highs = dailyData.h ? dailyData.h.slice(-sampleSize) : [current];
      const lows = dailyData.l ? dailyData.l.slice(-sampleSize) : [current];
      
      const highest = Math.max(...highs);
      const lowest = Math.min(...lows);
      
      const pctFromHigh = ((current - highest) / highest) * 100;
      const pctFromLow = ((current - lowest) / lowest) * 100;
      
      let trendDescription = '';
      if (pctFromHigh >= -0.8) {
        trendDescription = `đang duy trì đà tăng mạnh, tiệm cận/kiểm định đỉnh ngắn hạn ${highest.toFixed(2)} điểm`;
      } else if (pctFromHigh < -1.5 && pctFromLow > 0.4) {
        trendDescription = `đang trong nhịp hồi phục kỹ thuật (+${pctFromLow.toFixed(1)}% từ đáy ${lowest.toFixed(2)} điểm) sau đợt điều chỉnh giảm từ đỉnh ngắn hạn ${highest.toFixed(2)} điểm (${pctFromHigh.toFixed(1)}%)`;
      } else if (pctFromLow <= 0.4) {
        trendDescription = `đang chịu áp lực điều chỉnh và kiểm định vùng hỗ trợ đáy ${lowest.toFixed(2)} điểm`;
      } else {
        trendDescription = `đang dao động tích lũy trong biên độ ${lowest.toFixed(2)} - ${highest.toFixed(2)} điểm`;
      }

      const sampleVol = dailyData.v ? dailyData.v.slice(-20) : [];
      const avgVol20 = sampleVol.length > 0 ? (sampleVol.reduce((a: number, b: number) => a + (b || 0), 0) / sampleVol.length) : 0;
      const estTurnover = Math.round((avgVol20 * 23000) / 1e9);
      const liquidityDescription = avgVol20 > 0 
        ? `khớp lệnh bình quân 20 phiên đạt ~${Math.round(avgVol20 / 1e6)} triệu cp/phiên (tương đương ~${estTurnover.toLocaleString('vi-VN')} tỷ đồng/phiên)`
        : undefined;

      return {
        name,
        points: Number(current.toFixed(2)),
        formatted: `${Number(current.toFixed(2)).toLocaleString('vi-VN')} điểm`,
        highest: Number(highest.toFixed(2)),
        lowest: Number(lowest.toFixed(2)),
        pctFromHigh: Number(pctFromHigh.toFixed(2)),
        pctFromLow: Number(pctFromLow.toFixed(2)),
        volume: dailyData.v ? dailyData.v[count - 1] : undefined,
        avgVolume20: Math.round(avgVol20),
        estimatedTurnover20: estTurnover,
        liquidityDescription,
        trendDescription
      };
    };

    const vnIndexInfo = computeDynamicTrend(vn1dData, vn1mData, 'VN-INDEX');
    const hnxInfo = computeDynamicTrend(hnxData, null, 'HNX-INDEX');
    const upcomInfo = computeDynamicTrend(upcomData, null, 'UPCOM-INDEX');

    // Xác định giá Live thời gian thực của cổ phiếu
    let lastClose = 0;
    let lastHigh = 0;
    let lastLow = 0;
    let lastVol = 0;
    let lastDateStr = '';
    let isLiveSession = false;

    // Ưu tiên nến 1 phút Live trong phiên hôm nay
    if (stock1mData && stock1mData.c && stock1mData.c.length > 0) {
      const count1m = stock1mData.c.length;
      lastClose = stock1mData.c[count1m - 1];
      lastHigh = Math.max(...stock1mData.h);
      lastLow = Math.min(...stock1mData.l);
      lastVol = stock1mData.v.reduce((sum: number, v: number) => sum + (v || 0), 0);
      lastDateStr = new Date(stock1mData.t[count1m - 1] * 1000).toLocaleTimeString('vi-VN') + ' ' + new Date(stock1mData.t[count1m - 1] * 1000).toLocaleDateString('vi-VN');
      isLiveSession = true;
    } else if (stock1dData && stock1dData.c && stock1dData.c.length > 0) {
      const count1d = stock1dData.c.length;
      lastClose = stock1dData.c[count1d - 1];
      lastHigh = stock1dData.h ? stock1dData.h[count1d - 1] : lastClose;
      lastLow = stock1dData.l ? stock1dData.l[count1d - 1] : lastClose;
      lastVol = stock1dData.v ? stock1dData.v[count1d - 1] : 0;
      lastDateStr = stock1dData.t ? new Date(stock1dData.t[count1d - 1] * 1000).toLocaleDateString('vi-VN') : '';
    }

    const priceVND = Math.round(lastClose * 1000);

    return res.status(200).json({
      ticker: symbol,
      price: priceVND,
      formattedPrice: `${priceVND.toLocaleString('vi-VN')} VND`,
      high: Math.round(lastHigh * 1000),
      low: Math.round(lastLow * 1000),
      volume: lastVol,
      isLiveSession,
      vnIndex: vnIndexInfo,
      hnxIndex: hnxInfo,
      upcomIndex: upcomInfo,
      date: lastDateStr,
      source: isLiveSession ? 'Khớp lệnh Real-time sàn HOSE/HNX/UPCOM' : 'Dữ liệu giao dịch sàn HOSE/HNX/UPCOM',
      news: newsItems,
      financialStatements: financials
    });
  } catch (err: any) {
    console.error(`API Error /api/stock-price:`, err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
