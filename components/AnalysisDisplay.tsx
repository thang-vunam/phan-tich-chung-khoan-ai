
import React, { useRef, useEffect, useState } from 'react';
import type { AnalysisResult } from '../types';
import { ChartBarIcon, DocumentTextIcon, GlobeAltIcon, BuildingOfficeIcon, ChevronDownIcon, NewspaperIcon, ArrowTopRightOnSquareIcon, ChatBubbleLeftEllipsisIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, MinusCircleIcon, BeakerIcon, StarIcon, ArrowDownTrayIcon } from './IconComponents';
import { SentimentGauge } from './SentimentGauge';
import { alertService } from '../services/alertService';
import { exportElementToPdf } from '../services/pdfExportService';

interface AnalysisDisplayProps {
  analysis: AnalysisResult;
  ticker: string;
}

const getRecommendationAppearance = (action: string) => {
  const normalizedAction = (action || '').toUpperCase();
  if (normalizedAction.includes('MUA') || normalizedAction.includes('BUY')) {
      return {
        bg: 'bg-green-500/10',
        text: 'text-green-400',
        border: 'border-green-500',
        icon: <ArrowTrendingUpIcon className="w-10 h-10" />,
      };
  } else if (normalizedAction.includes('BÁN') || normalizedAction.includes('SELL')) {
      return {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500',
        icon: <ArrowTrendingDownIcon className="w-10 h-10" />,
      };
  } else if (normalizedAction.includes('GIỮ') || normalizedAction.includes('HOLD')) {
      return {
        bg: 'bg-yellow-500/10',
        text: 'text-yellow-400',
        border: 'border-yellow-500',
        icon: <MinusCircleIcon className="w-10 h-10" />,
      };
  }
  return {
    bg: 'bg-gray-700/20',
    text: 'text-gray-300',
    border: 'border-gray-600',
    icon: null,
  };
};

const parsePrice = (priceStr: any): number => {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  
  const str = String(priceStr).trim();
  // Lấy cụm số đầu tiên (trước các dấu ngoặc đơn hoặc ký tự tăng giảm)
  const match = str.match(/^([0-9.,]+)/) || str.match(/([0-9]+(?:[.,][0-9]+)*)/);
  if (!match) return 0;

  let numStr = match[1];

  // Xử lý định dạng số thập phân / phân cách hàng nghìn kiểu Việt Nam:
  // Nếu có cả dấu '.' và dấu ',' (ví dụ "1.726,69"): '.' là phân cách hàng nghìn, ',' là số thập phân
  if (numStr.includes('.') && numStr.includes(',')) {
    numStr = numStr.replace(/\./g, '').replace(/,/g, '.');
  } 
  // Nếu chỉ có dấu '.'
  else if (numStr.includes('.')) {
    const parts = numStr.split('.');
    // Nếu dạng "40.800" (3 số sau dấu .) -> phân cách hàng nghìn
    if (parts.length > 1 && parts[parts.length - 1].length === 3 && parts.length === 2 && parseInt(parts[0], 10) < 1000) {
      numStr = numStr.replace(/\./g, '');
    } else if (parts.length > 2) {
      numStr = numStr.replace(/\./g, '');
    }
  } 
  // Nếu chỉ có dấu ','
  else if (numStr.includes(',')) {
    const parts = numStr.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      numStr = numStr.replace(/,/g, '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  }

  const val = parseFloat(numStr);
  return isNaN(val) ? 0 : val;
};

const formatUpside = (target: number, current: number) => {
  if (!target || !current) return null;
  const percent = ((target - current) / current) * 100;
  return (
    <span className={`text-xs ml-1 font-bold ${percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
      ({percent >= 0 ? '+' : ''}{percent.toFixed(1)}%)
    </span>
  );
};

const AnalysisSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, icon, children, defaultOpen = false }) => {
  const content = typeof children === 'string'
    ? <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: children }} />
    : children;

  return (
    <details className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden group" open={defaultOpen}>
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        </div>
        <ChevronDownIcon className="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180" />
      </summary>
      <div className="p-4 border-t border-gray-700">
        {content}
      </div>
    </details>
  );
};


export const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ analysis, ticker }) => {
  const recommendationAppearance = getRecommendationAppearance(analysis.recommendation.action);
  const reportTopRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const isIndex = Boolean(ticker && (
    ticker.toUpperCase().includes('INDEX') ||
    ticker.toUpperCase().includes('VN30') ||
    ticker.toUpperCase().includes('HNX') ||
    ticker.toUpperCase().includes('UPCOM') ||
    ticker.toUpperCase().includes('VNI')
  ));

  useEffect(() => {
    const timer = setTimeout(() => {
      reportTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(timer);
  }, [analysis]);

  const handleExportPdf = async () => {
    if (!reportTopRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const sanitizedTicker = ticker.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedDate = (analysis.assumedDate || new Date().toLocaleDateString('vi-VN')).replace(/[\/\\]/g, '-');
      await exportElementToPdf(reportTopRef.current, {
        fileName: `Bao_Cao_Phan_Tich_${sanitizedTicker}_${sanitizedDate}.pdf`,
        reportTitle: isIndex ? `BÁO CÁO PHÂN TÍCH CHỈ SỐ ${ticker}` : `BÁO CÁO PHÂN TÍCH CỔ PHIẾU ${ticker}`,
      });
    } catch (error) {
      console.error('Lỗi xuất PDF:', error);
      alert('Không thể xuất tệp PDF. Vui lòng thử lại!');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div ref={reportTopRef} className="mt-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <h2 className="text-3xl font-bold text-gray-100">
            {isIndex ? 'Báo cáo Phân tích Chỉ số: ' : 'Báo cáo Phân tích Cổ phiếu: '}
            <span className="text-cyan-400">{ticker}</span>
          </h2>
          <p className="text-gray-400 mt-1">Dữ liệu tính đến ngày {analysis.assumedDate}</p>
        </div>

        <div className="flex items-center gap-2" data-pdf-ignore="true">
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md ${
              isExportingPdf
                ? 'bg-cyan-800/50 text-cyan-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white hover:shadow-[0_0_15px_rgba(6,182,212,0.4)]'
            }`}
            title="Xuất báo cáo thành tệp PDF để xem ngoại tuyến"
          >
            {isExportingPdf ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Đang tạo PDF...</span>
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-4 h-4" />
                <span>Xuất PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className={`p-6 rounded-xl border-2 shadow-lg ${recommendationAppearance.border} ${recommendationAppearance.bg} relative`}>
        <button 
            data-pdf-ignore="true"
            onClick={() => {
              alertService.addToWatchlist(ticker);
              alert(`Đã thêm ${ticker} vào danh mục theo dõi!`);
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-gray-800/50 text-gray-400 hover:text-yellow-400 transition-all flex items-center gap-2 px-3 text-xs font-bold border border-gray-700 shadow-sm"
        >
            <StarIcon className="w-4 h-4" />
            Lưu mã
        </button>
        <div className="flex flex-col items-center text-center gap-2">
          <p className="text-sm font-medium text-gray-400">Khuyến nghị chiến lược</p>
          <div className={`flex items-center gap-4 ${recommendationAppearance.text}`}>
             {recommendationAppearance.icon}
             <p className="text-5xl font-extrabold">{(analysis.recommendation.action || 'N/A').toUpperCase()}</p>
          </div>
          <p className="font-semibold text-yellow-400">{analysis.closingPrice}</p>
          
          {analysis.targetPrices && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl mt-6 border-t border-gray-700/50 pt-6">
              {[
                { label: 'Ngắn hạn', data: analysis.targetPrices.shortTerm, color: 'text-cyan-400' },
                { label: 'Trung hạn', data: analysis.targetPrices.midTerm, color: 'text-blue-400', border: true },
                { label: 'Dài hạn', data: analysis.targetPrices.longTerm, color: 'text-purple-400' }
              ].map((item, idx) => {
                if (!item.data) return null;
                const currentPrice = parsePrice(analysis.closingPrice);
                const targetVal = typeof item.data.value === 'number' ? item.data.value : parsePrice(item.data.value);
                return (
                  <div key={idx} className={`flex flex-col items-center p-3 rounded-lg bg-gray-900/50 ${item.border ? 'sm:border-x border-gray-700/50' : ''}`}>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{item.label}</span>
                    <div className="flex items-baseline">
                      <span className={`text-xl font-bold ${item.color}`}>
                        {targetVal ? targetVal.toLocaleString('vi-VN') : (item.data.label || 'N/A')}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-1 font-normal">{isIndex ? 'điểm' : 'VND'}</span>
                      {formatUpside(targetVal, currentPrice)}
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 text-center leading-relaxed">
                      {item.data.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 w-full text-center">
             <div 
                className="prose prose-invert prose-sm max-w-2xl inline-block text-left" 
                dangerouslySetInnerHTML={{ __html: analysis.recommendation.details }} 
              />
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        {analysis.marketSentiment && analysis.stockSentiment && (
          <details className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden group" open={true}>
            <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
              <div className="flex items-center gap-3">
                <BeakerIcon className="w-6 h-6 text-yellow-400" />
                <h3 className="text-lg font-semibold text-gray-100">Phân tích Tâm lý & Sức mạnh</h3>
              </div>
              <ChevronDownIcon className="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180" />
            </summary>
            <div className="p-4 sm:p-6 border-t border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="flex flex-col items-center">
                  <h4 className="text-md font-semibold text-gray-300 mb-2">
                    {isIndex ? 'Tâm lý Toàn thị trường' : 'Thị trường (VN-Index)'}
                  </h4>
                  <SentimentGauge score={analysis.marketSentiment.score} />
                  <div className="mt-4 w-full">
                    <div className="prose prose-invert prose-sm max-w-none text-gray-300 mb-4" dangerouslySetInnerHTML={{ __html: analysis.marketSentiment.summary }} />
                    <div className="space-y-2.5 mt-4 text-sm">
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1">Xu hướng chung</span>
                            <p className="text-gray-200 text-xs leading-relaxed">{analysis.marketSentiment.vnIndexTrend}</p>
                        </div>
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1">Khối ngoại</span>
                            <p className="text-gray-200 text-xs leading-relaxed">{analysis.marketSentiment.foreignInvestors}</p>
                        </div>
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1">Thanh khoản</span>
                            <p className="text-gray-200 text-xs leading-relaxed">{analysis.marketSentiment.liquidity}</p>
                        </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <h4 className="text-md font-semibold text-gray-300 mb-2">
                    {isIndex ? `Sức mạnh Chỉ số (${ticker})` : `Cổ phiếu (${ticker})`}
                  </h4>
                  <SentimentGauge score={analysis.stockSentiment.score} />
                   <div className="mt-4 w-full">
                    <div className="prose prose-invert prose-sm max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: analysis.stockSentiment.summary }} />
                   </div>
                </div>
              </div>
            </div>
          </details>
        )}
        <AnalysisSection title={isIndex ? "Bối cảnh Vĩ mô Tác động" : "Phân tích Vĩ mô & Vi mô"} icon={<GlobeAltIcon className="w-6 h-6 text-blue-400" />} defaultOpen={true}>
          {analysis.macro}
        </AnalysisSection>
        <AnalysisSection title={isIndex ? "Phân hóa Dòng tiền Nhóm ngành" : "Phân tích Ngành"} icon={<BuildingOfficeIcon className="w-6 h-6 text-purple-400" />}>
          {analysis.industry}
        </AnalysisSection>
        <AnalysisSection title={isIndex ? "Định giá P/E & Cơ bản Thị trường" : "Phân tích Cơ bản Doanh nghiệp"} icon={<DocumentTextIcon className="w-6 h-6 text-orange-400" />}>
          {analysis.fundamental}
        </AnalysisSection>
        <AnalysisSection title="Phân tích Kỹ thuật" icon={<ChartBarIcon className="w-6 h-6 text-green-400" />}>
          {analysis.technical}
        </AnalysisSection>
        {analysis.forumSentiment && (
           <AnalysisSection title="Tâm lý Cộng đồng (f319)" icon={<ChatBubbleLeftEllipsisIcon className="w-6 h-6 text-teal-400" />}>
              {analysis.forumSentiment}
           </AnalysisSection>
        )}
        
        {Array.isArray(analysis.news) && analysis.news.length > 0 && (
          <div data-pdf-ignore="true">
            <AnalysisSection title="Tin tức & Sự kiện liên quan (7 ngày gần nhất)" icon={<NewspaperIcon className="w-6 h-6 text-cyan-400" />}>
              <ul className="space-y-3">
                {analysis.news.map((item, index) => (
                  <li key={index} className="p-3 rounded-xl bg-gray-900/50 border border-gray-700/60 hover:border-cyan-500/50 transition-all">
                    <a 
                      href={item.url || (item as any).link || `https://www.google.com/search?q=${encodeURIComponent(item.title)}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex flex-col gap-2 group w-full cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-200 group-hover:text-cyan-300 transition-colors leading-snug">
                          {item.title}
                        </span>
                        <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 flex-shrink-0 mt-0.5" />
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {item.publisher && (
                          <span className="px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 font-medium">
                            {item.publisher}
                          </span>
                        )}
                        {item.time && (
                          <span className="text-gray-400">
                            • {item.time}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-500 ml-auto group-hover:text-cyan-400">
                          Đọc bài báo gốc ↗
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </AnalysisSection>
          </div>
        )}


      </div>
    </div>
  );
};
