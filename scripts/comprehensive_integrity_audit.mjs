import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const vite = fs.readFileSync('C:\\Users\\Thang Vu\\Downloads\\Phan tich co phieu\\vite.config.ts', 'utf-8');
const keyMatch = vite.match(/Buffer\.from\('([^']+)',\s*'base64'\)/);
const realKey = Buffer.from(keyMatch[1], 'base64').toString('utf-8');

const ai = new GoogleGenAI({ apiKey: realKey });

// Bóc tách chuẩn VAS
async function getVerifiedBCTC(symbol) {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/fi/ratio/${symbol}?period=Q&size=4`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.data?.items || [];
    if (items.length === 0) return null;

    const latest = items[0];
    const isBank = (latest.bs7 !== undefined && latest.bs7 > 0) || (latest.is14 !== undefined && latest.is14 > 0);

    let ttmRev = 0;
    let ttmNp = 0;
    const quarters = items.map(q => {
      const rev = q.is1 || q.is4 || 0; // Doanh thu thuần chuẩn VAS
      const np = q.is14 !== undefined && q.is14 !== 0 
        ? q.is14 
        : (q.is50 !== undefined && q.is50 !== 0 ? q.is50 : (q.is3 || 0)); // LNST chuẩn (có dấu âm nếu lỗ)
      
      const gp = q.is2 || 0;
      const gm = rev > 0 ? Number(((gp / rev) * 100).toFixed(1)) : 0;
      ttmRev += rev;
      ttmNp += np;
      
      const fmtTỷ = (v) => `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`;
      return {
        period: q.periodDateName,
        rev,
        formattedRev: fmtTỷ(rev),
        np,
        formattedNp: fmtTỷ(np),
        isLoss: np < 0,
        grossMargin: gm
      };
    });

    const charterCap = latest.bs11 || (latest.op49 ? latest.op49 * 10000 : 0);
    const shares = charterCap > 0 ? charterCap / 10000 : (latest.op49 || 1);
    const equity = latest.bs10 || 1;
    const totalAssets = latest.bs1 || 1;

    const eps = Math.round(ttmNp / shares);
    const bvps = Math.round(equity / shares);
    const roe = Number(((ttmNp / equity) * 100).toFixed(1));
    const roa = Number(((ttmNp / totalAssets) * 100).toFixed(1));

    const fmtTỷ = (v) => `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`;
    return {
      symbol,
      isBank,
      quarters,
      ttmRev: fmtTỷ(ttmRev),
      ttmNp: fmtTỷ(ttmNp),
      rawTtmNp: ttmNp,
      eps,
      bvps,
      roe,
      roa,
      nim: latest.op10 ? Number(latest.op10.toFixed(2)) : undefined,
      casa: latest.op13 ? Number(latest.op13.toFixed(1)) : undefined,
      npl: latest.op18 ? Number(latest.op18.toFixed(2)) : undefined
    };
  } catch (e) {
    return null;
  }
}

async function getLivePrice(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const fromDay = now - 86400 * 5;
  try {
    const res = await fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${fromDay}&to=${now}&symbol=${symbol}&resolution=1D`);
    if (res.ok) {
      const d = await res.json();
      if (d.c && d.c.length > 0) return Math.round(d.c[d.c.length - 1] * 1000);
    }
  } catch (e) {}
  return 0;
}

async function runComprehensiveAudit() {
  console.log('====================================================================================');
  console.log('🔍 KIỂM THỬ TOÀN DIỆN NGHIỆP VỤ TÀI CHÍNH & ĐỐI SOÁT CHÉO TẤT CẢ CÁC MODULES');
  console.log('====================================================================================\n');

  const testTickers = ['PNJ', 'CTG', 'HPG', 'SSI', 'VCB', 'MWG', 'FPT'];
  const auditReport = [];

  for (const sym of testTickers) {
    const bctc = await getVerifiedBCTC(sym);
    const livePrice = await getLivePrice(sym);
    const pe = (bctc && bctc.eps > 0 && livePrice > 0) ? Number((livePrice / bctc.eps).toFixed(1)) : 'Âm/N/A';
    const pb = (bctc && bctc.bvps > 0 && livePrice > 0) ? Number((livePrice / bctc.bvps).toFixed(2)) : 'N/A';

    const latestQ = bctc?.quarters[0];
    const isLossQ = latestQ?.isLoss;

    console.log(`📌 Mã: ${sym.padEnd(5)} | Giá: ${livePrice.toLocaleString('vi-VN')} VND | [${latestQ?.period}]: Doanh thu = ${latestQ?.formattedRev} | LNST = ${latestQ?.formattedNp} ${isLossQ ? '🔴 [BÁO LỖ ÂM]' : '🟢 [CÓ LÃI]'}`);
    console.log(`   👉 TTM LNST: ${bctc?.ttmNp} | EPS: ${bctc?.eps.toLocaleString('vi-VN')} đ | BVPS: ${bctc?.bvps.toLocaleString('vi-VN')} đ | P/E: ${pe}x | P/B: ${pb}x | ROE: ${bctc?.roe}%\n`);

    auditReport.push({
      symbol: sym,
      type: bctc?.isBank ? 'Ngân hàng' : 'Doanh nghiệp',
      price: `${livePrice.toLocaleString('vi-VN')} VND`,
      latestPeriod: latestQ?.period,
      revenue: latestQ?.formattedRev,
      netProfit: latestQ?.formattedNp,
      status: isLossQ ? 'Lỗ âm (Chuẩn VAS)' : 'Lãi dương',
      pe: `${pe}x`,
      pb: `${pb}x`,
      eps: `${bctc?.eps.toLocaleString('vi-VN')} đ`,
      roe: `${bctc?.roe}%`
    });
  }

  console.log('\n====================================================================================');
  console.log('📊 BẢNG TỔNG HỢP KIỂM ĐỊNH TOÀN BỘ 7 MÃ ĐA NGÀNH (BÁN LẺ, NGÂN HÀNG, THÉP, CHỨNG KHOÁN, TECH)');
  console.log('====================================================================================');
  console.table(auditReport);
}

runComprehensiveAudit();
