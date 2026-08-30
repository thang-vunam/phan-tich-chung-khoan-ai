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

export interface ValuationMetrics {
  isBank?: boolean;
  ttmRevenue: number;
  formattedTtmRevenue: string;
  ttmNetProfit: number;
  formattedTtmNetProfit: string;
  sharesOutstanding: number;
  eps: number;
  formattedEps: string;
  bvps: number;
  formattedBvps: string;
  roe: number;
  roa: number;
  pe?: number;
  pb?: number;
  nim?: number;
  casa?: number;
  npl?: number;
  llr?: number;
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
  valuationMetrics?: ValuationMetrics;
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
      const isBank = (item.bs7 !== undefined && item.bs7 > 0) && (item.is4 === undefined || item.is4 === 0);
      
      // Doanh thu thuần chuẩn VAS (is1 hoặc is4)
      const rev = item.is1 || item.is4 || 0;
      
      // Lợi nhuận sau thuế của Cổ đông Công ty Mẹ (giữ nguyên dấu âm/dương thực tế, tuyệt đối không dùng Math.abs)
      const np = item.is14 !== undefined && item.is14 !== 0 
        ? item.is14 
        : (item.is50 !== undefined && item.is50 !== 0 ? item.is50 : (item.is3 || 0));

      const gp = item.is2 || 0;
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

    const latestItem = items[0] || {};
    const isBankLatest = (latestItem.bs7 !== undefined && latestItem.bs7 > 0) && (latestItem.is4 === undefined || latestItem.is4 === 0);
    const charterCap = latestItem.bs11 || (latestItem.op49 ? latestItem.op49 * 10000 : 0);
    const sharesOutstanding = charterCap > 0 ? charterCap / 10000 : (latestItem.op49 || 1);
    const equity = latestItem.bs10 || 1;
    const totalAssets = latestItem.bs1 || 1;

    // Chuẩn hóa EPS hàng nghìn VND/cp, không để bị số nhỏ hoặc N/A
    const calculatedEps = Math.round(totalNp / sharesOutstanding);
    let normalizedOp4: number | undefined = undefined;
    if (latestItem.op4 !== undefined && latestItem.op4 !== null && !isNaN(latestItem.op4)) {
      normalizedOp4 = (latestItem.op4 < 100 && latestItem.op4 > 0) ? Math.round(latestItem.op4 * 1000) : Math.round(latestItem.op4);
    }
    const eps = calculatedEps !== 0 ? calculatedEps : (normalizedOp4 || 0);

    const bvps = Math.round(equity / sharesOutstanding);
    const roe = Number(((totalNp / equity) * 100).toFixed(1));
    const roa = Number(((totalNp / totalAssets) * 100).toFixed(1));

    const valuationMetrics = {
      isBank: isBankLatest,
      ttmRevenue: totalRev,
      formattedTtmRevenue: fmtTỷ(totalRev),
      ttmNetProfit: totalNp,
      formattedTtmNetProfit: fmtTỷ(totalNp),
      sharesOutstanding: Math.round(sharesOutstanding),
      eps,
      formattedEps: `${eps.toLocaleString('vi-VN')} VND/cp`,
      bvps,
      formattedBvps: `${bvps.toLocaleString('vi-VN')} VND/cp`,
      roe,
      roa,
      pe: undefined as number | undefined,
      pb: undefined as number | undefined,
      nim: latestItem.op10 ? Number(latestItem.op10.toFixed(2)) : undefined,
      casa: latestItem.op13 ? Number(latestItem.op13.toFixed(1)) : undefined,
      npl: latestItem.op18 ? Number(latestItem.op18.toFixed(2)) : undefined,
      llr: latestItem.op42 ? Number(latestItem.op42.toFixed(1)) : undefined
    };

    return {
      industryGroup: data.data.industryGroup,
      quarters,
      latestYearSummary: {
        totalRevenue: totalRev,
        formattedTotalRevenue: fmtTỷ(totalRev),
        totalNetProfit: totalNp,
        formattedTotalNetProfit: fmtTỷ(totalNp)
      },
      valuationMetrics
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
  const fromIntraday = now - 3600 * 8; // 8 giờ gần nhất
  const fromDaily = now - 86400 * 45; // 45 ngày nến

  const fetchOhlc = async (sym: string, resolution: string, from: number) => {
    // 1. Ưu tiên VNDirect DChart API (chuẩn 100% dữ liệu ATC sàn HOSE/HNX/UPCOM)
    try {
      const res = await fetch(`https://dchart-api.vndirect.com.vn/dchart/history?symbol=${sym}&resolution=${resolution}&from=${from}&to=${now}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.c) && data.c.length > 0) {
          return data;
        }
      }
    } catch (e) {}

    // 2. Fallback sang Entrade nếu VNDirect tạm thời không phản hồi
    try {
      const res = await fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${now}&symbol=${sym}&resolution=${resolution === 'D' ? '1D' : resolution}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.c) && data.c.length > 0) {
          return data;
        }
      }
    } catch (e) {}

    return null;
  };

  const fetchIndexOhlc = async (sym: string, resolution: string, from: number) => {
    // Ưu tiên VNDirect DChart API
    try {
      const res = await fetch(`https://dchart-api.vndirect.com.vn/dchart/history?symbol=${sym}&resolution=${resolution}&from=${from}&to=${now}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.c) && data.c.length > 0) {
          return data;
        }
      }
    } catch (e) {}

    // Fallback Entrade
    try {
      const res = await fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${now}&symbol=${sym}&resolution=${resolution === 'D' ? '1D' : resolution}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.c) && data.c.length > 0) {
          return data;
        }
      }
    } catch (e) {}

    return null;
  };

  try {
    const [stock1mData, stock1dData, vn1mData, vn1dData, hnxData, upcomData, newsItems, financials] = await Promise.all([
      fetchOhlc(symbol, '1', fromIntraday),
      fetchOhlc(symbol, 'D', fromDaily),
      fetchIndexOhlc('VNINDEX', '1', fromIntraday),
      fetchIndexOhlc('VNINDEX', 'D', fromDaily),
      fetchIndexOhlc('HNX', 'D', fromDaily),
      fetchIndexOhlc('UPCOM', 'D', fromDaily),
      fetchLatestStockNews(symbol),
      fetchFinancialStatements(symbol)
    ]);

    const computeDynamicTrend = (dailyData: any, intradayData: any, name: string) => {
      if (!dailyData || !dailyData.c || dailyData.c.length === 0) return undefined;
      const count = dailyData.c.length;
      let current = dailyData.c[count - 1];
      
      if (intradayData && intradayData.c && intradayData.c.length > 0) {
        current = intradayData.c[intradayData.c.length - 1];
      }

      const recentHighs = dailyData.h ? dailyData.h.slice(-20) : [current];
      const recentLows = dailyData.l ? dailyData.l.slice(-20) : [current];
      const highest = Math.max(...recentHighs);
      const lowest = Math.min(...recentLows);
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

      return {
        name,
        points: Number(current.toFixed(2)),
        formatted: `${Number(current.toFixed(2)).toLocaleString('vi-VN')} điểm`,
        liquidityDescription: `khớp lệnh bình quân 20 phiên đạt ~${Math.round(avgVol20 / 1e6)} triệu cp/phiên`,
        trendDescription
      };
    };

    const vnIndexInfo = computeDynamicTrend(vn1dData, vn1mData, 'VN-INDEX');
    const hnxInfo = computeDynamicTrend(hnxData, null, 'HNX-INDEX');
    const upcomInfo = computeDynamicTrend(upcomData, null, 'UPCOM-INDEX');

    let lastClose = 0, lastHigh = 0, lastLow = 0, lastVol = 0, lastDateStr = '';
    let isLiveSession = false;

    const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
    const vnDay = vnNow.getUTCDay();
    const vnMins = vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes();
    const isTradingHours = vnDay >= 1 && vnDay <= 5 && vnMins >= 9 * 60 && vnMins <= 15 * 60;

    const count1d = stock1dData && stock1dData.c ? stock1dData.c.length : 0;
    const count1m = stock1mData && stock1mData.c ? stock1mData.c.length : 0;

    if (isTradingHours && count1m > 0) {
      lastClose = stock1mData.c[count1m - 1];
      lastHigh = Math.max(...stock1mData.h);
      lastLow = Math.min(...stock1mData.l);
      lastVol = count1d > 0 && stock1dData.v ? stock1dData.v[count1d - 1] : stock1mData.v.reduce((sum: number, v: number) => sum + (v || 0), 0);
      lastDateStr = new Date(stock1mData.t[count1m - 1] * 1000).toLocaleTimeString('vi-VN');
      isLiveSession = true;
    } else if (count1d > 0) {
      lastClose = stock1dData.c[count1d - 1];
      lastHigh = stock1dData.h ? stock1dData.h[count1d - 1] : lastClose;
      lastLow = stock1dData.l ? stock1dData.l[count1d - 1] : lastClose;
      lastVol = stock1dData.v ? stock1dData.v[count1d - 1] : 0;
      lastDateStr = new Date(stock1dData.t[count1d - 1] * 1000).toLocaleDateString('vi-VN');
      isLiveSession = false;
    }

    const priceVND = Math.round(lastClose * 1000);
    const sampleVolStock = stock1dData && stock1dData.v ? stock1dData.v.slice(-20) : [];
    const avgVol20Stock = sampleVolStock.length > 0 ? Math.round(sampleVolStock.reduce((a: number, b: number) => a + (b || 0), 0) / sampleVolStock.length) : lastVol;
    const prevCloseVND = count1d >= 2 && stock1dData.c ? Math.round(stock1dData.c[count1d - 2] * 1000) : priceVND;
    const changeVND = priceVND - prevCloseVND;
    const changePct = prevCloseVND > 0 ? Number(((changeVND / prevCloseVND) * 100).toFixed(2)) : 0;

    if (financials && financials.valuationMetrics && priceVND > 0) {
      const eps = financials.valuationMetrics.eps;
      const bvps = financials.valuationMetrics.bvps;
      if (eps > 0) financials.valuationMetrics.pe = Number((priceVND / eps).toFixed(1));
      if (bvps > 0) financials.valuationMetrics.pb = Number((priceVND / bvps).toFixed(2));
    }

    return res.status(200).json({
      ticker: symbol,
      price: priceVND,
      formattedPrice: `${priceVND.toLocaleString('vi-VN')} VND`,
      prevPrice: prevCloseVND,
      change: changeVND,
      changePct,
      formattedChange: `${changeVND >= 0 ? '+' : ''}${changeVND.toLocaleString('vi-VN')} VND (${changePct >= 0 ? '+' : ''}${changePct}%)`,
      high: Math.round(lastHigh * 1000),
      low: Math.round(lastLow * 1000),
      volume: lastVol,
      avgVolume20: avgVol20Stock,
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
