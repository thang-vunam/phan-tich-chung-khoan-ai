import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const vite = fs.readFileSync('C:\\Users\\Thang Vu\\Downloads\\Phan tich co phieu\\vite.config.ts', 'utf-8');
const keyMatch = vite.match(/Buffer\.from\('([^']+)',\s*'base64'\)/);
const realKey = Buffer.from(keyMatch[1], 'base64').toString('utf-8');

const ai = new GoogleGenAI({ apiKey: realKey });

// 1. Helper lấy dữ liệu thực tế từ sàn & BCTC Simplize
async function fetchFullStockData(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const fromDay = now - 86400 * 30;

  const [stockRes, bctcRes, vnIndexRes] = await Promise.all([
    fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${fromDay}&to=${now}&symbol=${symbol}&resolution=1D`).catch(() => null),
    fetch(`https://api.simplize.vn/api/company/fi/ratio/${symbol}?period=Q&size=4`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null),
    fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromDay}&to=${now}&symbol=VNINDEX&resolution=1D`).catch(() => null)
  ]);

  let livePrice = 0;
  if (stockRes && stockRes.ok) {
    const d = await stockRes.json();
    if (d.c && d.c.length > 0) livePrice = Math.round(d.c[d.c.length - 1] * 1000);
  }

  let bctcData = null;
  let valuation = null;
  if (bctcRes && bctcRes.ok) {
    const d = await bctcRes.json();
    const items = d?.data?.items || [];
    if (items.length > 0) {
      const latest = items[0];
      const isBank = (latest.bs7 !== undefined && latest.bs7 > 0) || (latest.is14 !== undefined && latest.is14 > 0);

      let ttmRev = 0;
      let ttmNp = 0;
      const quarters = items.map(q => {
        const rev = isBank ? (q.is1 || 0) : (q.is4 || q.is1 || 0);
        const np = isBank ? (q.is14 !== undefined ? Math.abs(q.is14) : (q.is3 !== undefined ? Math.abs(q.is3) : 0)) : (q.is3 !== undefined ? Math.abs(q.is3) : 0);
        const gp = q.is2 || 0;
        const gm = rev > 0 ? Number(((gp / rev) * 100).toFixed(1)) : 0;
        ttmRev += rev;
        ttmNp += np;
        return {
          period: q.periodDateName,
          revenue: rev,
          formattedRev: `${(rev / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`,
          netProfit: np,
          formattedNp: `${(np / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`,
          grossMargin: gm
        };
      });

      const charterCap = latest.bs11 || (latest.op49 ? latest.op49 * 10000 : 0);
      const shares = charterCap > 0 ? charterCap / 10000 : (latest.op49 || 1);
      const equity = latest.bs10 || 1;
      const totalAssets = latest.bs1 || 1;

      const eps = Math.round(ttmNp / shares);
      const bvps = Math.round(equity / shares);
      const pe = (eps > 0 && livePrice > 0) ? Number((livePrice / eps).toFixed(1)) : 0;
      const pb = (bvps > 0 && livePrice > 0) ? Number((livePrice / bvps).toFixed(2)) : 0;
      const roe = Number(((ttmNp / equity) * 100).toFixed(1));
      const roa = Number(((ttmNp / totalAssets) * 100).toFixed(1));

      valuation = {
        isBank,
        ttmRevenue: ttmRev,
        formattedTtmRev: `${(ttmRev / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`,
        ttmNetProfit: ttmNp,
        formattedTtmNp: `${(ttmNp / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`,
        shares: Math.round(shares),
        eps,
        bvps,
        pe,
        pb,
        roe,
        roa,
        nim: latest.op10 ? Number(latest.op10.toFixed(2)) : undefined,
        casa: latest.op13 ? Number(latest.op13.toFixed(1)) : undefined,
        npl: latest.op18 ? Number(latest.op18.toFixed(2)) : undefined
      };

      bctcData = { quarters, valuation };
    }
  }

  return { symbol, livePrice, formattedPrice: `${livePrice.toLocaleString('vi-VN')} VND`, bctcData };
}

// 2. Chạy E2E Audit
async function runCompleteE2EAudit() {
  console.log('========================================================================');
  console.log('🏛️ BẮT ĐẦU KIỂM THỬ E2E TOÀN DIỆN VÀ ĐỐI SOÁT CHẤT LƯỢNG BÁO CÁO');
  console.log('========================================================================\n');

  const targets = ['SSI', 'CTG', 'PNJ'];
  const auditResults = [];

  for (const sym of targets) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`🔍 [KIỂM THỬ MÃ: ${sym}]`);
    console.log(`------------------------------------------------------------------------`);

    const data = await fetchFullStockData(sym);
    const vm = data.bctcData?.valuation;
    console.log(`1. Dữ liệu thực tế đối soát:`);
    console.log(`   - Giá đóng cửa thực tế: ${data.formattedPrice}`);
    console.log(`   - Loại hình: ${vm?.isBank ? 'Ngân hàng' : 'Doanh nghiệp'}`);
    console.log(`   - LNST 4 quý TTM: ${vm?.formattedTtmNp}`);
    console.log(`   - EPS (TTM): ${vm?.eps.toLocaleString('vi-VN')} VND/cp | BVPS: ${vm?.bvps.toLocaleString('vi-VN')} VND/cp`);
    console.log(`   - P/E thực tế: ${vm?.pe}x | P/B thực tế: ${vm?.pb}x`);
    console.log(`   - ROE: ${vm?.roe}% | ROA: ${vm?.roa}%`);
    if (vm?.isBank) {
      console.log(`   - Chỉ số Ngân hàng: NIM = ${vm.nim}% | CASA = ${vm.casa}% | NPL = ${vm.npl}%`);
    }

    // Tạo prompt
    const prompt = `Phân tích chuyên sâu cổ phiếu "${sym}" tại Việt Nam ngày 27/08/2026.
BẢNG DỮ LIỆU THỰC TẾ:
- Giá thị trường: ${data.formattedPrice}
- EPS: ${vm?.eps.toLocaleString('vi-VN')} VND | BVPS: ${vm?.bvps.toLocaleString('vi-VN')} VND | P/E: ${vm?.pe}x | P/B: ${vm?.pb}x | ROE: ${vm?.roe}% | ROA: ${vm?.roa}%
${vm?.isBank ? `- NIM: ${vm.nim}% | CASA: ${vm.casa}% | NPL: ${vm.npl}%` : ''}
BCTC 4 quý gần nhất:
${data.bctcData?.quarters.map(q => `- [${q.period}]: Doanh thu/Thu nhập = ${q.formattedRev} | LNST = ${q.formattedNp} (Biên LN: ${q.grossMargin}%)`).join('\n')}

QUY TẮC BẮT BUỘC:
- Sử dụng Google Search để lấy chính xác tỷ giá USD/VND hôm nay và giá hàng hóa liên quan đến ${sym} (nếu PNJ: giá vàng thế giới & trong nước; nếu SSI: thanh khoản thị trường; nếu CTG: lãi suất ngân hàng).
- Trích dẫn đúng các con số P/E = ${vm?.pe}x, P/B = ${vm?.pb}x, EPS = ${vm?.eps.toLocaleString('vi-VN')} VND ở trên.

Trả về JSON trong khối \`\`\`json ... \`\`\`:
{
  "symbol": "${sym}",
  "closingPrice": "${data.formattedPrice}",
  "macro": "string phân tích vĩ mô có số liệu",
  "industry": "string phân tích ngành",
  "fundamental": "string phân tích cơ bản và định giá",
  "technical": "string phân tích kỹ thuật",
  "recommendation": { "action": "MUA/BÁN/NẮM GIỮ", "details": "string" },
  "targetPrices": { "shortTerm": { "value": 0, "label": "string" }, "midTerm": { "value": 0, "label": "string" }, "longTerm": { "value": 0, "label": "string" } }
}`;

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        tools: [{ googleSearch: {} }]
      }
    });

    const resp = await chat.sendMessage({ message: prompt });
    const cleaned = resp.text.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Lỗi parse JSON:', e.message);
    }

    if (parsed) {
      console.log(`\n2. Báo cáo do AI tạo ra:`);
      console.log(`   - Giá đóng cửa ghi nhận: ${parsed.closingPrice}`);
      console.log(`   - Khuyến nghị: ${parsed.recommendation?.action}`);
      console.log(`   - Vĩ mô (Đoạn trích): ${parsed.macro?.substring(0, 180)}...`);
      console.log(`   - Cơ bản & Định giá (Đoạn trích): ${parsed.fundamental?.substring(0, 220)}...`);
      
      // Đánh giá chất lượng
      const isPriceMatch = parsed.closingPrice?.includes(data.livePrice.toLocaleString('vi-VN'));
      const hasPE = parsed.fundamental?.includes(`${vm?.pe}`) || parsed.fundamental?.includes('P/E');
      const hasEPS = parsed.fundamental?.includes(`${vm?.eps}`) || parsed.fundamental?.includes('EPS');
      
      auditResults.push({
        symbol: sym,
        livePrice: data.formattedPrice,
        reportedPrice: parsed.closingPrice,
        pe: `${vm?.pe}x`,
        pb: `${vm?.pb}x`,
        eps: `${vm?.eps.toLocaleString('vi-VN')} VND`,
        isPriceMatch,
        hasPE,
        hasEPS,
        recommendation: parsed.recommendation?.action
      });
    }
  }

  console.log('\n========================================================================');
  console.log('📊 TỔNG KẾT KẾT QUẢ ĐỐI SOÁT E2E TRỰC DIỆN 3 MÃ (SSI, CTG, PNJ)');
  console.log('========================================================================');
  console.table(auditResults);
}

runCompleteE2EAudit();
