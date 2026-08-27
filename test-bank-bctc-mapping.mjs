async function testBankVsNormalBCTC() {
  const symbols = ['CTG', 'VCB', 'MBB', 'TCB', 'PNJ', 'HPG', 'SSI', 'FPT'];

  for (const sym of symbols) {
    try {
      const res = await fetch(`https://api.simplize.vn/api/company/fi/ratio/${sym}?period=Q&size=2`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (res.ok) {
        const data = await res.json();
        const q = data?.data?.items?.[0];
        if (q) {
          // Bóc tách chính xác theo chuẩn Kế toán Việt Nam (VAS)
          const isBank = q.bs7 !== undefined && q.bs7 > 0; // Ngân hàng có bs7 (Tiền gửi tại NHNN/TCTD) hoặc is14 (LNST ngân hàng)
          
          let revenue = 0;
          let netProfit = 0;
          let revLabel = 'Doanh thu thuần';

          if (isBank || (q.is14 !== undefined && q.is14 > 0)) {
            revLabel = 'Thu nhập lãi thuần';
            revenue = q.is1 || 0;
            netProfit = q.is14 !== undefined ? q.is14 : q.is3;
          } else {
            revenue = q.is4 || q.is1 || 0;
            netProfit = q.is3 !== undefined ? Math.abs(q.is3) : 0;
          }

          const fmtTỷ = (v) => `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ VND`;
          console.log(`[${sym.padEnd(5)}] [${q.periodDateName}] (${isBank ? 'Ngân hàng' : 'Doanh nghiệp'}): ${revLabel} = ${fmtTỷ(revenue)} | LNST = ${fmtTỷ(netProfit)}`);
        }
      }
    } catch (e) {
      console.log(`[${sym}] Error: ${e.message}`);
    }
  }
}

testBankVsNormalBCTC();
