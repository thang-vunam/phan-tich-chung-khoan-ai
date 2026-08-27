async function testCTGFinancials() {
  const res = await fetch('https://api.simplize.vn/api/company/fi/ratio/CTG?period=Q&size=4', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (res.ok) {
    const data = await res.json();
    console.log('CTG raw items:', JSON.stringify(data?.data?.items, null, 2));
  } else {
    console.log('Simplize CTG status:', res.status);
  }
}

testCTGFinancials();
