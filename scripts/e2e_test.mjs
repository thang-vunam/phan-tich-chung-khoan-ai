import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const FREE_KEY = 'AIzaSyDZVB-Lk5gQLAaKKqGyWbj75iIs_4fMxG4';
const PAID_KEY = 'AIzaSyBhfnznexZa-6v8ycwySvG8Go9IDN_t9AA';
const PRO_MODEL = 'gemini-2.5-flash';

console.log('====================================================');
console.log('🚀 STARTING COMPREHENSIVE E2E PROJECT VERIFICATION');
console.log('====================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

// 1. Check helper parser
function testJsonParser() {
  console.log('📌 [TEST SUITE 1] Testing JSON Parsing & Markdown Extraction...');
  const sample1 = '```json\n{"assumedDate":"20/08/2026","closingPrice":"35.200 VND","marketSentiment":{"score":75,"summary":"Tích cực"}}\n```';
  const match = sample1.match(/```json\s*([\s\S]*?)\s*```/i);
  const parsed1 = JSON.parse(match[1].trim());
  assert(parsed1.closingPrice === '35.200 VND', 'Successfully extracted JSON from Markdown codeblock');
  assert(parsed1.marketSentiment.score === 75, 'Successfully extracted nested object values');
}

// 2. Test Live Gemini API Call for Stock Analysis (SSI)
async function testStockAnalysis() {
  console.log('\n📌 [TEST SUITE 2] Testing Live Stock Analysis (Single Ticker: SSI)...');
  const ai = new GoogleGenAI({ apiKey: FREE_KEY });
  const chat = ai.chats.create({
    model: PRO_MODEL,
    config: {
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
      systemInstruction: `Bạn là trợ lý phân tích chứng khoán chuyên nghiệp. LUÔN sử dụng Google Search để lấy dữ liệu giá và tin tức thực tế mới nhất. KHÔNG ĐƯỢC giả định hoặc tự tạo ra số liệu nếu không tìm thấy dữ liệu thực tế. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`,
    },
  });

  const prompt = `Bạn là chuyên gia phân tích chứng khoán VN. Phân tích mã "SSI".
Tính đến 20/08/2026. Sử dụng Google Search.
Trả về JSON cấu trúc:
{
  "assumedDate": "string",
  "closingPrice": "string",
  "marketSentiment": { "score": 70, "summary": "markdown", "vnIndexTrend": "string", "foreignInvestors": "string", "liquidity": "string" },
  "stockSentiment": { "score": 75, "summary": "markdown" },
  "macro": "markdown", "industry": "markdown", "fundamental": "markdown", "technical": "markdown", "forumSentiment": "markdown",
  "recommendation": { "action": "MUA", "details": "markdown" },
  "targetPrices": { 
    "shortTerm": { "value": 38000, "label": "38.000 VND" }, 
    "midTerm": { "value": 42000, "label": "42.000 VND" }, 
    "longTerm": { "value": 50000, "label": "50.000 VND" } 
  },
  "news": [{ "title": "string", "url": "string" }]
}`;

  const response = await chat.sendMessage({ message: prompt });
  const text = response.text;
  assert(text && text.length > 50, 'Gemini responded with non-empty content');

  let cleanStr = text.trim();
  const match = cleanStr.match(/```json\s*([\s\S]*?)\s*```/i);
  if (match) cleanStr = match[1].trim();
  else {
    const first = cleanStr.indexOf('{');
    const last = cleanStr.lastIndexOf('}');
    if (first !== -1 && last !== -1) cleanStr = cleanStr.substring(first, last + 1);
  }

  const parsed = JSON.parse(cleanStr);
  assert(parsed.closingPrice !== undefined, `Parsed closing price: ${parsed.closingPrice}`);
  assert(parsed.recommendation && parsed.recommendation.action, `Recommendation action: ${parsed.recommendation?.action}`);
  assert(parsed.targetPrices && parsed.targetPrices.shortTerm, 'Target prices structure is intact');
}

// 3. Test Live Gemini API Call for Stock Comparison (VCB vs TCB)
async function testStockComparison() {
  console.log('\n📌 [TEST SUITE 3] Testing Live Stock Comparison (VCB vs TCB)...');
  const ai = new GoogleGenAI({ apiKey: FREE_KEY });
  const chat = ai.chats.create({
    model: PRO_MODEL,
    config: {
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
      systemInstruction: `Bạn là chuyên gia so sánh cổ phiếu. LUÔN sử dụng Google Search để lấy dữ liệu giá và tin tức thực tế mới nhất cho cả 2 mã. KHÔNG ĐƯỢC giả định giá. Trả lời bằng tiếng Việt và BẮT BUỘC trả về JSON trong khối \`\`\`json ... \`\`\`.`,
    },
  });

  const prompt = `So sánh VCB và TCB tính đến 20/08/2026.
BẮT BUỘC dùng Google Search.
Trả về JSON cấu trúc:
{
  "assumedDate": "20/08/2026",
  "ticker1": { "symbol": "VCB", "closingPrice": "string", "analysis": { "recommendation": { "action": "string" } } },
  "ticker2": { "symbol": "TCB", "closingPrice": "string", "analysis": { "recommendation": { "action": "string" } } },
  "comparativeSummary": { "overallWinner": "string", "summaryText": "string" }
}`;

  const response = await chat.sendMessage({ message: prompt });
  const text = response.text;
  let cleanStr = text.trim();
  const match = cleanStr.match(/```json\s*([\s\S]*?)\s*```/i);
  if (match) cleanStr = match[1].trim();
  else {
    const first = cleanStr.indexOf('{');
    const last = cleanStr.lastIndexOf('}');
    if (first !== -1 && last !== -1) cleanStr = cleanStr.substring(first, last + 1);
  }

  const parsed = JSON.parse(cleanStr);
  assert(parsed.ticker1 && parsed.ticker1.symbol === 'VCB', 'Ticker 1 comparison object valid');
  assert(parsed.ticker2 && parsed.ticker2.symbol === 'TCB', 'Ticker 2 comparison object valid');
  assert(parsed.comparativeSummary && parsed.comparativeSummary.overallWinner, `Overall winner identified: ${parsed.comparativeSummary?.overallWinner}`);
}

// 4. Test Key Fallback Simulation
async function testFallbackMechanism() {
  console.log('\n📌 [TEST SUITE 4] Testing Free => Paid API Key Fallback Simulation...');
  let currentKey = 'INVALID_DUMMY_KEY';
  let activeMode = 'free';

  async function executeWithFallback(op) {
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      return await op(ai);
    } catch (err) {
      if (activeMode === 'free') {
        console.log('  ⚠️ Simulated Free Key error encountered. Switching to Paid Key...');
        currentKey = PAID_KEY;
        activeMode = 'paid';
        const paidAi = new GoogleGenAI({ apiKey: PAID_KEY });
        return await op(paidAi);
      }
      throw err;
    }
  }

  const result = await executeWithFallback(async (ai) => {
    const chat = ai.chats.create({
      model: PRO_MODEL,
      config: { temperature: 0.1 }
    });
    return await chat.sendMessage({ message: 'Trả lời đúng 1 chữ: OK' });
  });

  assert(activeMode === 'paid', 'Successfully switched active key mode from free to paid');
  assert(result.text.includes('OK'), 'Paid key executed request successfully after fallback');
}

async function runAllTests() {
  try {
    testJsonParser();
    await testStockAnalysis();
    await testStockComparison();
    await testFallbackMechanism();
  } catch (err) {
    console.error('Fatal test error:', err);
    failedTests++;
  } finally {
    console.log('\n====================================================');
    console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================');
    if (failedTests > 0) process.exit(1);
  }
}

runAllTests();
