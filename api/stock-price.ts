export default async function handler(req: any, res: any) {
  const symbol = ((req.query.symbol as string) || '').trim().toUpperCase();
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400 * 7;
  const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${now}&symbol=${symbol}&resolution=1D`;

  try {
    const apiRes = await fetch(url);
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: `DNSE API returned status ${apiRes.status}` });
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
        date: data.t ? new Date(data.t[count - 1] * 1000).toLocaleDateString('vi-VN') : undefined,
        source: 'Dữ liệu giao dịch sàn HOSE/HNX'
      });
    }

    return res.status(404).json({ error: `Không tìm thấy dữ liệu cho mã ${symbol}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
