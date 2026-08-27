async function testBankClassification() {
  const syms = ['CTG', 'VCB', 'MBB', 'HPG', 'PNJ', 'MWG', 'FPT', 'SSI'];
  for (const sym of syms) {
    const res = await fetch(`https://api.simplize.vn/api/company/fi/ratio/${sym}?period=Q&size=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.ok) {
      const d = await res.json();
      const item = d?.data?.items?.[0] || {};
      const isBank = (item.bs7 !== undefined && item.bs7 > 0) && (item.is4 === undefined || item.is4 === 0);
      console.log(`${sym.padEnd(5)} -> isBank: ${isBank} (bs7: ${item.bs7 ? 'Có' : 'Không'}, is4: ${item.is4 ? 'Có' : 'Không'})`);
    }
  }
}
testBankClassification();
