async function checkPNJSimplizeRaw() {
  const res = await fetch('https://api.simplize.vn/api/company/fi/ratio/PNJ?period=Q&size=4', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (res.ok) {
    const data = await res.json();
    const items = data?.data?.items || [];
    console.log('PNJ raw Q2/2026 item:');
    const q2 = items[0];
    console.log('periodDateName:', q2?.periodDateName);
    console.log('is1:', q2?.is1);
    console.log('is2:', q2?.is2);
    console.log('is3:', q2?.is3);
    console.log('is4:', q2?.is4);
    console.log('is14:', q2?.is14);
    console.log('is48 (LNTT):', q2?.is48);
    console.log('is50 (LNST):', q2?.is50);
    console.log('All is* keys:');
    for (const k of Object.keys(q2 || {})) {
      if (k.startsWith('is')) {
        console.log(`  ${k}: ${q2[k]}`);
      }
    }
  }
}

checkPNJSimplizeRaw();
