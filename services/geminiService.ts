
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import type { AnalysisResult, ComparisonResult, GroundingSource, MarketSentiment, IndustryAnalysisResult, NewsItem } from '../types';

const PRO_MODEL = 'gemini-2.5-flash';

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

        if (typeof item === 'string') {
            title = item.trim();
        } else if (typeof item === 'object' && item !== null) {
            title = (item.title || item.headline || item.name || item.text || item.summary || '').trim();
            publisher = (item.publisher || item.source || item.site || '').trim();
            time = (item.time || item.date || item.publishedAt || '').trim();
        }

        if (!title || title.length <= 5) return null;

        // Làm sạch tiêu đề (loại bỏ các dấu ngoặc kép thừa)
        const cleanTitle = title.replace(/["'\[\]]/g, '').trim();

        // Tạo câu truy vấn Google chuẩn xác theo tiêu đề + tên báo + mã cổ phiếu
        const searchQuery = publisher && !cleanTitle.toLowerCase().includes(publisher.toLowerCase())
            ? `${cleanTitle} ${publisher}`
            : (contextKeyword && !cleanTitle.toUpperCase().includes(contextKeyword.toUpperCase())
                ? `${contextKeyword} ${cleanTitle}`
                : cleanTitle);

        const finalUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

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

        // Table check
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            closeList();
            inTable = true;
            tableLines.push(trimmed);
            continue;
        } else if (inTable) {
            flushTable();
        }

        // Unordered list item: * or -
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

        // Ordered list item: 1. or 2.
        const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (olMatch) {
            if (inList !== 'ol') {
                closeList();
                outputHtml.push('<ol class="list-decimal pl-5 space-y-2 my-2.5 text-gray-300">');
                inList = 'ol';
            }
            outputHtml.push(`<li class="leading-relaxed">${styleInline(olMatch[2])}</li>`);
            continue;
        }

        // Regular paragraph or heading
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
        console.error("Failed to parse sanitized JSON. Original text preview:", text.substring(0, 500));
        throw err;
    }
};

const getCurrentDateString = () => {
  const today = new Date();
  return `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
};

const generateAnalysisPrompt = (tickerSymbol: string, customPrice?: string) => {
  const formattedDate = getCurrentDateString();
  return `Bạn là chuyên gia phân tích chứng khoán VN. Phân tích súc tích mã cổ phiếu "${tickerSymbol}".
Dữ liệu: ${customPrice ? `Giá ${customPrice} VND` : 'Giá thị trường mới nhất'} tính đến ${formattedDate}.
Sử dụng Google Search để lấy dữ liệu giá thực tế và tin tức mới nhất.
Trường "assumedDate" phải là ${formattedDate}.

QUY TẮC BẮT BUỘC VỀ TỒN TẠI MÃ CỔ PHIẾU:
- "${tickerSymbol}" BẮT BUỘC phải là một mã chứng khoán/cổ phiếu/chứng chỉ quỹ CÓ THẬT được niêm yết trên các sàn chứng khoán Việt Nam (HOSE, HNX, UPCOM).
- Nếu "${tickerSymbol}" KHÔNG PHẢI là mã chứng khoán có thật (ví dụ từ vô nghĩa, tên ngành, mã không niêm yết...), bạn PHẢI trả về JSON:
{"isValid": false, "error": "Mã cổ phiếu '${tickerSymbol}' không tồn tại trên thị trường chứng khoán Việt Nam. Vui lòng kiểm tra lại."}
TUYỆT ĐỐI KHÔNG tự bịa đặt thông tin hoặc phân tích sang mã khác!

YÊU CẦU PHÂN TÍCH: Trình bày súc tích, gạch đầu dòng rõ ràng, đi thẳng vào các luận điểm và số liệu cốt lõi, tránh diễn giải dài dòng.
YÊU CẦU TIN TỨC:
- CHỈ lấy tin tức TRỰC TIẾP đề cập đến mã cổ phiếu "${tickerSymbol}" hoặc công ty sở hữu mã "${tickerSymbol}" trong 7 ngày gần đây. Nếu không có tin trong 7 ngày, trả về "news": [].
- Cung cấp: "title", "publisher" (CafeF, Vietstock...), "time" ("2 ngày trước").
Trả về JSON cấu trúc:
{
  "isValid": true,
  "assumedDate": "string",
  "closingPrice": "string",
  "marketSentiment": { "score": 0-100, "summary": "markdown súc tích", "vnIndexTrend": "string", "foreignInvestors": "string", "liquidity": "string" },
  "stockSentiment": { "score": 0-100, "summary": "markdown súc tích" },
  "macro": "markdown súc tích", "industry": "markdown súc tích", "fundamental": "markdown súc tích", "technical": "markdown súc tích", "forumSentiment": "markdown",
  "recommendation": { "action": "MUA|BÁN|NẮM GIỮ", "details": "markdown súc tích" },
  "targetPrices": { 
    "shortTerm": { "value": number, "label": "string" }, 
    "midTerm": { "value": number, "label": "string" }, 
    "longTerm": { "value": number, "label": "string" } 
  },
  "news": [
    { "title": "Tiêu đề tin trực tiếp về ${tickerSymbol}", "publisher": "Vietstock", "time": "2 ngày trước" }
  ]
}
Ghi chú: "targetPrices" phải có "value" là số nguyên và "label" là chuỗi mô tả kèm lý do súc tích.`;
};

// ==========================================
// CƠ CHẾ QUẢN LÝ VÀ FALLBACK API KEY (FREE => PAID)
// ==========================================
const FREE_KEY = (process.env.GEMINI_FREE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
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
  return FREE_KEY || process.env.API_KEY || '';
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

const fetchStockAnalysisInternal = async (tickerSymbol: string, customPrice?: string): Promise<{ result: AnalysisResult; chat: Chat }> => {
  return await executeWithKeyFallback(async (ai) => {
    const chat = ai.chats.create({
      model: PRO_MODEL,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
        systemInstruction: `Bạn là trợ lý phân tích chứng khoán chuyên nghiệp. LUÔN sử dụng Google Search để lấy dữ liệu giá và tin tức thực tế mới nhất trong vòng 7 ngày gần nhất. TUYỆT ĐỐI KHÔNG sử dụng tin cũ từ các năm trước (2022, 2023, 2024). Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`,
      },
    });

    const response = await chat.sendMessage({ message: generateAnalysisPrompt(tickerSymbol, customPrice) });

    const parsedData = parseJsonResponse(response.text);
    if (parsedData.isValid === false || parsedData.error) {
      throw new Error(parsedData.error || `Mã cổ phiếu "${tickerSymbol}" không tồn tại trên thị trường chứng khoán Việt Nam. Vui lòng kiểm tra lại.`);
    }
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
      news: normalizeNewsList(parsedData.news, groundingSources, tickerSymbol),
      groundingSources
    };

    return { result: finalResult, chat };
  });
};

const fetchStockComparisonInternal = async (ticker1: string, ticker2: string): Promise<{ result: ComparisonResult, chat: Chat }> => {
  return await executeWithKeyFallback(async (ai) => {
    const chat = ai.chats.create({
        model: PRO_MODEL,
        config: {
            temperature: 0.1,
            tools: [{ googleSearch: {} }],
            systemInstruction: `Bạn là chuyên gia so sánh đối đầu cổ phiếu chứng khoán Việt Nam hàng đầu. LUÔN sử dụng Google Search để lấy dữ liệu giá đóng cửa thực tế mới nhất và tin tức trong 7 ngày gần đây cho cả 2 mã. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`,
        },
    });

    const formattedDate = getCurrentDateString();
    const prompt = `So sánh chuyên sâu và súc tích 2 cổ phiếu: "${ticker1}" và "${ticker2}" tính đến ngày ${formattedDate}.
BẮT BUỘC sử dụng Google Search để lấy giá đóng cửa thực tế mới nhất. Trình bày ngắn gọn, gạch đầu dòng rõ ràng.
YÊU CẦU TIN TỨC: CHỈ lấy 5-7 tin tức TRỰC TIẾP đề cập đến "${ticker1}" hoặc "${ticker2}" trong 7 ngày gần đây. Nếu không tìm thấy, trả về "news": [].

BẮT BUỘC trả về JSON theo đúng cấu trúc sau:
{
  "assumedDate": "${formattedDate}",
  "ticker1": {
    "symbol": "${ticker1}",
    "closingPrice": "Giá đóng cửa kèm VND (ví dụ: 19.800 VND)",
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
    "closingPrice": "Giá đóng cửa kèm VND (ví dụ: 26.000 VND)",
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
    const response = await chat.sendMessage({ message: prompt });

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
    const chat = ai.chats.create({
        model: PRO_MODEL,
        config: {
            temperature: 0.1,
            tools: [{ googleSearch: {} }],
            systemInstruction: `Bạn là chuyên gia phân tích ngành chứng khoán. LUÔN sử dụng Google Search để lấy dữ liệu thị trường và giá cổ phiếu thực tế mới nhất trong vòng 7 ngày gần nhất. TUYỆT ĐỐI KHÔNG sử dụng tin cũ từ các năm trước. Trình bày súc tích, đi thẳng vào số liệu và luận điểm chính. Trả lời bằng tiếng Việt và BẮT BUỘC trả về JSON trong khối \`\`\`json ... \`\`\`.`,
        },
    });

    const formattedDate = getCurrentDateString();
    const prompt = `Phân tích súc tích ngành ${industryInput} tại Việt Nam tính đến ngày ${formattedDate}. 
BẮT BUỘC sử dụng Google Search để tìm kiếm dữ liệu thị trường mới nhất. KHÔNG ĐƯỢC tự tạo ra giá giả định.
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
    const response = await chat.sendMessage({ message: prompt });

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
    const chat = ai.chats.create({
      model: PRO_MODEL,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
        systemInstruction: `Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam cao cấp. LUÔN sử dụng Google Search để lấy điểm số thực tế mới nhất của chỉ số, thanh khoản, động thái khối ngoại và tin tức thị trường trong vòng 7 ngày gần nhất. Trả lời bằng tiếng Việt và BẮT BUỘC trả về đúng cấu trúc JSON trong khối \`\`\`json ... \`\`\`.`,
      },
    });

    const response = await chat.sendMessage({ message: generateIndexAnalysisPrompt(indexSymbol) });

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

