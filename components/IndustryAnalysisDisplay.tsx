
import React, { useRef, useEffect, useState } from 'react';
import type { IndustryAnalysisResult, IndustryStock } from '../types';
import { GlobeAltIcon, BuildingOfficeIcon, ChevronDownIcon, NewspaperIcon, ArrowTopRightOnSquareIcon, LightBulbIcon, ArrowTrendingUpIcon, MinusCircleIcon, StarIcon, ArrowDownTrayIcon } from './IconComponents';
import { SentimentGauge } from './SentimentGauge';
import { alertService } from '../services/alertService';
import { exportElementToPdf } from '../services/pdfExportService';

interface IndustryAnalysisDisplayProps {
  analysis: IndustryAnalysisResult;
  onSelectTicker: (ticker: string) => void;
}

const StockCard: React.FC<{ stock: IndustryStock; onSelect: (symbol: string) => void }> = ({ stock, onSelect }) => {
    const isBuy = (stock.recommendation || '').toUpperCase().includes('MUA');
    const borderColor = isBuy ? 'border-green-500' : 'border-yellow-500';
    const bgColor = isBuy ? 'bg-green-500/10' : 'bg-yellow-500/10';
    const textColor = isBuy ? 'text-green-400' : 'text-yellow-400';
    const Icon = isBuy ? ArrowTrendingUpIcon : MinusCircleIcon;

    const handleWatch = (e: React.MouseEvent) => {
        e.stopPropagation();
        alertService.addToWatchlist(stock.symbol, stock.companyName);
        alert('Đã thêm ' + stock.symbol + ' vào danh mục theo dõi!');
    };

    return (
        <div 
          onClick={() => onSelect(stock.symbol)}
          className={`p-4 rounded-xl border ${borderColor} ${bgColor} flex flex-col gap-3 transition-all hover:scale-105 cursor-pointer relative group`}
        >
            <button 
                onClick={handleWatch}
                className="absolute top-2 right-2 p-2 rounded-full bg-gray-800/80 text-gray-400 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-all"
                title="Thêm vào danh mục theo dõi"
            >
                <StarIcon className="w-5 h-5" />
            </button>
            <div className="flex justify-between items-start pr-8">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-bold text-gray-100">{stock.symbol}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 truncate max-w-[100px]">{stock.companyName}</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-200 mt-1">{stock.price}</p>
                </div>
                <div className={`flex flex-col items-end ${textColor}`}>
                    <Icon className="w-8 h-8" />
                    <span className="font-bold text-sm">{stock.recommendation}</span>
                </div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-lg flex-grow">
                 <div className="prose prose-invert prose-sm max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: stock.highlights }} />
            </div>
        </div>
    );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; content: string; defaultOpen?: boolean }> = ({ title, icon, content, defaultOpen = true }) => (
  <details className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden group" open={defaultOpen}>
    <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
      </div>
      <ChevronDownIcon className="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180" />
    </summary>
    <div className="p-4 border-t border-gray-700">
        <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  </details>
);

export const IndustryAnalysisDisplay: React.FC<IndustryAnalysisDisplayProps> = ({ analysis, onSelectTicker }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(timer);
  }, [analysis]);

  const handleExportPdf = async () => {
    if (!reportRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const sanitizedName = analysis.industryName.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_');
      const sanitizedDate = (analysis.assumedDate || new Date().toLocaleDateString('vi-VN')).replace(/[\/\\]/g, '-');
      await exportElementToPdf(reportRef.current, {
        fileName: `Bao_Cao_Nganh_${sanitizedName}_${sanitizedDate}.pdf`,
        reportTitle: `BÁO CÁO PHÂN TÍCH NGÀNH ${analysis.industryName.toUpperCase()}`,
      });
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('Đã có lỗi xảy ra khi xuất PDF. Vui lòng thử lại.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div ref={reportRef} className="mt-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <h2 className="text-3xl font-bold text-gray-100">
            Báo cáo Ngành: <span className="text-cyan-400">{analysis.industryName}</span>
          </h2>
          <p className="text-gray-400 mt-1">Dữ liệu tính đến {analysis.assumedDate}</p>
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
            title="Xuất báo cáo ngành thành tệp PDF để xem ngoại tuyến"
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

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="col-span-1 flex flex-col items-center">
                 <h4 className="text-md font-semibold text-gray-300 mb-2">Sức hút dòng tiền</h4>
                 <SentimentGauge score={analysis.marketSentiment.score} size={180} />
            </div>
            <div className="col-span-2">
                <div className="prose prose-invert prose-sm text-gray-300 mb-4" dangerouslySetInnerHTML={{ __html: analysis.marketSentiment.summary }} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-700/60 shadow-inner">
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1.5">Khối ngoại</span>
                        <p className="text-gray-200 text-xs leading-relaxed font-normal">{analysis.marketSentiment.foreignInvestors}</p>
                    </div>
                    <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-700/60 shadow-inner">
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1.5">Thanh khoản</span>
                        <p className="text-gray-200 text-xs leading-relaxed font-normal">{analysis.marketSentiment.liquidity}</p>
                    </div>
                </div>
            </div>
         </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
            <LightBulbIcon className="w-8 h-8 text-yellow-400" />
            <h3 className="text-2xl font-bold text-gray-100">Cổ phiếu Nổi bật</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysis.topStocks.map((stock) => (
                <StockCard key={stock.symbol} stock={stock} onSelect={onSelectTicker} />
            ))}
        </div>
      </div>

      <Section title="Tổng quan Ngành" icon={<GlobeAltIcon className="w-6 h-6 text-blue-400" />} content={analysis.overview} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Section title="Cơ hội & Động lực" icon={<ArrowTrendingUpIcon className="w-6 h-6 text-green-400" />} content={analysis.opportunities} />
          <Section title="Rủi ro & Thách thức" icon={<MinusCircleIcon className="w-6 h-6 text-red-400" />} content={analysis.challenges} />
      </div>

      {Array.isArray(analysis.news) && analysis.news.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6" data-pdf-ignore="true">
          <h3 className="text-xl font-bold text-gray-100 flex items-center gap-4 mb-4">
            <NewspaperIcon className="w-7 h-7 text-cyan-400" />
            Tin tức & Sự kiện Ngành (7 ngày gần nhất)
          </h3>
          <ul className="space-y-3">
            {analysis.news.map((item, index) => (
              <li key={index} className="p-3 rounded-xl bg-gray-900/50 border border-gray-700/60 hover:border-cyan-500/50 transition-all">
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex flex-col gap-2 group w-full"
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
        </div>
      )}


    </div>
  );
};
