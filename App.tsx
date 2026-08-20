import React, { useState, useCallback, useEffect } from 'react';
import { TickerInput, INDUSTRIES, MARKET_INDICES, findMatchingIndustry, findMatchingIndex } from './components/TickerInput';
import { AnalysisDisplay } from './components/AnalysisDisplay';
import { ComparisonDisplay } from './components/ComparisonDisplay';
import { IndustryAnalysisDisplay } from './components/IndustryAnalysisDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { fetchStockAnalysis, fetchStockComparison, fetchIndustryAnalysis, fetchIndexAnalysis, markdownToHtml } from './services/geminiService';
import type { AnalysisResult, AnalysisError, ChatMessage, ComparisonResult, IndustryAnalysisResult } from './types';
import { GlobeAltIcon, ScaleIcon, BuildingOfficeIcon, SparklesIcon } from './components/IconComponents';
import type { Chat } from '@google/genai';
import { ChatInterface } from './components/ChatInterface';
import { PriceAlerts } from './components/PriceAlerts';

// Validator helper for Vietnamese stock tickers (HOSE, HNX, UPCOM)
const isValidStockTicker = (symbol: string): boolean => {
  if (!symbol) return false;
  const clean = symbol.trim().toUpperCase();
  // 3 uppercase English letters (e.g. FPT, HPG, VCB, SSI, VHM...)
  if (/^[A-Z]{3}$/.test(clean)) return true;
  // ETFs / Funds / Covered Warrants (e.g. E1VFVN30, FUEVFVND, CVPB2301)
  if (/^[A-Z0-9]{4,10}$/.test(clean) && !/[\u00C0-\u1EF9]/.test(symbol)) return true;
  return false;
};

// Fix: Define AIStudio interface to avoid conflicts and satisfy identical modifier requirements
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    // Fix: Subsequent property declarations must have the same type 'AIStudio' and identical modifiers (readonly)
    readonly aistudio: AIStudio;
  }
}

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [industryAnalysis, setIndustryAnalysis] = useState<IndustryAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<AnalysisError | null>(null);
  const [ticker, setTicker] = useState<string>('');

  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).aistudio?.hasSelectedApiKey) {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } else {
          // Khi chạy cục bộ (Local development), key đã được cấu hình qua .env
          setHasApiKey(true);
        }
      } catch {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleOpenSelectKey = async () => {
    if (typeof window !== 'undefined' && (window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
    }
    setHasApiKey(true);
  };

  const handleAnalyze = useCallback(async (input: string) => {
    if (!input) return;

    setIsLoading(true);
    setAnalysis(null);
    setComparison(null);
    setIndustryAnalysis(null);
    setError(null);
    setChatSession(null);
    setChatHistory([]);
    setTicker(input);

    try {
        const cleanedInput = input.trim();

        // 1. Kiểm tra nếu là Chỉ số thị trường (VN-INDEX, VN30, HNX-Index, UPCOM...)
        const matchedIndex = findMatchingIndex(cleanedInput);
        if (matchedIndex) {
            setTicker(matchedIndex);
            const { result, chat } = await fetchIndexAnalysis(matchedIndex);
            setAnalysis(result);
            setChatSession(chat);
            return;
        }

        // 2. Kiểm tra nếu là Phân tích Ngành (Y tế, Dược phẩm, Ngân hàng, BĐS, Thép...)
        const matchedIndustry = findMatchingIndustry(cleanedInput);
        if (matchedIndustry) {
             setTicker(matchedIndustry);
             const { result, chat } = await fetchIndustryAnalysis(matchedIndustry);
             setIndustryAnalysis(result);
             setChatSession(chat);
             return; 
        }

        // 3. Kiểm tra nếu nhập kèm giá tùy chỉnh (VD: FPT 130000)
        const priceMatch = cleanedInput.match(/^([a-zA-Z]{3,4})[\s,]+(\d{1,3}(?:[.,]\d{3})*)$/);
        if (priceMatch) {
            const tickerSymbol = priceMatch[1].toUpperCase();
            if (isValidStockTicker(tickerSymbol)) {
                const customPrice = priceMatch[2];
                setTicker(tickerSymbol);
                const { result, chat } = await fetchStockAnalysis(tickerSymbol, customPrice);
                setAnalysis(result);
                setChatSession(chat);
                return;
            }
        }

        // 4. Kiểm tra nếu là So sánh (VD: FPT vs HPG hoặc FPT, HPG)
        const splitTokens = cleanedInput.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
        const hasComparisonKeyword = cleanedInput.toLowerCase().includes(' vs ');
        const hasComma = cleanedInput.includes(',');

        if (hasComparisonKeyword || (hasComma && splitTokens.length === 2)) {
            const isSecondTokenNumber = /^\d+$/.test(splitTokens[1].replace(/[.,]/g, ''));
            if (!isSecondTokenNumber && splitTokens.length >= 2) {
                 const t1 = splitTokens[0];
                 const t2 = splitTokens[1];
                 if (isValidStockTicker(t1) && isValidStockTicker(t2)) {
                     const { result, chat } = await fetchStockComparison(t1, t2);
                     setComparison(result);
                     setChatSession(chat);
                     setTicker(t1 + ' vs ' + t2);
                     return;
                 }
            }
        }

        // 5. Kiểm tra Mã cổ phiếu đơn lẻ hợp lệ (3 ký tự như FPT, HPG, VCB...)
        const upperInput = cleanedInput.toUpperCase();
        if (isValidStockTicker(upperInput)) {
            setTicker(upperInput);
            const { result, chat } = await fetchStockAnalysis(upperInput);
            setAnalysis(result);
            setChatSession(chat);
            return;
        }

        // 6. TỪ CHỐI NGAY LẬP TỨC NẾU KHÔNG HỢP LỆ (KHÔNG GỌI AI BỊA RA DỮ LIỆU)
        setError({
          title: "Không tìm thấy mã hoặc ngành hợp lệ",
          message: `Hệ thống không tìm thấy mã cổ phiếu, ngành hoặc chỉ số "${cleanedInput}".\n\nVui lòng kiểm tra lại:\n• Mã cổ phiếu (VD: FPT, HPG, VCB, SSI...)\n• Tên ngành (VD: Y tế, Bất động sản, Ngân hàng, Thép...)\n• Chỉ số thị trường (VD: VN-Index, VN30, HNX-Index...)\n• So sánh 2 mã (VD: FPT vs HPG)`,
        });
        return;

    } catch (err) {
      if (err instanceof Error && err.message === "RE-AUTH-NEEDED") {
        setHasApiKey(false);
        setError({
          title: "Yêu cầu lại quyền truy cập",
          message: "API Key của bạn không còn hợp lệ hoặc dự án chưa được thanh toán. Vui lòng chọn lại Key.",
        });
      } else {
        setError({
          title: "Lỗi Phân Tích",
          message: err instanceof Error ? err.message : "Đã có lỗi không xác định xảy ra. Vui lòng thử lại sau.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!chatSession || !message.trim() || isChatLoading) return;
    
    setIsChatLoading(true);
    const userMessage: ChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);

    try {
      const response = await chatSession.sendMessage({ message });
      const htmlContent = markdownToHtml(response.text);
      const modelMessage: ChatMessage = { role: 'model', content: htmlContent };
      setChatHistory(prev => [...prev, modelMessage]);
    } catch (err) {
      setChatHistory(prev => [...prev, {
        role: 'model',
        content: `<p class="text-red-400">Xin lỗi, đã có lỗi xảy ra khi xử lý câu hỏi của bạn. Vui lòng thử lại.</p>`,
      }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatSession, isChatLoading]);

  if (hasApiKey === null) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><LoadingSpinner /></div>;

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 shadow-2xl max-w-md w-full">
          <SparklesIcon className="w-16 h-16 text-cyan-400 mx-auto mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold text-white mb-4">Chào mừng bạn!</h2>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Để sử dụng tính năng phân tích nâng cao với Gemini 3 Pro và Google Search, bạn cần chọn một API Key từ một dự án Google Cloud có cấu hình thanh toán.
          </p>
          <button
            onClick={handleOpenSelectKey}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all duration-300"
          >
            Chọn API Key của bạn
          </button>
          <p className="mt-6 text-xs text-gray-500">
            Tìm hiểu thêm về <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-cyan-400 hover:underline">tài liệu thanh toán</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            Phân tích đầu tư
          </h1>
          <p className="text-gray-400 mt-2">by thangvu</p>
        </header>

        <main>
          <p className="text-center text-lg text-gray-400 mb-6">
            Phân tích chuyên sâu thị trường chứng khoán Việt Nam.
            <br />
            Nhập mã (VD: FPT), so sánh (VD: FPT, HPG), hoặc chọn tên ngành (VD: Thép).
          </p>
          <TickerInput onAnalyze={handleAnalyze} isLoading={isLoading} currentValue={ticker} />

          {isLoading && <LoadingSpinner />}
          {error && (
             <div className="mt-8 text-center bg-red-900/20 border border-red-600 p-6 rounded-lg max-w-2xl mx-auto">
                <h3 className="text-xl font-bold text-red-400">{error.title}</h3>
                <p className="text-red-300 mt-2">{error.message}</p>
                {error.title === "Yêu cầu lại quyền truy cập" && (
                    <button onClick={handleOpenSelectKey} className="mt-4 px-6 py-2 bg-red-600 rounded-lg text-white font-bold">Chọn lại Key</button>
                )}
             </div>
          )}
          
          {!isLoading && !error && analysis && (
            <>
              <AnalysisDisplay analysis={analysis} ticker={ticker} />
              <ChatInterface history={chatHistory} isLoading={isChatLoading} onSendMessage={handleSendMessage} />
            </>
          )}

          {!isLoading && !error && comparison && (
            <>
              <ComparisonDisplay comparison={comparison} />
               <ChatInterface history={chatHistory} isLoading={isChatLoading} onSendMessage={handleSendMessage} />
            </>
          )}

           {!isLoading && !error && industryAnalysis && (
            <>
              <IndustryAnalysisDisplay analysis={industryAnalysis} onSelectTicker={handleAnalyze} />
               <ChatInterface history={chatHistory} isLoading={isChatLoading} onSendMessage={handleSendMessage} />
            </>
          )}

          {!isLoading && !error && !analysis && !comparison && !industryAnalysis && (
            <div className="text-center max-w-4xl mx-auto mt-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-3">
                    <GlobeAltIcon className="w-8 h-8 text-blue-400"/>
                    <h3 className="text-xl font-semibold text-gray-200">Phân Tích Cổ Phiếu</h3>
                  </div>
                  <p className="mt-2 text-gray-400">Nhập mã (VD: HPG). Hoặc nhập kèm giá để phân tích kịch bản (VD: "HPG 30000").</p>
                </div>
                <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-3">
                    <ScaleIcon className="w-8 h-8 text-purple-400"/>
                    <h3 className="text-xl font-semibold text-gray-200">So Sánh Đối Đầu</h3>
                  </div>
                  <p className="mt-2 text-gray-400">So sánh trực tiếp sức mạnh giữa hai mã cổ phiếu (VD: "FPT vs CMG").</p>
                </div>
                <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-3">
                    <BuildingOfficeIcon className="w-8 h-8 text-orange-400"/>
                    <h3 className="text-xl font-semibold text-gray-200">Phân Tích Ngành</h3>
                  </div>
                  <p className="mt-2 text-gray-400">Chọn ngành từ danh sách để AI tìm ra những cổ phiếu dẫn đầu (VD: Thép, Ngân hàng).</p>
                </div>
              </div>
            </div>
          )}
        </main>
        
        <footer className="mt-12 pb-8">
          <div className="max-w-3xl mx-auto bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-yellow-400 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-gray-400 text-sm">
                    <span className="font-semibold text-gray-300">Tuyên bố miễn trừ trách nhiệm:</span> Thông tin chỉ mang tính chất tham khảo, không phải là lời khuyên đầu tư.
                </p>
            </div>
          </div>
        </footer>
      </div>
      <PriceAlerts onSelectTicker={handleAnalyze} currentTicker={ticker} />
    </div>
  );
};

export default App;