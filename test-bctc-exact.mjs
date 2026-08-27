async function testExactBCTCAll() {
  const symbols = ['PNJ', 'HPG', 'CTG', 'SSI', 'VCB', 'MWG', 'VHM'];

  for (const sym of symbols) {
    const res = await fetch(`https://api.simplize.vn/api/company/fi/ratio/${sym}?period=Q&size=2`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.ok) {
      const data = await res.json();
      const q = data?.data?.items?.[0];
      if (q) {
        // is1: Doanh thu thuần (chuẩn VAS)
        const rev = q.is1 || q.is4 || 0;
        // is14: LNST của cổ đông công ty mẹ (có dấu âm/dương chuẩn xác)
        const np = q.is14 !== undefined && q.is14 !== 0 ? q.is14 : (q.is50 !== undefined && q.is50 !== 0 ? q.is50 : (q.is3 || 0));
        const gp = q.is2 || 0;
        const gm = rev > 0 ? Number(((gp / rev) * 100).toFixed(1)) : 0;

        const fmtTỷ = (v) => `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`;
        console.log(`[${sym.padEnd(5)}] [${q.periodDateName}]: Doanh thu thuần = ${fmtTỷ(rev)} | LNST = ${fmtTỷ(np)} (Biên LN gộp: ${gm}%)`);
      }
    }
  }
}

testExactBCTCAll();
