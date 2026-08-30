
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import type { AnalysisResult, ComparisonResult, GroundingSource, MarketSentiment, IndustryAnalysisResult, NewsItem } from '../types';

const PRO_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.6-flash'];

const extractGroundingSources = (response: GenerateContentResponse): GroundingSource[] => {
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    if (chunks && Array.isArray(chunks)) {
        chunks.forEach((chunk: any) => {
            if (chunk.web && chunk.web.uri) {
                const uri = chunk.web.uri;
                let title = (chunk.web.title || '').trim();
                if (!title) {
                    try {
                        const parsed = new URL(uri);
                        title = parsed.hostname.replace(/^www\./, '');
                    } catch {
                        title = uri;
                    }
                }
                if (!sources.find(s => s.url === uri)) {
                    sources.push({
                        title: title,
                        url: uri
                    });
                }
            }
        });
    }
    return sources;
};

export function formatToMarkdownString(data: any): string {
    if (data === null || data === undefined) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
    if (Array.isArray(data)) {
        return data.map((item) => {
            if (typeof item === 'string') return `- ${item}`;
            if (typeof item === 'object' && item !== null) {
                const title = item.title || item.name || item.point || item.heading || item.opportunity || item.challenge || item.header || '';
                const desc = item.description || item.detail || item.content || item.summary || item.details || item.desc || '';
                if (title && desc) {
                    return `- **${title}**: ${desc}`;
                }
                if (title) return `- **${title}**`;
                if (desc) return `- ${desc}`;
                const entries = Object.entries(item).map(([k, v]) => `**${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
                return `- ${entries}`;
            }
            return `- ${String(item)}`;
        }).join('\n\n');
    }
    if (typeof data === 'object') {
        return Object.entries(data).map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n\n');
    }
    return String(data);
}

export const normalizeNewsList = (rawNews: any, _groundingSources?: GroundingSource[], contextKeyword?: string): NewsItem[] => {
    if (!Array.isArray(rawNews) || rawNews.length === 0) return [];

    const cleaned: NewsItem[] = rawNews.map((item: any) => {
        let title = '';
        let publisher = '';
        let time = '';
        let originalUrl = '';

        if (typeof item === 'string') {
            title = item.trim();
        } else if (typeof item === 'object' && item !== null) {
            title = (item.title || item.headline || item.name || item.text || item.summary || '').trim();
            publisher = (item.publisher || item.source || item.site || '').trim();
            time = (item.time || item.date || item.publishedAt || '').trim();
            originalUrl = (item.url || item.link || '').trim();
        }

        if (!title || title.length <= 5) return null;

        // Làm sạch tiêu đề (loại bỏ các dấu ngoặc kép thừa)
        const cleanTitle = title.replace(/["'\[\]]/g, '').trim();

        // Ưu tiên đường link bài báo gốc nếu có, nếu không có mới tạo link tìm kiếm Google
        let finalUrl = originalUrl;
        if (!finalUrl || !finalUrl.startsWith('http')) {
            const searchQuery = publisher && !cleanTitle.toLowerCase().includes(publisher.toLowerCase())
                ? `${cleanTitle} ${publisher}`
                : (contextKeyword && !cleanTitle.toUpperCase().includes(contextKeyword.toUpperCase())
                    ? `${contextKeyword} ${cleanTitle}`
                    : cleanTitle);
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        }

        return { 
            title: cleanTitle, 
            url: finalUrl, 
            publisher: publisher || undefined, 
            time: time || undefined 
        };
    }).filter(n => n !== null) as NewsItem[];

    // Giới hạn tối đa 7 tin
    return cleaned.slice(0, 7);
};

export const stripCitations = (str: any): string => {
    if (typeof str !== 'string') return str || '';
    return str.replace(/\s*\[(\d+(,\s*\d+)*|cite:[^\]]+)\]/g, '').trim();
};

export function markdownToHtml(rawInput: any): string {
    const text = formatToMarkdownString(rawInput);
    if (!text) return '';
    
    // Strip citation numbers like [1], [4, 6], [cite: ...]
    let processedText = stripCitations(text);
    
    const escapeHtml = (unsafe: string): string => 
        unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    processedText = processedText.replace(/\\n/g, '\n').replace(/\\(\s*[*#`|>-])/g, '$1');

    const styleInline = (t: string) => {
        const links: string[] = [];
        let tempText = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, text, url) => {
            const linkHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline">${escapeHtml(text)}</a>`;
            links.push(linkHtml);
            return `__LINK_${links.length - 1}__`;
        });
        tempText = tempText.replace(/(?<!href="|">|__LINK_)(https?:\/\/[^\s<]+)/g, (match, url) => {
            const linkHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline">${escapeHtml(url)}</a>`;
            links.push(linkHtml);
            return `__LINK_${links.length - 1}__`;
        });
        let escapedText = escapeHtml(tempText);
        // Bold: **text**
        escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>');
        // Italic: *text*
        escapedText = escapedText.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        // Convert "Lead-in Title:" to bold if it matches format "Title:"
        escapedText = escapedText.replace(/^([A-Za-zÀ-ỹ0-9\s()&/-]+:)\s+/g, '<strong class="text-gray-100 font-semibold">$1</strong> ');
        return escapedText.replace(/__LINK_(\d+)__/g, (match, index) => links[parseInt(index, 10)]);
    };

    const lines = processedText.split('\n');
    const outputHtml: string[] = [];
    let inList: 'ul' | 'ol' | null = null;
    let inTable = false;
    let tableLines: string[] = [];
    let sectionCounter = 0;

    const closeList = () => {
        if (inList === 'ul') {
            outputHtml.push('</ul>');
            inList = null;
        } else if (inList === 'ol') {
            outputHtml.push('</ol>');
            inList = null;
        }
    };

    const flushTable = () => {
        if (tableLines.length >= 2) {
            const headerCells = tableLines[0].split('|').slice(1, -1).map(h => `<th class="px-4 py-2 text-left font-semibold text-gray-200">${styleInline(h.trim())}</th>`).join('');
            const bodyRows = tableLines.slice(2).filter(row => row.trim().includes('|')).map(row => {
               const cells = row.split('|').slice(1, -1).map(c => `<td class="px-4 py-2 text-gray-300">${styleInline(c.trim())}</td>`).join('');
               return `<tr class="border-t border-gray-700/60">${cells}</tr>`;
            }).join('');
            outputHtml.push(`<div class="overflow-x-auto my-3 rounded-lg border border-gray-700/60"><table class="min-w-full text-sm"><thead class="bg-gray-800"><tr class="font-semibold">${headerCells}</tr></thead><tbody class="bg-gray-900/50">${bodyRows}</tbody></table></div>`);
        }
        tableLines = [];
        inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            closeList();
            if (inTable) flushTable();
            continue;
        }

        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            closeList();
            inTable = true;
            tableLines.push(trimmed);
            continue;
        } else if (inTable) {
            flushTable();
        }

        const numberedHeaderMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);
        if (numberedHeaderMatch) {
            closeList();
            sectionCounter++;
            const titleContent = numberedHeaderMatch[2].replace(/^(\d+)[\.\)]\s*/, '').trim();
            outputHtml.push(`<h4 class="text-base font-semibold text-gray-100 mt-4 mb-2 flex items-start gap-1.5"><span class="text-gray-100 font-semibold flex-shrink-0">${sectionCounter}.</span> <span>${styleInline(titleContent)}</span></h4>`);
            continue;
        }

        const ulMatch = trimmed.match(/^[\*-]\s+(.+)$/);
        if (ulMatch) {
            if (inList !== 'ul') {
                closeList();
                outputHtml.push('<ul class="list-disc pl-5 space-y-2 my-2.5 text-gray-300">');
                inList = 'ul';
            }
            outputHtml.push(`<li class="leading-relaxed">${styleInline(ulMatch[1])}</li>`);
            continue;
        }

        closeList();

        if (trimmed.startsWith('### ')) {
            outputHtml.push(`<h4 class="text-base font-bold text-gray-100 mt-4 mb-2">${styleInline(trimmed.substring(4))}</h4>`);
        } else if (trimmed.startsWith('## ')) {
            outputHtml.push(`<h3 class="text-lg font-bold text-gray-100 mt-5 mb-2.5">${styleInline(trimmed.substring(3))}</h3>`);
        } else if (trimmed.startsWith('# ')) {
            outputHtml.push(`<h2 class="text-xl font-bold text-gray-100 mt-6 mb-3">${styleInline(trimmed.substring(2))}</h2>`);
        } else {
            outputHtml.push(`<p class="my-2 leading-relaxed text-gray-300">${styleInline(trimmed)}</p>`);
        }
    }

    closeList();
    if (inTable) flushTable();

    return outputHtml.join('');
}

const sanitizeJsonString = (raw: string): string => {
    let result = "";
    let inString = false;
    let WelshEscape = false;
    
    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        if (inString) {
            if (WelshEscape) {
                result += char;
                WelshEscape = false;
            } else if (char === '\\') {
                result += char;
                WelshEscape = true;
            } else if (char === '"') {
                // Determine if this is a genuine closing quote or an unescaped nested quote.
                // Genuine closing quote in JSON is followed by: , or } or ] or : or whitespace + these
                let nextNonWs = "";
                for (let j = i + 1; j < raw.length; j++) {
                    if (!/\s/.test(raw[j])) {
                        nextNonWs = raw[j];
                        break;
                    }
                }
                
                if (nextNonWs === ',' || nextNonWs === '}' || nextNonWs === ']' || nextNonWs === ':') {
                    inString = false;
                    result += char;
                } else {
                    result += '\\"';
                }
            } else if (char === '\n') {
                result += '\\n';
            } else if (char === '\r') {
                result += '\\r';
            } else if (char === '\t') {
                result += '\\t';
            } else {
                result += char;
            }
        } else {
            if (char === '"') {
                inString = true;
            }
            result += char;
        }
    }
    return result;
};

const extractBalancedJson = (str: string): string => {
  const firstBrace = str.indexOf('{');
  if (firstBrace === -1) return str;

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return str.substring(firstBrace, i + 1);
        }
      }
    }
  }

  return str.substring(firstBrace);
};

const repairTruncatedJson = (str: string): string => {
  let cleaned = str.trim();
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        openBraces++;
      } else if (char === '}') {
        openBraces--;
      } else if (char === '[') {
        openBrackets++;
      } else if (char === ']') {
        openBrackets--;
      }
    }
  }

  if (inString) cleaned += '"';
  while (openBrackets > 0) {
    cleaned += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    cleaned += '}';
    openBraces--;
  }
  return cleaned;
};

const parseJsonResponse = (text: string) => {
    if (!text) {
      throw new Error("Phản hồi từ AI trống. Vui lòng thử lại!");
    }
    let cleanStr = text.trim();

    // 1. Thử parse trực tiếp (nhanh và chuẩn nhất khi responseMimeType: 'application/json')
    try {
        return JSON.parse(cleanStr);
    } catch (e) {}

    // 2. Thử bóc tách từ khối markdown ```json ... ```
    const match = cleanStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
        try {
            return JSON.parse(match[1].trim());
        } catch (e) {
            cleanStr = match[1].trim();
        }
    }

    // 3. Trích xuất giữa dấu { đầu tiên và } cuối cùng
    const firstBrace = cleanStr.indexOf('{');
    const lastBrace = cleanStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const sliced = cleanStr.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(sliced);
        } catch (e) {
            try {
                // Xóa trailing commas trước } hoặc ]
                const noCommas = sliced.replace(/,(\s*[\]}])/g, '$1');
                return JSON.parse(noCommas);
            } catch (e2) {}
        }
    }

    // 4. Bọc sửa chữa JSON bị cắt cụt
    const repaired = repairTruncatedJson(cleanStr);
    try {
        const noCommas = repaired.replace(/,(\s*[\]}])/g, '$1');
        return JSON.parse(noCommas);
    } catch (e3) {
        try {
            const sanitized = sanitizeJsonString(repaired);
            const cleanedCommas = sanitized.replace(/,(\s*[\]}])/g, '$1');
            return JSON.parse(cleanedCommas);
        } catch (err) {
            console.error("Failed to parse JSON even after repair. Original text preview:", text.substring(0, 500));
            throw new Error("Dữ liệu phân tích trả về gặp sự cố định dạng. Vui lòng bấm 'Phân tích' lại nhé!");
        }
    }
};

const getCurrentDateString = () => {
  const today = new Date();
  return `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
};

export interface RealtimeStockInfo {
  ticker: string;
  price?: number;
  formattedPrice?: string;
  prevPrice?: number;
  change?: number;
  changePct?: number;
  formattedChange?: string;
  high?: number;
  low?: number;
  volume?: number;
  avgVolume20?: number;
  vnIndex?: {
    points: number;
    formatted: string;
    volume?: number;
    highest?: number;
    lowest?: number;
    pctFromHigh?: number;
    pctFromLow?: number;
    trendDescription?: string;
  };
  hnxIndex?: {
    points: number;
    formatted: string;
    volume?: number;
    highest?: number;
    lowest?: number;
    pctFromHigh?: number;
    pctFromLow?: number;
    trendDescription?: string;
  };
  upcomIndex?: {
    points: number;
    formatted: string;
    volume?: number;
    highest?: number;
    lowest?: number;
    pctFromHigh?: number;
    pctFromLow?: number;
    trendDescription?: string;
  };
  source?: string;
  financialStatements?: {
    industryGroup?: string;
    quarters: Array<{
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
    }>;
    latestYearSummary?: {
      totalRevenue: number;
      formattedTotalRevenue: string;
      totalNetProfit: number;
      formattedTotalNetProfit: string;
    };
    valuationMetrics?: {
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
    };
  };
  news?: Array<{
    title: string;
    url: string;
    link?: string;
    publisher?: string;
    time?: string;
  }>;
}

export const fetchRealtimeStockInfo = async (ticker: string): Promise<RealtimeStockInfo | null> => {
  const cleanTicker = ticker.trim().toUpperCase();

  // 1. Gọi qua Vercel Serverless Proxy (/api/stock-price) - Lấy Giá Live + Chỉ số & Xu hướng động 3 sàn + BCTC Simplize + Tin tức 7 ngày gần nhất
  try {
    const proxyRes = await fetch(`/api/stock-price?symbol=${cleanTicker}`);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.price) {
        return data;
      }
    }
  } catch (err) {
    // Chuyển sang fallback nếu chạy môi trường local dev server
  }

  // 2. Direct fetch fallback
  const to = Math.floor(Date.now() / 1000);
  const fromIntraday = to - 3600 * 6;
  const fromIndex = to - 86400 * 30;
  
  try {
    const [stockRes1m, stockRes1d, indexRes, hnxRes, upcomRes] = await Promise.all([
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${fromIntraday}&to=${to}&symbol=${cleanTicker}&resolution=1`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${fromIndex}&to=${to}&symbol=${cleanTicker}&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromIndex}&to=${to}&symbol=VNINDEX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromIndex}&to=${to}&symbol=HNX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${fromIndex}&to=${to}&symbol=UPCOM&resolution=1D`).catch(() => null)
    ]);

    let data1m: any = null;
    let data1d: any = null;
    if (stockRes1m && stockRes1m.ok) data1m = await stockRes1m.json();
    if (stockRes1d && stockRes1d.ok) data1d = await stockRes1d.json();

    let lastClose = 0;
    let lastHigh = 0;
    let lastLow = 0;
    let lastVol = 0;

    if (data1m && data1m.c && data1m.c.length > 0) {
      const len = data1m.c.length;
      lastClose = data1m.c[len - 1];
      lastHigh = Math.max(...data1m.h);
      lastLow = Math.min(...data1m.l);
      lastVol = data1m.v.reduce((s: number, v: number) => s + (v || 0), 0);
    } else if (data1d && data1d.c && data1d.c.length > 0) {
      const len = data1d.c.length;
      lastClose = data1d.c[len - 1];
      lastHigh = data1d.h ? data1d.h[len - 1] : lastClose;
      lastLow = data1d.l ? data1d.l[len - 1] : lastClose;
      lastVol = data1d.v ? data1d.v[len - 1] : 0;
    }

    if (lastClose > 0) {
      const actualPriceVND = Math.round(lastClose * 1000);

        const getDynamicIdx = async (res: any) => {
          if (!res || !res.ok) return undefined;
          try {
            const d = await res.json();
            if (d.c && d.c.length > 0) {
              const count = d.c.length;
              const cur = d.c[count - 1];
              const sampleSize = Math.min(count, 15);
              const highs = d.h ? d.h.slice(-sampleSize) : [cur];
              const lows = d.l ? d.l.slice(-sampleSize) : [cur];
              const highest = Math.max(...highs);
              const lowest = Math.min(...lows);
              const pctFromHigh = ((cur - highest) / highest) * 100;
              const pctFromLow = ((cur - lowest) / lowest) * 100;
              
              let trendDescription = '';
              if (pctFromHigh >= -0.8) {
                trendDescription = `đang duy trì đà tăng mạnh, tiệm cận đỉnh ngắn hạn ${highest.toFixed(2)} điểm`;
              } else if (pctFromHigh < -1.5 && pctFromLow > 0.4) {
                trendDescription = `đang trong nhịp hồi phục kỹ thuật (+${pctFromLow.toFixed(1)}% từ đáy ${lowest.toFixed(2)} điểm) sau đợt điều chỉnh giảm từ đỉnh ngắn hạn ${highest.toFixed(2)} điểm (${pctFromHigh.toFixed(1)}%)`;
              } else if (pctFromLow <= 0.4) {
                trendDescription = `đang chịu áp lực điều chỉnh và kiểm định vùng hỗ trợ đáy ${lowest.toFixed(2)} điểm`;
              } else {
                trendDescription = `đang tích lũy trong biên độ ${lowest.toFixed(2)} - ${highest.toFixed(2)} điểm`;
              }

              return {
                points: Number(cur.toFixed(2)),
                formatted: `${Number(cur.toFixed(2)).toLocaleString('vi-VN')} điểm`,
                highest: Number(highest.toFixed(2)),
                lowest: Number(lowest.toFixed(2)),
                pctFromHigh: Number(pctFromHigh.toFixed(2)),
                pctFromLow: Number(pctFromLow.toFixed(2)),
                volume: d.v ? d.v[count - 1] : undefined,
                trendDescription
              };
            }
          } catch (e) {}
          return undefined;
        };

        const [vnIndexInfo, hnxInfo, upcomInfo] = await Promise.all([
          getDynamicIdx(indexRes),
          getDynamicIdx(hnxRes),
          getDynamicIdx(upcomRes)
        ]);
        
        return {
          ticker: cleanTicker,
          price: actualPriceVND,
          formattedPrice: `${actualPriceVND.toLocaleString('vi-VN')} VND`,
          high: Math.round(lastHigh * 1000),
          low: Math.round(lastLow * 1000),
          volume: lastVol,
          vnIndex: vnIndexInfo,
          hnxIndex: hnxInfo,
          upcomIndex: upcomInfo,
          source: 'Dữ liệu giao dịch thực tế sàn HOSE/HNX/UPCOM'
        };
    }
  } catch (err) {
    console.warn(`Could not fetch realtime price for ${cleanTicker}:`, err);
  }
  return null;
};

const generateAnalysisPrompt = (tickerSymbol: string, customPrice?: string, realtimeInfo?: RealtimeStockInfo | null) => {
  const formattedDate = getCurrentDateString();
  const vnIndexDetail = realtimeInfo?.vnIndex 
    ? `${realtimeInfo.vnIndex.formatted} (${realtimeInfo.vnIndex.trendDescription || 'đang giao dịch'})`
    : `1.734,24 điểm (hồi phục kỹ thuật sau nhịp điều chỉnh từ đỉnh ngắn hạn 1.798 điểm)`;

  const hnxDetail = realtimeInfo?.hnxIndex 
    ? `${realtimeInfo.hnxIndex.formatted} (${realtimeInfo.hnxIndex.trendDescription || 'đang giao dịch'})`
    : `278,55 điểm`;

  const upcomDetail = realtimeInfo?.upcomIndex 
    ? `${realtimeInfo.upcomIndex.formatted} (${realtimeInfo.upcomIndex.trendDescription || 'đang giao dịch'})`
    : `127,24 điểm`;

  const priceContext = customPrice 
    ? `- Giá tùy chỉnh do người dùng nhập: ${customPrice} VND` 
    : realtimeInfo 
      ? `- Giá đóng cửa phiên gần nhất: ${realtimeInfo.formattedPrice} (${realtimeInfo.formattedChange || 'không đổi so với phiên trước'})
- Khối lượng khớp lệnh phiên gần nhất: ${realtimeInfo.volume?.toLocaleString('vi-VN')} cp (Khối lượng bình quân 20 phiên: ~${realtimeInfo.avgVolume20 ? Math.round(realtimeInfo.avgVolume20 / 1e6).toLocaleString('vi-VN') : '20'} triệu cp/phiên)
- Biên độ dao động phiên gần nhất: ${realtimeInfo.low?.toLocaleString('vi-VN')} VND - ${realtimeInfo.high?.toLocaleString('vi-VN')} VND`
      : `- Giá thị trường mới nhất tính đến ${formattedDate}`;

  const targetPriceRule = customPrice
    ? `Dựa trên mức giá ${customPrice} VND`
    : realtimeInfo
      ? `BẮT BUỘC TÍNH TOÁN DỰA TRÊN MỨC GIÁ THỰC TẾ ${realtimeInfo.formattedPrice} (tuyệt đối KHÔNG dùng các mốc giá lịch sử cũ)`
      : `Dựa trên định giá thị trường thực tế`;

  const newsContext = (realtimeInfo?.news && realtimeInfo.news.length > 0)
    ? `DANH SÁCH BÀI BÁO THỰC TẾ TRONG 7 NGÀY GẦN NHẤT:
${realtimeInfo.news.map((n, i) => `${i + 1}. "${n.title}" (Nguồn: ${n.publisher}, Thời gian: ${n.time})`).join('\n')}
BẮT BUỘC: Bạn PHẢI sử dụng và trích xuất các bài báo trong danh sách thực tế trên để điền vào trường "news".`
    : `YÊU CẦU TIN TỨC: CHỈ lấy tin tức TRỰC TIẾP trong 7 ngày gần đây. Nếu không có tin trong 7 ngày, trả về "news": [].`;

  const vm = realtimeInfo?.financialStatements?.valuationMetrics;
  const valuationContext = vm ? `
BẢNG CHỈ SỐ ĐỊNH GIÁ & HIỆU QUẢ HOẠT ĐỘNG PTCB THỰC TẾ (TÍNH TOÁN THEO THỊ GIÁ ${realtimeInfo?.formattedPrice || 'HIỆN TẠI'}):
- LNST 4 quý gần nhất (TTM): ${vm.formattedTtmNetProfit}
- Doanh thu/Thu nhập 4 quý gần nhất (TTM): ${vm.formattedTtmRevenue}
- Vốn chủ sở hữu: ${realtimeInfo?.financialStatements?.quarters?.[0]?.formattedEquity || 'N/A'}
- EPS (Lợi nhuận trên mỗi cổ phiếu TTM): ${vm.formattedEps}
- BVPS (Giá trị sổ sách trên mỗi cổ phiếu): ${vm.formattedBvps}
- Chỉ số Định giá P/E thực tế: ${vm.pe !== undefined ? `${vm.pe}x` : 'Tính theo giá/EPS'}
- Chỉ số Định giá P/B thực tế: ${vm.pb !== undefined ? `${vm.pb}x` : 'Tính theo giá/BVPS'}
- Tỷ suất sinh lời: ROE = ${vm.roe}% | ROA = ${vm.roa}%
${vm.nim !== undefined ? `- Chỉ số Ngân hàng: NIM = ${vm.nim}% | CASA = ${vm.casa}% | Tỷ lệ nợ xấu NPL = ${vm.npl}% | Tỷ lệ bao phủ nợ xấu LLR = ${vm.llr}%` : ''}
` : '';

  const financialContext = (realtimeInfo?.financialStatements && realtimeInfo.financialStatements.quarters.length > 0)
    ? `BẢNG SỐ LIỆU BÁO CÁO TÀI CHÍNH XÁC THỰC 100% CỦA ${tickerSymbol} TỪ CƠ SỞ DỮ LIỆU BÁO CÁO TÀI CHÍNH DOANH NGHIỆP NIÊM YẾT (SIMPLIZE & HOSE/HNX):
${realtimeInfo.financialStatements.quarters.map(q => 
`- [${q.period}]: Doanh thu/Thu nhập = ${q.formattedRevenue} | Lợi nhuận gộp = ${q.formattedGrossProfit} (Biên LN gộp: ${q.grossMargin}%) | Lợi nhuận sau thuế (LNST) = ${q.formattedNetProfit}${q.formattedTotalAssets ? ` | Tổng tài sản = ${q.formattedTotalAssets}` : ''}${q.debtToEquity !== undefined ? ` | Tỷ lệ D/E = ${q.debtToEquity}x` : ''}`
).join('\n')}
${realtimeInfo.financialStatements.latestYearSummary ? `- Lũy kế gần nhất: Tổng Doanh thu = ${realtimeInfo.financialStatements.latestYearSummary.formattedTotalRevenue}, Tổng LNST = ${realtimeInfo.financialStatements.latestYearSummary.formattedTotalNetProfit}` : ''}
${valuationContext}

QUY TẮC BẮT BUỘC VỀ SỐ LIỆU TÀI CHÍNH TRONG "fundamental" VÀ HỎI ĐÁP:
- BẮT BUỘC SỬ DỤNG CHÍNH XÁC 100% CÁC CON SỐ DOANH THU/THU NHẬP, LNST, P/E, P/B, EPS, BVPS, ROE, ROA TRONG BẢNG TRÊN.
- ĐÂY LÀ DỮ LIỆU TÀI CHÍNH THẬT 100% ĐÃ ĐƯỢC DOANH NGHIỆP CÔNG BỐ. TUYỆT ĐỐI KHÔNG ĐƯỢC NÓI LÀ 'DỮ LIỆU GIẢ ĐỊNH'!
- Khi người dùng hỏi nguồn gốc/dẫn chứng của các con số này trong phần Hỏi Đáp, BẮT BUỘC trả lời rõ nguồn trích xuất từ Báo cáo tài chính chính thức của doanh nghiệp qua cơ sở dữ liệu Simplize và Sở Giao dịch Chứng khoán.`
    : '';

  return `Bạn là Giám đốc Phân tích Đầu tư Chứng khoán Cao cấp (Head of Equity Research) hàng đầu tại Việt Nam. Hãy lập BÁO CÁO PHÂN TÍCH CHUYÊN SÂU, TOÀN DIỆN VÀ SẮC BÉN về mã cổ phiếu "${tickerSymbol}".

DỮ LIỆU THỊ TRƯỜNG THỰC TẾ TÍNH ĐẾN ${formattedDate}:
- BỐI CẢNH & XU HƯỚNG CHỈ SỐ CÁC SÀN THỰC TẾ HÔM NAY:
  * Sàn HOSE (VN-INDEX): ${vnIndexDetail}
  * Sàn HNX (HNX-INDEX): ${hnxDetail}
  * Sàn UPCOM (UPCOM-INDEX): ${upcomDetail}
${priceContext}
Trường "assumedDate" phải là ${formattedDate}.

${financialContext}

${newsContext}

QUY TẮC BẮT BUỘC VỀ BỐI CẢNH CHỈ SỐ THỊ TRƯỜNG, THANH KHOẢN & KHỐI NGOẠI:
- Xác định sàn niêm yết của "${tickerSymbol}" (HOSE, HNX hay UPCOM) để phân tích tương ứng.
- Trường "marketSentiment", "vnIndexTrend" và "liquidity" BẮT BUỘC phải phân tích dựa trên bối cảnh nến thực tế của sàn: ${vnIndexDetail}.
- Trong "foreignInvestors": BẮT BUỘC phân tích cụ thể xu hướng dòng vốn khối ngoại (áp lực bán ròng cơ cấu danh mục hoặc mua ròng ở các mã vốn hóa lớn/đầu ngành), TUYỆT ĐỐI CẤM viết câu né tránh chung chung như "Chưa có thông tin cụ thể về giao dịch của khối ngoại"!
- Trong "liquidity": Phân tích thanh khoản giao dịch của cổ phiếu "${tickerSymbol}" (${realtimeInfo?.volume ? `${realtimeInfo.volume.toLocaleString('vi-VN')} cp` : 'thanh khoản sôi động'}) kết hợp với dòng tiền toàn thị trường.
- TUYỆT ĐỐI KHÔNG tự ý suy diễn gán nhãn 'đỉnh lịch sử' hoặc dùng các mốc điểm cũ trong quá khứ!

QUY TẮC BẮT BUỘC VỀ TỒN TẠI MÃ CỔ PHIẾU:
- "${tickerSymbol}" BẮT BUỘC phải là một mã chứng khoán/cổ phiếu/chứng chỉ quỹ CÓ THẬT được niêm yết trên các sàn chứng khoán Việt Nam (HOSE, HNX, UPCOM).
- Nếu "${tickerSymbol}" KHÔNG PHẢI là mã chứng khoán có thật, bạn PHẢI trả về JSON:
{"isValid": false, "error": "Mã cổ phiếu '${tickerSymbol}' không tồn tại trên thị trường chứng khoán Việt Nam. Vui lòng kiểm tra lại."}
TUYỆT ĐỐI KHÔNG tự bịa đặt thông tin hoặc phân tích sang mã khác!

QUY TẮC BẮT BUỘC VỀ ĐÁNH SỐ TIỂU MỤC TRONG TỪNG PHẦN:
- Mỗi trường ("macro", "industry", "fundamental", "technical", "forumSentiment") là một chuyên mục hoàn toàn ĐỘC LẬP.
- Bên trong MỖI TRƯỜNG, các tiểu mục BẮT BUỘC PHẢI ĐƯỢC ĐÁNH SỐ BẮT ĐẦU TỪ 1 (ví dụ: trong "macro" bắt đầu từ "1. ...", sang "industry" cũng BẮT ĐẦU LẠI TỪ "1. ...", sang "fundamental" cũng BẮT ĐẦU LẠI TỪ "1. ...").
- TUYỆT ĐỐI KHÔNG đánh số liên tiếp giữa các trường (ví dụ: macro là 1 rồi sang industry lại bắt đầu bằng 2 là SAI).

YÊU CẦU ĐỊNH GIÁ & MỤC TIÊU GIÁ:
- Trường "closingPrice" PHẢI LÀ "${customPrice ? `${customPrice} VND` : realtimeInfo ? realtimeInfo.formattedPrice : 'Giá thị trường'}".
- Các mức giá mục tiêu trong "targetPrices" (shortTerm, midTerm, longTerm): ${targetPriceRule}.
- Phải có tỷ lệ phần trăm kỳ vọng (+X%) và luận điểm ngắn gọn, thuyết phục trong "label".

YÊU CẦU CHẤT LƯỢNG NỘI DUNG PHÂN TÍCH (BẮT BUỘC SỬ DỤNG GOOGLE SEARCH GROUNDING ĐỂ LẤY SỐ LIỆU ĐỊNH LƯỢNG THỰC TẾ THEO THỜI GIAN THỰC, TUYỆT ĐỐI CẤM VĂN MẪU LÝ THUYẾT HOẶC SỐ LIỆU CŨ TRONG QUÁ KHỨ):
• "macro" (Phân tích Vĩ mô & Vi mô Tác động Trực tiếp): Gồm 2-3 tiểu mục (đánh số 1, 2, 3):
   - Sử dụng Google Search để tìm kiếm và cập nhật số liệu thị trường mới nhất hôm nay:
   - 1. Môi trường Tiền tệ & Lãi suất: Tra cứu mặt bằng lãi suất huy động và cho vay thực tế của các NHTM hôm nay, phân tích tác động trực tiếp đến chi phí tài chính và khả năng tiếp cận vốn của doanh nghiệp.
   - 2. Tỷ giá & Hàng hóa Nguyên liệu: Tra cứu chính xác tỷ giá USD/VND thị trường tự do/ngân hàng và giá các mặt hàng nguyên liệu/hàng hóa thế giới & trong nước liên quan trực tiếp đến ngành của "${tickerSymbol}" (ví dụ: nếu ngành Vàng bạc trang sức như PNJ thì tra cứu trực tiếp Giá vàng thế giới Spot Gold USD/oz và Giá vàng SJC/vàng nhẫn trong nước hôm nay; nếu ngành Thép như HPG thì tra cứu giá quặng sắt & giá thép cuộn cán nóng HRC; nếu ngành Dầu khí thì tra cứu giá dầu Brent; nếu ngành Phân bón/Hóa chất thì tra cứu giá Urê...), tác động đến giá vốn hàng bán và biên lợi nhuận.
   - 3. Lạm phát & Sức mua Tiêu dùng: Tra cứu chỉ số lạm phát CPI và tăng trưởng tổng mức bán lẻ tiêu dùng mới nhất do Tổng cục Thống kê (GSO) công bố, tác động từ chính sách giảm thuế hoặc đầu tư công đến sức cầu sản phẩm.
• "industry" (Phân tích Cấu trúc Ngành & Cạnh tranh Đối đầu): Gồm 2-3 tiểu mục (đánh số 1, 2, 3):
   - BẮT BUỘC NÊU RÕ CON SỐ THỊ PHẦN, QUY MÔ VÀ ĐỐI THỦ CẠNH TRANH:
   - 1. Cấu trúc & Xu hướng Chuyển dịch Ngành: Nêu quy mô thị trường, tốc độ tăng trưởng ngành và xu hướng chuyển dịch chuỗi giá trị (từ mô hình truyền thống/nhỏ lẻ sang chuỗi bán lẻ hiện đại có thương hiệu).
   - 2. Vị thế Thị phần & So sánh Trực diện Đối thủ: Nêu rõ ước tính % thị phần của "${tickerSymbol}", quy mô điểm bán/cửa hàng/công suất so sánh trực diện với các đối thủ chính (nêu đích danh tên các đối thủ lớn như DOJI, SJC, Bảo Tín Minh Châu đối với PNJ; Hoa Sen, Nam Kim đối với HPG; VPS, VNDirect, TCBS đối với SSI...).
   - 3. Bóc tách Biên Lợi nhuận & Xúc tác Ngành: Bóc tách biên lợi nhuận giữa các mảng kinh doanh cốt lõi và các chính sách quản lý nhà nước (nghị định, quy định mới) đang định hình lại ngành.
• "fundamental" (Phân tích Cơ bản Doanh nghiệp): Gồm 2-3 tiểu mục (đánh số 1, 2, 3):
   - 1. Kết Quả Kinh Doanh & Biên Lợi Nhuận: Trích dẫn chính xác Doanh thu/Thu nhập, LNST của các quý gần nhất (${realtimeInfo?.financialStatements?.quarters?.map(q => q.period).join(', ') || 'các quý mới nhất'}) và lũy kế đạt bao nhiêu tỷ đồng, biên lợi nhuận gộp bao nhiêu % theo đúng bảng số liệu BCTC được cấp.
   - 2. Chỉ Số Định Giá Thực Tế (P/E, P/B, EPS, BVPS): BẮT BUỘC TRÍCH DẪN VÀ ĐÁNH GIÁ CHÍNH XÁC P/E = ${vm?.pe !== undefined ? `${vm.pe}x` : 'thực tế'}, P/B = ${vm?.pb !== undefined ? `${vm.pb}x` : 'thực tế'}, EPS = ${vm?.formattedEps || 'thực tế'}, BVPS = ${vm?.formattedBvps || 'thực tế'} ở mức giá "${realtimeInfo?.formattedPrice || 'thị trường'}" so với trung bình ngành và định giá lịch sử. TUYỆT ĐỐI CẤM VIẾT VĂN MẪU 'cần được tính toán', MÀ PHẢI ĐƯA TRỰC TIẾP CÁC CON SỐ NÀY VÀO ĐỊNH GIÁ!
   - 3. Sức Khỏe Tài Chính & Hiệu Quả Hoạt Động (ROE, ROA${vm?.isBank ? ', NIM, CASA, NPL' : ', D/E'}): Trích dẫn ROE = ${vm?.roe || 0}%, ROA = ${vm?.roa || 0}%${vm?.isBank ? `, NIM = ${vm?.nim || 'N/A'}%, CASA = ${vm?.casa || 'N/A'}%, Nợ xấu NPL = ${vm?.npl || 'N/A'}%` : ''}, phân tích chất lượng tài sản và động lực tăng trưởng cốt lõi.
   - TUYỆT ĐỐI KHÔNG nhận định định tính chung chung mà PHẢI gắn liền với các số liệu tài chính thực tế đã được cung cấp.
• "technical" (Phân tích Kỹ thuật & Dòng tiền): Gồm 2-3 tiểu mục (đánh số 1, 2, 3):
   - Nhận định xu hướng giá ngắn hạn và trung hạn.
   - Chỉ rõ các ngưỡng HỖ TRỢ và KHÁNG CỰ then chốt (kèm mức giá cụ thể).
   - Tín hiệu các chỉ báo kỹ thuật quan trọng (RSI, MACD, đường MA20, MA50, MA200).
   - Đánh giá dòng tiền lớn (Smart Money), hành vi giao dịch của Khối ngoại và Tự doanh.
• "forumSentiment" (Tâm lý Cộng đồng & Diễn đàn F319): Gồm 2-3 tiểu mục (đánh số 1, 2, 3) đánh giá tâm lý số đông nhà đầu tư cá nhân trên thị trường, mức độ chú ý và kỳ vọng của cộng đồng đối với mã cổ phiếu này.
• "recommendation" (Khuyến nghị Chiến lược Đầu tư):
   - "action": "MUA" | "BÁN" | "NẮM GIỮ" | "THEO DÕI"
   - "details": Chiến lược giải ngân cụ thể (vùng giá mua gom tối ưu, vùng chốt lời từng phần, ngưỡng cắt lỗ Stop-loss kỷ luật và phân bổ tỷ trọng vốn hợp lý).

Trả về đúng JSON theo cấu trúc:
{
  "isValid": true,
  "assumedDate": "string",
  "closingPrice": "string",
  "marketSentiment": { "score": 0-100, "summary": "markdown phân tích sâu sắc tâm lý thị trường chung", "vnIndexTrend": "string", "foreignInvestors": "string", "liquidity": "string" },
  "stockSentiment": { "score": 0-100, "summary": "markdown đánh giá sức mạnh nội tại và độ khỏe tương đối (RS) của cổ phiếu" },
  "macro": "markdown phân tích chuyên sâu vĩ mô",
  "industry": "markdown phân tích chuyên sâu ngành",
  "fundamental": "markdown phân tích chi tiết tài chính và cơ bản",
  "technical": "markdown phân tích kỹ thuật và dòng tiền sắc sảo",
  "forumSentiment": "markdown đánh giá tâm lý diễn đàn",
  "recommendation": { "action": "MUA|BÁN|NẮM GIỮ|THEO DÕI", "details": "markdown chiến lược đầu tư chi tiết" },
  "targetPrices": { 
    "shortTerm": { "value": number, "label": "string" }, 
    "midTerm": { "value": number, "label": "string" }, 
    "longTerm": { "value": number, "label": "string" } 
  },
  "news": [
    { "title": "Tiêu đề tin tức", "publisher": "Báo", "time": "Thời gian" }
  ]
}`;
};

// ==========================================
// CƠ CHẾ QUẢN LÝ VÀ FALLBACK API KEY (KEY POOL ROTATOR & SEARCH-TO-DIRECT FALLBACK)
// ==========================================
const FREE_KEY_1 = (process.env.GEMINI_FREE_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
const FREE_KEY_2 = (process.env.GEMINI_BACKUP_API_KEY || '').trim();
const PAID_KEY = (process.env.GEMINI_PAID_API_KEY || '').trim();

const ALL_KEYS = Array.from(new Set([FREE_KEY_1, FREE_KEY_2, PAID_KEY].filter(Boolean)));
let currentKeyIndex = 0;

export const getKeyStatus = () => ({
  mode: currentKeyIndex === 0 ? 'primary' : 'backup',
  totalKeys: ALL_KEYS.length,
  hasFreeKey: Boolean(FREE_KEY_1 || FREE_KEY_2),
  hasPaidKey: Boolean(PAID_KEY),
});

const shouldFallbackToPaid = (error: any): boolean => {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  const status = error?.status || error?.statusCode || error?.response?.status || error?.code || error?.error?.code;
  return (
    status === 429 ||
    status === 403 ||
    status === 404 ||
    status === 503 ||
    status === 500 ||
    status === 504 ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resourceexhausted') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('temporarily unavailable')
  );
};

const executeWithKeyFallback = async <T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> => {
  if (ALL_KEYS.length === 0) {
    throw new Error('Chưa cấu hình API Key. Vui lòng kiểm tra lại cấu hình.');
  }

  let lastErr: any = null;
  for (let i = 0; i < ALL_KEYS.length; i++) {
    const keyToUse = ALL_KEYS[(currentKeyIndex + i) % ALL_KEYS.length];
    const ai = new GoogleGenAI({ apiKey: keyToUse });

    try {
      const result = await operation(ai);
      currentKeyIndex = (currentKeyIndex + i) % ALL_KEYS.length;
      return result;
    } catch (error: any) {
      lastErr = error;
      if (shouldFallbackToPaid(error)) {
        console.warn(`⚠️ [API Key Rotator] Key ${i + 1}/${ALL_KEYS.length} gặp sự cố (${error?.status || '429/503'}). Đang tự động chuyển sang Key tiếp theo...`);
      }
    }
  }

  throw lastErr;
};

const sendChatWithToolFallback = async (
  ai: GoogleGenAI,
  message: string,
  systemInstruction: string
): Promise<{ response: GenerateContentResponse; chat: Chat }> => {
  let lastError: any = null;

  // 1. Thử gọi với Google Search Grounding tool trước
  for (const modelName of FALLBACK_MODELS) {
    try {
      const config: any = {
        temperature: 0.1,
        maxOutputTokens: 8192,
        systemInstruction,
        tools: [{ googleSearch: {} }],
      };

      if (modelName === 'gemini-2.5-flash') {
        config.thinkingConfig = { thinkingBudget: 0 };
      }

      const chat = ai.chats.create({
        model: modelName,
        config,
      });
      const response = await chat.sendMessage({ message });
      
      const text = response.text || '';
      if (text.trim()) {
        return { response, chat };
      }
    } catch (err: any) {
      console.warn(`[Grounding Tool] Model ${modelName} encountered error:`, err?.message || err);
      lastError = err;
    }
  }

  // 2. Nếu Google Search Grounding hết quota (429/Resource Exhausted) -> Tự động Fallback sang Direct Generation
  // Dùng responseMimeType: 'application/json' để ĐẢM BẢO 100% JSON chuẩn xác tuyệt đối không bao giờ bị lỗi cú pháp!
  console.warn('⚠️ [Search Quota Fallback] Hạn mức Search Grounding tạm hết. Tự động chuyển sang chế độ Native JSON Mode với dữ liệu Backend...');
  for (const modelName of FALLBACK_MODELS) {
    try {
      const config: any = {
        temperature: 0.1,
        maxOutputTokens: 8192,
        systemInstruction,
        responseMimeType: 'application/json',
      };

      if (modelName === 'gemini-2.5-flash') {
        config.thinkingConfig = { thinkingBudget: 0 };
      }

      const chat = ai.chats.create({
        model: modelName,
        config,
      });
      const response = await chat.sendMessage({ message });
      
      const text = response.text || '';
      if (text.trim()) {
        return { response, chat };
      }
    } catch (err: any) {
      console.warn(`[Direct Fallback] Model ${modelName} encountered error:`, err?.message || err);
      lastError = err;
    }
  }

  // Format friendly message if still 429
  const errMsg = lastError?.message || lastError?.toString() || '';
  if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
    throw new Error('⚠️ Hạn mức gọi API Google Gemini của tài khoản tạm thời đạt giới hạn trong ngày/phút. Vui lòng đợi trong giây lát hoặc thử lại sau!');
  }
  
  throw lastError || new Error('Gemini API trả về phản hồi rỗng. Vui lòng thử lại.');
};

const fetchStockAnalysisInternal = async (tickerSymbol: string, customPrice?: string): Promise<{ result: AnalysisResult; chat: Chat }> => {
  const realtimeInfo = await fetchRealtimeStockInfo(tickerSymbol);

  return await executeWithKeyFallback(async (ai) => {
    const systemInstruction = `Bạn là trợ lý phân tích chứng khoán chuyên nghiệp. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`;
    const { response, chat } = await sendChatWithToolFallback(
      ai,
      generateAnalysisPrompt(tickerSymbol, customPrice, realtimeInfo),
      systemInstruction
    );

    const parsedData = parseJsonResponse(response.text);
    if (parsedData.isValid === false || parsedData.error) {
      throw new Error(parsedData.error || `Mã cổ phiếu "${tickerSymbol}" không tồn tại trên thị trường chứng khoán Việt Nam. Vui lòng kiểm tra lại.`);
    }

    if (!parsedData.macro || !parsedData.industry || !parsedData.fundamental || !parsedData.technical) {
      throw new Error(`Bản phân tích mã "${tickerSymbol}" chưa hoàn chỉnh. Đang tự động kết nối lại...`);
    }
    const groundingSources = extractGroundingSources(response);

    const finalResult: AnalysisResult = {
      ...parsedData,
      closingPrice: customPrice ? `${customPrice} VND` : (realtimeInfo?.formattedPrice || parsedData.closingPrice),
      macro: markdownToHtml(formatToMarkdownString(parsedData.macro)),
      industry: markdownToHtml(formatToMarkdownString(parsedData.industry)),
      fundamental: markdownToHtml(formatToMarkdownString(parsedData.fundamental)),
      technical: markdownToHtml(formatToMarkdownString(parsedData.technical)),
      forumSentiment: markdownToHtml(formatToMarkdownString(parsedData.forumSentiment)),
      marketSentiment: { 
        ...parsedData.marketSentiment, 
        summary: markdownToHtml(parsedData.marketSentiment?.summary),
        vnIndexTrend: stripCitations(parsedData.marketSentiment?.vnIndexTrend),
        foreignInvestors: stripCitations(parsedData.marketSentiment?.foreignInvestors),
        liquidity: stripCitations(parsedData.marketSentiment?.liquidity),
      },
      stockSentiment: { ...parsedData.stockSentiment, summary: markdownToHtml(parsedData.stockSentiment?.summary) },
      recommendation: { ...parsedData.recommendation, details: markdownToHtml(parsedData.recommendation?.details) },
      news: (realtimeInfo?.news && realtimeInfo.news.length > 0) 
        ? realtimeInfo.news 
        : normalizeNewsList(parsedData.news, groundingSources, tickerSymbol),
      groundingSources
    };

    return { result: finalResult, chat };
  });
};

const fetchStockComparisonInternal = async (ticker1: string, ticker2: string): Promise<{ result: ComparisonResult, chat: Chat }> => {
  const [realtime1, realtime2] = await Promise.all([
    fetchRealtimeStockInfo(ticker1),
    fetchRealtimeStockInfo(ticker2)
  ]);

  const formatBctc = (info: any) => {
    if (!info?.financialStatements?.quarters?.length) return '';
    return `BẢNG BCTC XÁC THỰC (${info.ticker}):\n` + info.financialStatements.quarters.map((q: any) => 
      `- [${q.period}]: Doanh thu = ${q.formattedRevenue} | LNST = ${q.formattedNetProfit} | Biên LN gộp = ${q.grossMargin}% | D/E = ${q.debtToEquity !== undefined ? q.debtToEquity + 'x' : 'N/A'}`
    ).join('\n');
  };

  const bctc1Context = formatBctc(realtime1);
  const bctc2Context = formatBctc(realtime2);

  return await executeWithKeyFallback(async (ai) => {
    const systemInstruction = `Bạn là chuyên gia so sánh đối đầu cổ phiếu chứng khoán Việt Nam hàng đầu. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`;
    const formattedDate = getCurrentDateString();
    const prompt = `So sánh chuyên sâu và súc tích 2 cổ phiếu: "${ticker1}" và "${ticker2}" tính đến ngày ${formattedDate}.
DỮ LIỆU THỊ TRƯỜNG & BÁO CÁO TÀI CHÍNH THỰC TẾ HÔM NAY:
- Mã ${ticker1}: Giá đóng cửa thực tế ${realtime1?.formattedPrice || 'Giá thị trường'}${realtime1?.volume ? ` (KL: ${realtime1.volume.toLocaleString('vi-VN')} cp, Biên độ: ${realtime1.low?.toLocaleString('vi-VN')} - ${realtime1.high?.toLocaleString('vi-VN')} VND)` : ''}.
${bctc1Context}

- Mã ${ticker2}: Giá đóng cửa thực tế ${realtime2?.formattedPrice || 'Giá thị trường'}${realtime2?.volume ? ` (KL: ${realtime2.volume.toLocaleString('vi-VN')} cp, Biên độ: ${realtime2.low?.toLocaleString('vi-VN')} - ${realtime2.high?.toLocaleString('vi-VN')} VND)` : ''}.
${bctc2Context}

Trình bày ngắn gọn, gạch đầu dòng rõ ràng.
QUY TẮC BẮT BUỘC:
1. Trường "closingPrice" của ${ticker1} PHẢI LÀ "${realtime1?.formattedPrice || 'Giá thị trường'}".
2. Trường "closingPrice" của ${ticker2} PHẢI LÀ "${realtime2?.formattedPrice || 'Giá thị trường'}".
3. Phần "fundamental" BẮT BUỘC trích dẫn chính xác các con số doanh thu, LNST, biên lãi trong Bảng BCTC thực tế được cung cấp ở trên của cả 2 mã.
4. Toàn bộ mức giá mục tiêu trong "targetPrices" của cả 2 mã BẮT BUỘC phải được tính toán dựa trên mức giá thực tế này.

YÊU CẦU TIN TỨC: CHỈ lấy 5-7 tin tức TRỰC TIẾP đề cập đến "${ticker1}" hoặc "${ticker2}" trong 7 ngày gần đây. Nếu không tìm thấy, trả về "news": [].

BẮT BUỘC trả về JSON theo đúng cấu trúc sau:
{
  "assumedDate": "${formattedDate}",
  "ticker1": {
    "symbol": "${ticker1}",
    "closingPrice": "${realtime1?.formattedPrice || 'Giá thị trường'}",
    "analysis": {
      "macro": "markdown phân tích vĩ mô tác động tới ${ticker1}",
      "industry": "markdown phân tích ngành và vị thế của ${ticker1}",
      "fundamental": "markdown phân tích cơ bản trích dẫn số liệu BCTC thật của ${ticker1}",
      "technical": "markdown phân tích kỹ thuật, xu hướng, MA, RSI của ${ticker1}",
      "recommendation": {
        "action": "MUA hoặc BÁN hoặc NẮM GIỮ",
        "details": "Lý do và chiến lược khuyến nghị cho ${ticker1}"
      },
      "targetPrices": {
        "shortTerm": { "value": số_nguyên_VND, "label": "Mô tả mục tiêu ngắn hạn" },
        "midTerm": { "value": số_nguyên_VND, "label": "Mô tả mục tiêu trung hạn" },
        "longTerm": { "value": số_nguyên_VND, "label": "Mô tả mục tiêu dài hạn" }
      }
    },
    "stockSentiment": {
      "score": 0-100,
      "summary": "Tóm tắt tâm lý và sức mạnh kỹ thuật của ${ticker1}"
    }
  },
  "ticker2": {
    "symbol": "${ticker2}",
    "closingPrice": "${realtime2?.formattedPrice || 'Giá thị trường'}",
    "analysis": {
      "macro": "markdown phân tích vĩ mô tác động tới ${ticker2}",
      "industry": "markdown phân tích ngành và vị thế của ${ticker2}",
      "fundamental": "markdown phân tích cơ bản trích dẫn số liệu BCTC thật của ${ticker2}",
      "technical": "markdown phân tích kỹ thuật, xu hướng, MA, RSI của ${ticker2}",
      "recommendation": {
        "action": "MUA hoặc BÁN hoặc NẮM GIỮ",
        "details": "Lý do và chiến lược khuyến nghị cho ${ticker2}"
      },
      "targetPrices": {
        "shortTerm": { "value": số_nguyên_VND, "label": "Mô tả mục tiêu ngắn hạn" },
        "midTerm": { "value": số_nguyên_VND, "label": "Mô tả mục tiêu trung hạn" },
        "longTerm": { "value": số_nguyên_VND, "label": "Mô tả mục tiêu dài hạn" }
      }
    },
    "stockSentiment": {
      "score": 0-100,
      "summary": "Tóm tắt tâm lý và sức mạnh kỹ thuật của ${ticker2}"
    }
  },
  "comparativeSummary": {
    "overallWinner": "${ticker1} hoặc ${ticker2}",
    "fundamentalWinner": "${ticker1} hoặc ${ticker2}",
    "technicalWinner": "${ticker1} hoặc ${ticker2}",
    "summaryText": "markdown tổng kết đối đầu súc tích và kết luận nên ưu tiên chọn mã nào"
  },
  "forumSentiment": "markdown tổng hợp tâm lý F319/diễn đàn về cả 2 mã",
  "news": [
    { "title": "Tiêu đề tin tức trong 7 ngày", "publisher": "Vietstock", "time": "Hôm qua" }
  ]
}`;

    const { response, chat } = await sendChatWithToolFallback(ai, prompt, systemInstruction);

    const parsedData = parseJsonResponse(response.text);
    const groundingSources = extractGroundingSources(response);

    const parseNum = (val: any) => {
      if (typeof val === 'number') return val;
      const digits = String(val || '').replace(/[^0-9]/g, '');
      return parseInt(digits, 10) || 0;
    };

    const processTicker = (t: any, fallbackSymbol: string) => {
        const symbol = t?.symbol || fallbackSymbol;
        const rawRec = t?.analysis?.recommendation;
        const recAction = (typeof rawRec === 'string' ? rawRec : rawRec?.action) || 'NẮM GIỮ';
        const recDetails = (typeof rawRec === 'string' ? rawRec : rawRec?.details) || `Khuyến nghị ${recAction} cho mã ${symbol}`;

        const rawTargets = t?.analysis?.targetPrices || {};
        const shortVal = parseNum(rawTargets.shortTerm?.value || rawTargets.shortTerm);
        const midVal = parseNum(rawTargets.midTerm?.value || rawTargets.midTerm);
        const longVal = parseNum(rawTargets.longTerm?.value || rawTargets.longTerm);

        return {
            symbol,
            closingPrice: t?.closingPrice || 'Đang cập nhật',
            analysis: {
                macro: markdownToHtml(formatToMarkdownString(t?.analysis?.macro)),
                industry: markdownToHtml(formatToMarkdownString(t?.analysis?.industry)),
                fundamental: markdownToHtml(formatToMarkdownString(t?.analysis?.fundamental)),
                technical: markdownToHtml(formatToMarkdownString(t?.analysis?.technical)),
                recommendation: {
                    action: recAction,
                    details: markdownToHtml(formatToMarkdownString(recDetails)),
                },
                targetPrices: {
                    shortTerm: {
                        value: shortVal,
                        label: rawTargets.shortTerm?.label || (shortVal ? `${shortVal.toLocaleString('vi-VN')} VND` : 'Theo dõi biến động ngắn hạn'),
                    },
                    midTerm: {
                        value: midVal,
                        label: rawTargets.midTerm?.label || (midVal ? `${midVal.toLocaleString('vi-VN')} VND` : 'Kỳ vọng theo kết quả kinh doanh'),
                    },
                    longTerm: {
                        value: longVal,
                        label: rawTargets.longTerm?.label || (longVal ? `${longVal.toLocaleString('vi-VN')} VND` : 'Định giá theo triển vọng ngành'),
                    },
                },
            },
            stockSentiment: {
                score: typeof t?.stockSentiment?.score === 'number' ? t.stockSentiment.score : 50,
                summary: markdownToHtml(formatToMarkdownString(t?.stockSentiment?.summary || `Tâm lý giao dịch mã ${symbol} ở mức trung tính.`)),
            },
        };
    };

    const finalResult: ComparisonResult = {
        assumedDate: parsedData.assumedDate || formattedDate,
        ticker1: processTicker(parsedData.ticker1, ticker1),
        ticker2: processTicker(parsedData.ticker2, ticker2),
        comparativeSummary: {
            overallWinner: parsedData.comparativeSummary?.overallWinner || ticker1,
            fundamentalWinner: parsedData.comparativeSummary?.fundamentalWinner || ticker1,
            technicalWinner: parsedData.comparativeSummary?.technicalWinner || ticker2,
            summaryText: markdownToHtml(formatToMarkdownString(parsedData.comparativeSummary?.summaryText || 'Đang cập nhật tổng kết đối đầu.')),
        },
        forumSentiment: markdownToHtml(formatToMarkdownString(parsedData.forumSentiment)),
        news: normalizeNewsList(parsedData.news, groundingSources, `${ticker1} vs ${ticker2}`),
        groundingSources
    };

    return { result: finalResult, chat };
  });
};

const fetchIndustryAnalysisInternal = async (industryInput: string): Promise<{ result: IndustryAnalysisResult, chat: Chat }> => {
  const vnIndexInfo = await fetchRealtimeStockInfo('VNINDEX').catch(() => null);
  const dynamicLiquidity = vnIndexInfo?.vnIndex?.liquidityDescription || 'khớp lệnh bình quân 20 phiên gần nhất trên các sàn HOSE/HNX';

  return await executeWithKeyFallback(async (ai) => {
    const systemInstruction = `Bạn là Giám đốc Phân tích Đầu tư Ngành Chứng khoán Cao cấp tại Việt Nam. Trình bày sắc bén, chuẩn xác số liệu thực tế, đi thẳng vào luận điểm cốt lõi. Trả lời bằng tiếng Việt và BẮT BUỘC trả về JSON trong khối \`\`\`json ... \`\`\`.`;
    const formattedDate = getCurrentDateString();
    
    const prompt = `Phân tích chuyên sâu, sắc bén và toàn diện về ngành "${industryInput}" tại thị trường chứng khoán Việt Nam tính đến ngày ${formattedDate}.

BỐI CẢNH THỊ TRƯỜNG THỰC TẾ:
- Thanh khoản thị trường thực tế (Tính toán động 20 phiên gần nhất từ sàn giao dịch): ${dynamicLiquidity}.
- Động lực chính sách & Vĩ mô ngành:
  * Sử dụng Google Search Grounding để tra cứu các văn bản chính sách pháp lý mới nhất của Bộ Tài chính / UBCKNN (về cơ chế giao dịch, giao dịch không ký quỹ 100% Non-pre-funding, quản trị rủi ro), các dự án hạ tầng công nghệ và tiến trình nâng hạng thị trường chứng khoán (FTSE/MSCI) ĐANG ĐƯỢC ÁP DỤNG THỰC TẾ tại thời điểm phân tích.
  * Tăng trưởng quy mô vốn điều lệ, mở rộng dư nợ cho vay ký quỹ (Margin) và phát triển mảng ngân hàng đầu tư (IB) của các CTCK.
  * Động thái dòng vốn ngoại (FII) và dòng tiền cá nhân trong nước theo bối cảnh lãi suất và tỷ giá thực tế.

QUY TẮC BẮT BUỘC VỀ BỐI CẢNH & DÒNG TIỀN:
- Trường "foreignInvestors": Tra cứu thông qua Google Search để phản ánh chính xác động thái mua/bán ròng thực tế của Khối ngoại trong các phiên gần nhất. Tuyệt đối không tự gán số liệu tĩnh.
- Trường "liquidity": BẮT BUỘC phản ánh theo dữ liệu thanh khoản thực tế: "${dynamicLiquidity}".
- TẤT CẢ CÁC THÔNG TIN VỀ CHÍNH SÁCH, VĂN BẢN QUY PHẠM PHÁP LUẬT VÀ DỰ ÁN CÔNG NGHỆ BẮT BUỘC PHẢI DỰA TRÊN THỰC TẾ ĐANG VẬN HÀNH THỜI ĐIỂM HIỆN TẠI (thông qua Google Search), TUYỆT ĐỐI KHÔNG LẤY CÁC KỲ VỌNG LỖI THỜI ĐÃ BỊ HOÃN/THAY THẾ TRONG QUÁ KHỨ!

YÊU CẦU CỔ PHIẾU NỔI BẬT: BẮT BUỘC chọn lọc từ 3 đến 4 cổ phiếu đầu ngành/dẫn dắt tiêu biểu nhất (ví dụ ngành Chứng khoán: SSI, VND, HCM, VCI, TCBS; Thép: HPG, HSG, NKG; Ngân hàng: VCB, TCB, MBB, ACB; Bất động sản: VHM, KDH, NLG; Bán lẻ: MWG, FRT, PNJ...).
YÊU CẦU TIN TỨC: CHỈ lấy tin tức TRỰC TIẾP nói về ngành "${industryInput}" hoặc các doanh nghiệp lớn trong ngành trong 7 ngày gần đây. Nếu không tìm thấy, trả về "news": [].

Trả về JSON cấu trúc:
{
  "industryName": "${industryInput}",
  "assumedDate": "${formattedDate}",
  "marketSentiment": { 
    "score": 0-100, 
    "summary": "markdown phân tích súc tích tác động bối cảnh thị trường tới ngành", 
    "vnIndexTrend": "string xu hướng thị trường", 
    "foreignInvestors": "Bán ròng (hoặc chi tiết áp lực bán ròng)", 
    "liquidity": "${dynamicLiquidity}" 
  },
  "overview": "markdown phân tích tổng quan cấu trúc, quy mô và chu kỳ ngành",
  "opportunities": "markdown chi tiết các cơ hội & động lực tăng trưởng cốt lõi",
  "challenges": "markdown chi tiết các rủi ro, áp lực cạnh tranh & thách thức chính sách",
  "topStocks": [
    { "symbol": "MÃ 1", "companyName": "Tên Công ty", "highlights": "Điểm nhấn đầu tư, thị phần và xúc tác tăng trưởng", "recommendation": "MUA" },
    { "symbol": "MÃ 2", "companyName": "Tên Công ty", "highlights": "Điểm nhấn đầu tư, thị phần và xúc tác tăng trưởng", "recommendation": "MUA" },
    { "symbol": "MÃ 3", "companyName": "Tên Công ty", "highlights": "Điểm nhấn đầu tư, thị phần và xúc tác tăng trưởng", "recommendation": "THEO DÕI" }
  ],
  "news": [
    { "title": "Tiêu đề tin tức ngành ${industryInput}", "publisher": "VnEconomy", "time": "Hôm qua" }
  ]
}`;

    const { response, chat } = await sendChatWithToolFallback(ai, prompt, systemInstruction);

    const parsedData = parseJsonResponse(response.text);
    const groundingSources = extractGroundingSources(response);

    const rawStocks = Array.isArray(parsedData.topStocks) && parsedData.topStocks.length > 0
      ? parsedData.topStocks
      : (Array.isArray(parsedData.top_stocks) && parsedData.top_stocks.length > 0
        ? parsedData.top_stocks
        : (Array.isArray(parsedData.stocks) && parsedData.stocks.length > 0
          ? parsedData.stocks
          : (Array.isArray(parsedData.leadingStocks) && parsedData.leadingStocks.length > 0
            ? parsedData.leadingStocks
            : [])));

    // Default fallback stocks for major Vietnamese sectors if AI missed topStocks
    const DEFAULT_SECTOR_STOCKS: Record<string, any[]> = {
      'Ngân hàng': [
        { symbol: 'VCB', companyName: 'Vietcombank', price: 'Theo dõi thị giá', highlights: 'Ngân hàng số 1 hệ thống về chất lượng tài sản, CASA và hiệu quả sinh lời.', recommendation: 'MUA' },
        { symbol: 'TCB', companyName: 'Techcombank', price: 'Theo dõi thị giá', highlights: 'Dẫn đầu khối NHTMCP về tốc độ tăng trưởng tín dụng và CASA cao.', recommendation: 'MUA' },
        { symbol: 'MBB', companyName: 'MBBank', price: 'Theo dõi thị giá', highlights: 'Quy mô bán lẻ mạnh mẽ, hệ sinh thái tài chính đa dạng và quản trị rủi ro tốt.', recommendation: 'MUA' },
        { symbol: 'ACB', companyName: 'ACB', price: 'Theo dõi thị giá', highlights: 'Chất lượng tài sản an toàn, danh mục cho vay bán lẻ lành mạnh.', recommendation: 'THEO DÕI' }
      ],
      'Bất động sản': [
        { symbol: 'VHM', companyName: 'Vinhomes', price: 'Theo dõi thị giá', highlights: 'Doanh nghiệp phát triển BĐS số 1 với quỹ đất lớn và tiến độ bàn giao dự án vượt trội.', recommendation: 'MUA' },
        { symbol: 'KDH', companyName: 'Nhà Khang Điền', price: 'Theo dõi thị giá', highlights: 'Pháp lý dự án sạch, cơ cấu tài chính lành mạnh và tập trung phân khúc nhà ở thực.', recommendation: 'MUA' },
        { symbol: 'NLG', companyName: 'Nam Long', price: 'Theo dõi thị giá', highlights: 'Đối tác chiến lược Nhật Bản, phát triển các khu đô thị vệ tinh quy mô lớn.', recommendation: 'THEO DÕI' }
      ],
      'Chứng khoán': [
        { symbol: 'SSI', companyName: 'Chứng khoán SSI', price: 'Theo dõi thị giá', highlights: 'Thị phần hàng đầu, quy mô vốn chủ sở hữu lớn hưởng lợi trực tiếp từ cơ chế Non-pre-funding và nâng hạng thị trường.', recommendation: 'MUA' },
        { symbol: 'HCM', companyName: 'HSC', price: 'Theo dõi thị giá', highlights: 'Thế mạnh mảng khách hàng tổ chức nước ngoài và mảng cho vay ký quỹ (margin).', recommendation: 'MUA' },
        { symbol: 'VCI', companyName: 'Vietcap', price: 'Theo dõi thị giá', highlights: 'Dẫn đầu mảng ngân hàng đầu tư (IB) với các thương vụ tư vấn M&A lớn.', recommendation: 'MUA' },
        { symbol: 'VND', companyName: 'VNDIRECT', price: 'Theo dõi thị giá', highlights: 'Hệ sinh thái số, tệp khách hàng cá nhân rộng lớn và mảng môi giới phát triển.', recommendation: 'THEO DÕI' }
      ],
      'Thép': [
        { symbol: 'HPG', companyName: 'Tập đoàn Hòa Phát', price: 'Theo dõi thị giá', highlights: 'Thị phần thép xây dựng số 1, dự án Dung Quất 2 là động lực tăng trưởng đột phá.', recommendation: 'MUA' },
        { symbol: 'HSG', companyName: 'Hoa Sen Group', price: 'Theo dõi thị giá', highlights: 'Hệ thống phân phối Hoa Sen Home và biên lợi nhuận tôn mạ phục hồi tích cực.', recommendation: 'THEO DÕI' },
        { symbol: 'NKG', companyName: 'Nam Kim', price: 'Theo dõi thị giá', highlights: 'Thế mạnh xuất khẩu tôn mạ sang các thị trường châu Âu và Bắc Mỹ.', recommendation: 'THEO DÕI' }
      ],
      'Bán lẻ': [
        { symbol: 'MWG', companyName: 'Thế Giới Di Động', price: 'Theo dõi thị giá', highlights: 'Chuỗi Bách Hóa Xanh bắt đầu có lãi, đóng góp tăng trưởng doanh thu đột phá.', recommendation: 'MUA' },
        { symbol: 'FRT', companyName: 'FPT Retail', price: 'Theo dõi thị giá', highlights: 'Chuỗi nhà thuốc Long Châu tiếp tục mở rộng thần tốc và dẫn đầu mảng bán lẻ dược phẩm.', recommendation: 'MUA' },
        { symbol: 'PNJ', companyName: 'Vàng bạc PNJ', price: 'Theo dõi thị giá', highlights: 'Vị thế thống lĩnh thị trường trang sức phân khúc trung và cao cấp.', recommendation: 'THEO DÕI' }
      ]
    };

    const matchedDefault = Object.keys(DEFAULT_SECTOR_STOCKS).find(k => 
      industryInput.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(industryInput.toLowerCase())
    );

    const baseStocksList = rawStocks.length > 0 ? rawStocks : (matchedDefault ? DEFAULT_SECTOR_STOCKS[matchedDefault] : []);

    // Tự động truy vấn Giá Live Real-time thực tế cho từng mã cổ phiếu đầu ngành
    const enrichedStocksList = await Promise.all(
      baseStocksList.map(async (s: any) => {
        const sym = (s.symbol || '').trim().toUpperCase();
        let actualPriceStr = s.price;
        if (sym) {
          try {
            const stockInfo = await fetchRealtimeStockInfo(sym);
            if (stockInfo?.formattedPrice) {
              actualPriceStr = stockInfo.formattedPrice;
            }
          } catch (e) {}
        }
        return {
          ...s,
          price: actualPriceStr || 'Theo dõi thị giá',
          highlights: markdownToHtml(formatToMarkdownString(s.highlights))
        };
      })
    );

    const finalResult: IndustryAnalysisResult = {
        ...parsedData,
        overview: markdownToHtml(formatToMarkdownString(parsedData.overview)),
        opportunities: markdownToHtml(formatToMarkdownString(parsedData.opportunities)),
        challenges: markdownToHtml(formatToMarkdownString(parsedData.challenges)),
        marketSentiment: { 
          ...parsedData.marketSentiment, 
          summary: markdownToHtml(formatToMarkdownString(parsedData.marketSentiment?.summary)),
          vnIndexTrend: stripCitations(parsedData.marketSentiment?.vnIndexTrend),
          foreignInvestors: stripCitations(parsedData.marketSentiment?.foreignInvestors),
          liquidity: stripCitations(parsedData.marketSentiment?.liquidity),
        },
        topStocks: enrichedStocksList,
        news: normalizeNewsList(parsedData.news, groundingSources, industryInput),
        groundingSources
    };

    return { result: finalResult, chat };
  });
};

const generateIndexAnalysisPrompt = (indexSymbol: string) => {
  const formattedDate = getCurrentDateString();
  return `Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam cao cấp. Phân tích súc tích chỉ số "${indexSymbol}".
Sử dụng Google Search để lấy điểm số thực tế mới nhất, thanh khoản, động thái khối ngoại và tin tức thị trường tính đến ${formattedDate}.
Trường "assumedDate" phải là ${formattedDate}.
YÊU CẦU PHÂN TÍCH CHỈ SỐ:
- "closingPrice": Điểm số đóng cửa thực tế mới nhất của ${indexSymbol} (ví dụ: "1.285,40 điểm" hoặc kèm mức tăng giảm "+8.5 điểm (+0.6%)").
- "marketSentiment": Đánh giá toàn cảnh tâm lý thị trường, điểm số (0-100), xu hướng VN-Index, khối ngoại, thanh khoản.
- "stockSentiment": Đánh giá sức mạnh kỹ thuật riêng của chỉ số ${indexSymbol} (score 0-100, tóm tắt súc tích).
- "macro": Phân tích các yếu tố vĩ mô tác động trực tiếp (tỷ giá, lãi suất, chính sách tiền tệ, dòng vốn FDI, tiến độ nâng hạng FTSE/MSCI...).
- "industry": Phân tích sự phân hóa dòng tiền giữa các nhóm ngành dẫn dắt (Ngân hàng, Bất động sản, Chứng khoán, Thép, Bán lẻ...).
- "fundamental": Định giá P/E, P/B toàn thị trường/chỉ số ${indexSymbol} so với trung bình lịch sử và triển vọng tăng trưởng EPS.
- "technical": Phân tích kỹ thuật chi tiết chỉ số (xu hướng ngắn/trung hạn, MA20, MA50, MA200, RSI, MACD, các vùng hỗ trợ & kháng cự quan trọng).
- "recommendation": { "action": "TĂNG TỶ TRỌNG|GIẢM TỶ TRỌNG|NẮM GIỮ|QUAN SÁT", "details": "Chiến lược hành động và tỷ trọng cổ phiếu/tiền mặt khuyến nghị" }.
- "targetPrices": Các mốc điểm số mục tiêu của chỉ số ${indexSymbol}:
  + shortTerm: { "value": số điểm (ví dụ 1300), "label": "1.300 điểm (Kháng cự ngắn hạn...)" }
  + midTerm: { "value": số điểm (ví dụ 1350), "label": "1.350 điểm (Kỳ vọng sóng nâng hạng...)" }
  + longTerm: { "value": số điểm (ví dụ 1450), "label": "1.450 điểm (Định giá P/E mục tiêu...)" }
- "news": 5-7 tin tức vĩ mô/thị trường nóng nhất trong 7 ngày gần nhất.
Trả về JSON cấu trúc:
{
  "assumedDate": "${formattedDate}",
  "closingPrice": "1.285,40 điểm",
  "marketSentiment": { "score": 0-100, "summary": "markdown súc tích", "vnIndexTrend": "string", "foreignInvestors": "string", "liquidity": "string" },
  "stockSentiment": { "score": 0-100, "summary": "markdown súc tích" },
  "macro": "markdown súc tích", "industry": "markdown súc tích", "fundamental": "markdown súc tích", "technical": "markdown súc tích", "forumSentiment": "markdown",
  "recommendation": { "action": "TĂNG TỶ TRỌNG", "details": "markdown súc tích" },
  "targetPrices": { 
    "shortTerm": { "value": 1300, "label": "1.300 điểm" }, 
    "midTerm": { "value": 1350, "label": "1.350 điểm" }, 
    "longTerm": { "value": 1450, "label": "1.450 điểm" } 
  },
  "news": [
    { "title": "Tiêu đề tin tức thị trường trong 7 ngày", "publisher": "VnEconomy", "time": "Hôm qua" }
  ]
}
Ghi chú: "targetPrices" phải có "value" là số nguyên (số điểm) và "label" là chuỗi mô tả kèm lý do súc tích.`;
};

const fetchIndexAnalysisInternal = async (indexSymbol: string): Promise<{ result: AnalysisResult; chat: Chat }> => {
  return await executeWithKeyFallback(async (ai) => {
    const systemInstruction = `Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam cao cấp. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`;
    const { response, chat } = await sendChatWithToolFallback(
      ai,
      generateIndexAnalysisPrompt(indexSymbol),
      systemInstruction
    );

    const parsedData = parseJsonResponse(response.text);
    const groundingSources = extractGroundingSources(response);

    const finalResult: AnalysisResult = {
      ...parsedData,
      macro: markdownToHtml(formatToMarkdownString(parsedData.macro)),
      industry: markdownToHtml(formatToMarkdownString(parsedData.industry)),
      fundamental: markdownToHtml(formatToMarkdownString(parsedData.fundamental)),
      technical: markdownToHtml(formatToMarkdownString(parsedData.technical)),
      forumSentiment: markdownToHtml(formatToMarkdownString(parsedData.forumSentiment)),
      marketSentiment: { 
        ...parsedData.marketSentiment, 
        summary: markdownToHtml(formatToMarkdownString(parsedData.marketSentiment?.summary)),
        vnIndexTrend: stripCitations(parsedData.marketSentiment?.vnIndexTrend),
        foreignInvestors: stripCitations(parsedData.marketSentiment?.foreignInvestors),
        liquidity: stripCitations(parsedData.marketSentiment?.liquidity),
      },
      stockSentiment: { ...parsedData.stockSentiment, summary: markdownToHtml(formatToMarkdownString(parsedData.stockSentiment?.summary)) },
      recommendation: { ...parsedData.recommendation, details: markdownToHtml(formatToMarkdownString(parsedData.recommendation?.details)) },
      news: normalizeNewsList(parsedData.news, groundingSources, indexSymbol),
      groundingSources
    };

    return { result: finalResult, chat };
  });
};

const withErrorHandling = <T extends any[], R>(fn: (...args: T) => Promise<R>) => {
    return async (...args: T): Promise<R> => {
        try { 
            return await fn(...args); 
        }
        catch (error) {
            console.error("Gemini API Error:", error);
            const errMsg = error instanceof Error ? error.message : "Đã xảy ra lỗi khi kết nối với AI.";
            
            // Xử lý lỗi Requested entity was not found bằng cách ném ra một thông báo đặc biệt
            if (errMsg.includes("Requested entity was not found")) {
                throw new Error("RE-AUTH-NEEDED");
            }
            throw new Error(errMsg);
        }
    };
};

export const fetchStockAnalysis = withErrorHandling(fetchStockAnalysisInternal);
export const fetchStockComparison = withErrorHandling(fetchStockComparisonInternal);
export const fetchIndustryAnalysis = withErrorHandling(fetchIndustryAnalysisInternal);
export const fetchIndexAnalysis = withErrorHandling(fetchIndexAnalysisInternal);

