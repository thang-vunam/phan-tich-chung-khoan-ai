
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import type { AnalysisResult, ComparisonResult, GroundingSource, MarketSentiment, IndustryAnalysisResult, NewsItem } from '../types';

const PRO_MODEL = 'gemini-3.6-flash';

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
        escapedText = escapedText.replace(/^([A-Za-zÀ-ỹ0-9\s()&/-]+:)\s+/g, '<strong class="text-cyan-300 font-semibold">$1</strong> ');
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
            const titleContent = numberedHeaderMatch[2];
            outputHtml.push(`<h4 class="text-base font-bold text-cyan-300 mt-4 mb-2 flex items-start gap-1.5"><span class="text-cyan-400 font-bold flex-shrink-0">${sectionCounter}.</span> <span>${styleInline(titleContent)}</span></h4>`);
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
    let cleanStr = text.trim();

    // 1. Try markdown json block first
    const match = cleanStr.match(/```json\s*([\s\S]*?)\s*```/i);
    if (match) {
        cleanStr = match[1].trim();
    }

    // 2. Extract strictly balanced top-level JSON { ... } to cut off any trailing notes/commentary
    cleanStr = extractBalancedJson(cleanStr);

    // 3. Try parsing directly
    try {
        return JSON.parse(cleanStr);
    } catch (e) {
        // Fallback to sanitizing
    }

    // 4. Try sanitizing unescaped quotes and trailing commas
    try {
        const sanitized = sanitizeJsonString(cleanStr);
        const cleanedCommas = sanitized.replace(/,(\s*[\]}])/g, '$1');
        return JSON.parse(cleanedCommas);
    } catch (err) {
        // Fallback to auto-repairing truncated JSON
    }

    // 5. Try auto-repairing truncated braces and quotes
    try {
        const repaired = repairTruncatedJson(cleanStr);
        const sanitized = sanitizeJsonString(repaired);
        const cleanedCommas = sanitized.replace(/,(\s*[\]}])/g, '$1');
        return JSON.parse(cleanedCommas);
    } catch (err) {
        console.error("Failed to parse JSON even after repair. Original text preview:", text.substring(0, 500));
        throw err;
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
  high?: number;
  low?: number;
  volume?: number;
  vnIndex?: {
    points: number;
    formatted: string;
    volume?: number;
  };
  hnxIndex?: {
    points: number;
    formatted: string;
    volume?: number;
  };
  upcomIndex?: {
    points: number;
    formatted: string;
    volume?: number;
  };
  source?: string;
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

  // 1. Gọi qua Vercel Serverless Proxy (/api/stock-price) - Lấy Giá Live + Chỉ số 3 sàn (HOSE, HNX, UPCOM) + Tin tức 7 ngày gần nhất
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
  const from = to - 86400 * 7;
  
  try {
    const [stockRes, indexRes, hnxRes, upcomRes] = await Promise.all([
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${cleanTicker}&resolution=1D`),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=HNX&resolution=1D`).catch(() => null),
      fetch(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=UPCOM&resolution=1D`).catch(() => null)
    ]);

    if (stockRes.ok) {
      const data = await stockRes.json();
      if (data.c && data.c.length > 0) {
        const lastClose = data.c[data.c.length - 1];
        const lastHigh = data.h ? data.h[data.h.length - 1] : lastClose;
        const lastLow = data.l ? data.l[data.l.length - 1] : lastClose;
        const lastVol = data.v ? data.v[data.v.length - 1] : 0;
        const actualPriceVND = Math.round(lastClose * 1000);

        const getIdx = async (res: any) => {
          if (!res || !res.ok) return undefined;
          try {
            const d = await res.json();
            if (d.c && d.c.length > 0) {
              const pts = Number(d.c[d.c.length - 1].toFixed(2));
              return { points: pts, formatted: `${pts.toLocaleString('vi-VN')} điểm`, volume: d.v?.slice(-1)[0] };
            }
          } catch (e) {}
          return undefined;
        };

        const [vnIndexInfo, hnxInfo, upcomInfo] = await Promise.all([
          getIdx(indexRes),
          getIdx(hnxRes),
          getIdx(upcomRes)
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
    }
  } catch (err) {
    console.warn(`Could not fetch realtime price for ${cleanTicker}:`, err);
  }
  return null;
};

const generateAnalysisPrompt = (tickerSymbol: string, customPrice?: string, realtimeInfo?: RealtimeStockInfo | null) => {
  const formattedDate = getCurrentDateString();
  const vnIndexText = realtimeInfo?.vnIndex 
    ? `${realtimeInfo.vnIndex.formatted}${realtimeInfo.vnIndex.volume ? ` (Khối lượng HOSE: ${realtimeInfo.vnIndex.volume.toLocaleString('vi-VN')} cp)` : ''}`
    : `1.734,24 điểm (vùng 1.700 - 1.750 điểm)`;

  const hnxText = realtimeInfo?.hnxIndex ? realtimeInfo.hnxIndex.formatted : '278,55 điểm';
  const upcomText = realtimeInfo?.upcomIndex ? realtimeInfo.upcomIndex.formatted : '127,24 điểm';

  const priceContext = customPrice 
    ? `- Giá tùy chỉnh do người dùng nhập: ${customPrice} VND` 
    : realtimeInfo 
      ? `- Giá đóng cửa thực tế mới nhất: ${realtimeInfo.formattedPrice} (${realtimeInfo.price?.toLocaleString('vi-VN')} VND)
- Khối lượng giao dịch: ${realtimeInfo.volume?.toLocaleString('vi-VN')} cp
- Biên độ phiên gần nhất: ${realtimeInfo.low?.toLocaleString('vi-VN')} VND - ${realtimeInfo.high?.toLocaleString('vi-VN')} VND`
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

  return `Bạn là Giám đốc Phân tích Đầu tư Chứng khoán Cao cấp (Head of Equity Research) hàng đầu tại Việt Nam. Hãy lập BÁO CÁO PHÂN TÍCH CHUYÊN SÂU, TOÀN DIỆN VÀ SẮC BÉN về mã cổ phiếu "${tickerSymbol}".

DỮ LIỆU THỊ TRƯỜNG THỰC TẾ TÍNH ĐẾN ${formattedDate}:
- BỐI CẢNH CHỈ SỐ CÁC SÀN THỰC TẾ HÔM NAY:
  * Sàn HOSE (VN-INDEX): ${vnIndexText}
  * Sàn HNX (HNX-INDEX): ${hnxText}
  * Sàn UPCOM (UPCOM-INDEX): ${upcomText}
${priceContext}
Trường "assumedDate" phải là ${formattedDate}.

${newsContext}

QUY TẮC BẮT BUỘC VỀ BỐI CẢNH CHỈ SỐ THỊ TRƯỜNG:
- Xác định sàn niêm yết của "${tickerSymbol}" (HOSE, HNX hay UPCOM) để phân tích tương ứng.
- Trường "marketSentiment", "vnIndexTrend" và "liquidity" BẮT BUỘC phải phân tích dựa trên mốc VN-Index thực tế hiện tại là ${vnIndexText} (hoặc HNX-Index ${hnxText} nếu là sàn HNX).
- TUYỆT ĐỐI KHÔNG dùng các mốc 1.200 - 1.250 điểm từ các năm cũ!

QUY TẮC BẮT BUỘC VỀ TỒN TẠI MÃ CỔ PHIẾU:
- "${tickerSymbol}" BẮT BUỘC phải là một mã chứng khoán/cổ phiếu/chứng chỉ quỹ CÓ THẬT được niêm yết trên các sàn chứng khoán Việt Nam (HOSE, HNX, UPCOM).
- Nếu "${tickerSymbol}" KHÔNG PHẢI là mã chứng khoán có thật, bạn PHẢI trả về JSON:
{"isValid": false, "error": "Mã cổ phiếu '${tickerSymbol}' không tồn tại trên thị trường chứng khoán Việt Nam. Vui lòng kiểm tra lại."}
TUYỆT ĐỐI KHÔNG tự bịa đặt thông tin hoặc phân tích sang mã khác!

YÊU CẦU ĐỊNH GIÁ & MỤC TIÊU GIÁ:
- Trường "closingPrice" PHẢI LÀ "${customPrice ? `${customPrice} VND` : realtimeInfo ? realtimeInfo.formattedPrice : 'Giá thị trường'}".
- Các mức giá mục tiêu trong "targetPrices" (shortTerm, midTerm, longTerm): ${targetPriceRule}.
- Phải có tỷ lệ phần trăm kỳ vọng (+X%) và luận điểm ngắn gọn, thuyết phục trong "label".

YÊU CẦU CHẤT LƯỢNG NỘI DUNG PHÂN TÍCH (BẮT BUỘC ĐẦY ĐỦ, ĐÀO SÂU, CÓ SỐ LIỆU VÀ GÓC NHÌN ĐA CHIỀU):
1. "macro" (Phân tích Vĩ mô & Vi mô): Phân tích tác động của mặt bằng lãi suất, điều hành chính sách tiền tệ của NHNN, tỷ giá USD/VND, lạm phát và các chính sách hỗ trợ ngành tới hoạt động kinh doanh của doanh nghiệp.
2. "industry" (Phân tích Ngành): Phân tích chu kỳ ngành, vị thế thị phần của doanh nghiệp so với các đối thủ cùng ngành, biên lợi nhuận toàn ngành, triển vọng tiêu thụ và các yếu tố xúc tác (catalysts) mới của ngành.
3. "fundamental" (Phân tích Cơ bản Doanh nghiệp):
   - Phân tích chi tiết mô hình kinh doanh, doanh thu, lợi nhuận gộp, biên lợi nhuận ròng, dòng tiền kinh doanh.
   - Đánh giá định giá cổ phiếu (${realtimeInfo?.formattedPrice || 'giá thị trường'} tương ứng với P/E, P/B và quy mô vốn hóa thị trường hiện tại).
   - Đánh giá sức khỏe bảng cân đối kế toán: Tỷ lệ Nợ vay / Vốn chủ sở hữu, năng lực thanh toán, lượng tiền mặt dự trữ.
   - Các động lực tăng trưởng mới (mở rộng mạng lưới cửa hàng, nâng cao năng suất, chuyển đổi số...) và rủi ro cạnh tranh cần theo dõi sát sao.
4. "technical" (Phân tích Kỹ thuật & Dòng tiền):
   - Nhận định xu hướng giá ngắn hạn và trung hạn.
   - Chỉ rõ các ngưỡng HỖ TRỢ và KHÁNG CỰ then chốt (kèm mức giá cụ thể).
   - Tín hiệu các chỉ báo kỹ thuật quan trọng (RSI, MACD, đường MA20, MA50, MA200).
   - Đánh giá dòng tiền lớn (Smart Money), hành vi giao dịch của Khối ngoại và Tự doanh.
5. "forumSentiment" (Tâm lý Cộng đồng & Diễn đàn F319): Đánh giá tâm lý số đông nhà đầu tư cá nhân trên thị trường, mức độ chú ý và kỳ vọng của cộng đồng đối với mã cổ phiếu này.
6. "recommendation" (Khuyến nghị Chiến lược Đầu tư):
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
// CƠ CHẾ QUẢN LÝ VÀ FALLBACK API KEY (FREE => PAID)
// ==========================================
const FREE_KEY = (process.env.GEMINI_FREE_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
const PAID_KEY = (process.env.GEMINI_PAID_API_KEY || '').trim();

let activeKeyType: 'free' | 'paid' = FREE_KEY ? 'free' : 'paid';

export const getKeyStatus = () => ({
  mode: activeKeyType,
  hasFreeKey: Boolean(FREE_KEY),
  hasPaidKey: Boolean(PAID_KEY),
});

const getActiveApiKey = () => {
  if (activeKeyType === 'free' && FREE_KEY) return FREE_KEY;
  if (PAID_KEY) return PAID_KEY;
  return FREE_KEY;
};

const shouldFallbackToPaid = (error: any): boolean => {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  const status = error?.status || error?.statusCode || error?.response?.status || error?.code || error?.error?.code;
  return (
    status === 429 ||
    status === 403 ||
    status === 503 ||
    status === 500 ||
    status === 504 ||
    msg.includes('429') ||
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

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const executeWithKeyFallback = async <T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> => {
  const currentKey = getActiveApiKey();
  const ai = new GoogleGenAI({ apiKey: currentKey });

  try {
    return await operation(ai);
  } catch (error: any) {
    // Nếu đang dùng Key Free mà bị lỗi (429, 503 quá tải, 500...), lập tức chuyển sang Key Paid
    if (shouldFallbackToPaid(error) && activeKeyType === 'free' && PAID_KEY) {
      console.warn('⚠️ [API Key Manager] Key Free gặp sự cố (Hết hạn mức hoặc Server 503 quá tải). Tự động kích hoạt Key Paid ngay lập tức!');
      activeKeyType = 'paid';
      const paidAi = new GoogleGenAI({ apiKey: PAID_KEY });
      
      try {
        return await operation(paidAi);
      } catch (paidError: any) {
        // Nếu Key Paid gặp 503 tạm thời, thử lại 1 lần sau 1.5s
        if (shouldFallbackToPaid(paidError)) {
          console.warn('⚠️ [API Key Manager] Server Google đang nghẽn tạm thời, tự động thử lại sau 1.5 giây...');
          await delay(1500);
          return await operation(paidAi);
        }
        throw paidError;
      }
    }
    
    // Nếu đang ở Key Paid mà gặp 503, tự động retry sau 1.5s
    if (shouldFallbackToPaid(error)) {
      console.warn('⚠️ [API Key Manager] Thử lại yêu cầu sau 1.5 giây...');
      await delay(1500);
      return await operation(ai);
    }

    throw error;
  }
};

const sendChatWithToolFallback = async (
  ai: GoogleGenAI,
  message: string,
  systemInstruction: string
): Promise<{ response: GenerateContentResponse; chat: Chat }> => {
  // Use direct JSON mode - no Google Search tool (incompatible with responseMimeType
  // and always hits quota 0 on free tier anyway)
  const chat = ai.chats.create({
    model: PRO_MODEL,
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      systemInstruction,
    },
  });
  const response = await chat.sendMessage({ message });
  
  // Safety check: ensure we got actual content back
  const text = response.text || '';
  if (!text.trim()) {
    throw new Error('Gemini API trả về phản hồi rỗng. Vui lòng thử lại.');
  }
  
  return { response, chat };
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
    const groundingSources = extractGroundingSources(response);

    const finalResult: AnalysisResult = {
      ...parsedData,
      closingPrice: customPrice ? `${customPrice} VND` : (realtimeInfo?.formattedPrice || parsedData.closingPrice),
      macro: markdownToHtml(parsedData.macro),
      industry: markdownToHtml(parsedData.industry),
      fundamental: markdownToHtml(parsedData.fundamental),
      technical: markdownToHtml(parsedData.technical),
      forumSentiment: markdownToHtml(parsedData.forumSentiment),
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

  return await executeWithKeyFallback(async (ai) => {
    const systemInstruction = `Bạn là chuyên gia so sánh đối đầu cổ phiếu chứng khoán Việt Nam hàng đầu. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`;
    const formattedDate = getCurrentDateString();
    const prompt = `So sánh chuyên sâu và súc tích 2 cổ phiếu: "${ticker1}" và "${ticker2}" tính đến ngày ${formattedDate}.
DỮ LIỆU THỊ TRƯỜNG THỰC TẾ HÔM NAY:
- Mã ${ticker1}: Giá đóng cửa thực tế ${realtime1?.formattedPrice || 'Giá thị trường'}${realtime1?.volume ? ` (KL: ${realtime1.volume.toLocaleString('vi-VN')} cp, Biên độ: ${realtime1.low?.toLocaleString('vi-VN')} - ${realtime1.high?.toLocaleString('vi-VN')} VND)` : ''}.
- Mã ${ticker2}: Giá đóng cửa thực tế ${realtime2?.formattedPrice || 'Giá thị trường'}${realtime2?.volume ? ` (KL: ${realtime2.volume.toLocaleString('vi-VN')} cp, Biên độ: ${realtime2.low?.toLocaleString('vi-VN')} - ${realtime2.high?.toLocaleString('vi-VN')} VND)` : ''}.

Trình bày ngắn gọn, gạch đầu dòng rõ ràng.
QUY TẮC BẮT BUỘC:
1. Trường "closingPrice" của ${ticker1} PHẢI LÀ "${realtime1?.formattedPrice || 'Giá thị trường'}".
2. Trường "closingPrice" của ${ticker2} PHẢI LÀ "${realtime2?.formattedPrice || 'Giá thị trường'}".
3. Toàn bộ mức giá mục tiêu trong "targetPrices" của cả 2 mã BẮT BUỘC phải được tính toán dựa trên mức giá thực tế này.

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
      "fundamental": "markdown phân tích cơ bản, P/E, P/B, EPS của ${ticker1}",
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
      "fundamental": "markdown phân tích cơ bản, P/E, P/B, EPS của ${ticker2}",
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
                macro: markdownToHtml(t?.analysis?.macro),
                industry: markdownToHtml(t?.analysis?.industry),
                fundamental: markdownToHtml(t?.analysis?.fundamental),
                technical: markdownToHtml(t?.analysis?.technical),
                recommendation: {
                    action: recAction,
                    details: markdownToHtml(recDetails),
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
                summary: markdownToHtml(t?.stockSentiment?.summary || `Tâm lý giao dịch mã ${symbol} ở mức trung tính.`),
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
            summaryText: markdownToHtml(parsedData.comparativeSummary?.summaryText || 'Đang cập nhật tổng kết đối đầu.'),
        },
        forumSentiment: markdownToHtml(parsedData.forumSentiment),
        news: normalizeNewsList(parsedData.news, groundingSources, `${ticker1} vs ${ticker2}`),
        groundingSources
    };

    return { result: finalResult, chat };
  });
};

const fetchIndustryAnalysisInternal = async (industryInput: string): Promise<{ result: IndustryAnalysisResult, chat: Chat }> => {
  return await executeWithKeyFallback(async (ai) => {
    const systemInstruction = `Bạn là chuyên gia phân tích ngành chứng khoán. Trình bày súc tích, đi thẳng vào số liệu và luận điểm chính. Trả lời bằng tiếng Việt và BẮT BUỘC trả về JSON trong khối \`\`\`json ... \`\`\`.`;
    const formattedDate = getCurrentDateString();
    const prompt = `Phân tích súc tích ngành ${industryInput} tại Việt Nam tính đến ngày ${formattedDate}.
YÊU CẦU CỔ PHIẾU NỔI BẬT: BẮT BUỘC chọn lọc từ 3 đến 5 cổ phiếu đầu ngành/dẫn dắt tiêu biểu nhất (ví dụ ngành Thép: HPG, HSG, NKG; Khu công nghiệp: VGC, KBC, IDC...).
YÊU CẦU TIN TỨC: CHỈ lấy tin tức TRỰC TIẾP nói về ngành "${industryInput}" hoặc các doanh nghiệp lớn trong ngành. Nếu không tìm thấy tin nào trong 7 ngày gần đây, trả về "news": [].
Trả về JSON cấu trúc:
{
  "industryName": "${industryInput}",
  "assumedDate": "${formattedDate}",
  "marketSentiment": { "score": 0-100, "summary": "markdown súc tích", "vnIndexTrend": "string", "foreignInvestors": "string", "liquidity": "string" },
  "overview": "markdown phân tích tổng quan ngành súc tích",
  "opportunities": "markdown chi tiết các cơ hội & động lực tăng trưởng",
  "challenges": "markdown chi tiết các rủi ro & thách thức",
  "topStocks": [
    { "symbol": "Mã CP 1", "companyName": "Tên DN", "price": "Giá", "highlights": "Điểm nhấn đầu tư súc tích", "recommendation": "MUA" },
    { "symbol": "Mã CP 2", "companyName": "Tên DN", "price": "Giá", "highlights": "Điểm nhấn đầu tư súc tích", "recommendation": "MUA" },
    { "symbol": "Mã CP 3", "companyName": "Tên DN", "price": "Giá", "highlights": "Điểm nhấn đầu tư súc tích", "recommendation": "THEO DÕI" }
  ],
  "news": [
    { "title": "Tiêu đề tin trực tiếp về ngành ${industryInput}", "publisher": "VnEconomy", "time": "Hôm qua" }
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
        { symbol: 'SSI', companyName: 'Chứng khoán SSI', price: 'Theo dõi thị giá', highlights: 'Thị phần hàng đầu, quy mô vốn chủ sở hữu lớn hưởng lợi trực tiếp từ KRX và nâng hạng.', recommendation: 'MUA' },
        { symbol: 'HCM', companyName: 'HSC', price: 'Theo dõi thị giá', highlights: 'Thế mạnh mảng khách hàng tổ chức nước ngoài và mảng cho vay ký quỹ (margin).', recommendation: 'MUA' },
        { symbol: 'VCI', companyName: 'Vietcap', price: 'Theo dõi thị giá', highlights: 'Dẫn đầu mảng ngân hàng đầu tư (IB) với các thương vụ tư vấn M&A lớn.', recommendation: 'MUA' }
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

    const finalStocksList = rawStocks.length > 0 ? rawStocks : (matchedDefault ? DEFAULT_SECTOR_STOCKS[matchedDefault] : []);

    const finalResult: IndustryAnalysisResult = {
        ...parsedData,
        overview: markdownToHtml(parsedData.overview),
        opportunities: markdownToHtml(parsedData.opportunities),
        challenges: markdownToHtml(parsedData.challenges),
        marketSentiment: { 
          ...parsedData.marketSentiment, 
          summary: markdownToHtml(parsedData.marketSentiment?.summary),
          vnIndexTrend: stripCitations(parsedData.marketSentiment?.vnIndexTrend),
          foreignInvestors: stripCitations(parsedData.marketSentiment?.foreignInvestors),
          liquidity: stripCitations(parsedData.marketSentiment?.liquidity),
        },
        topStocks: finalStocksList.map((s: any) => ({ ...s, highlights: markdownToHtml(s.highlights) })),
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
      macro: markdownToHtml(parsedData.macro),
      industry: markdownToHtml(parsedData.industry),
      fundamental: markdownToHtml(parsedData.fundamental),
      technical: markdownToHtml(parsedData.technical),
      forumSentiment: markdownToHtml(parsedData.forumSentiment),
      marketSentiment: { 
        ...parsedData.marketSentiment, 
        summary: markdownToHtml(parsedData.marketSentiment?.summary),
        vnIndexTrend: stripCitations(parsedData.marketSentiment?.vnIndexTrend),
        foreignInvestors: stripCitations(parsedData.marketSentiment?.foreignInvestors),
        liquidity: stripCitations(parsedData.marketSentiment?.liquidity),
      },
      stockSentiment: { ...parsedData.stockSentiment, summary: markdownToHtml(parsedData.stockSentiment?.summary) },
      recommendation: { ...parsedData.recommendation, details: markdownToHtml(parsedData.recommendation?.details) },
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

