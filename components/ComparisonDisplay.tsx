
import React, { useRef, useEffect, useState } from 'react';
import type { ComparisonResult, TickerAnalysis, StructuredComparisonSummary } from '../types';
import { ChartBarIcon, DocumentTextIcon, GlobeAltIcon, BuildingOfficeIcon, LightBulbIcon, ChevronDownIcon, NewspaperIcon, ArrowTopRightOnSquareIcon, ScaleIcon, ChatBubbleLeftEllipsisIcon, BeakerIcon, ArrowDownTrayIcon } from './IconComponents';
import { SentimentGauge } from './SentimentGauge';
import { exportElementToPdf } from '../services/pdfExportService';

const getRecommendationClasses = (action: string) => {
  const normalizedAction = (action || '').toUpperCase();
  if (normalizedAction.includes('MUA') || normalizedAction.includes('BUY')) {
    return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500' };
  } else if (normalizedAction.includes('BÁN') || normalizedAction.includes('SELL')) {
    return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500' };
  } else if (normalizedAction.includes('GIỮ') || normalizedAction.includes('HOLD')) {
    return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500' };
  }
  return { bg: 'bg-gray-700/20', text: 'text-gray-300', border: 'border-gray-600' };
};

const parsePrice = (priceStr: any): number => {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  
  const str = String(priceStr).trim();
  const match = str.match(/^([0-9.,]+)/) || str.match(/([0-9]+(?:[.,][0-9]+)*)/);
  if (!match) return 0;

  let numStr = match[1];

  if (numStr.includes('.') && numStr.includes(',')) {
    numStr = numStr.replace(/\./g, '').replace(/,/g, '.');
  } else if (numStr.includes('.')) {
    const parts = numStr.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3 && parts.length === 2 && parseInt(parts[0], 10) < 1000) {
      numStr = numStr.replace(/\./g, '');
    } else if (parts.length > 2) {
      numStr = numStr.replace(/\./g, '');
    }
  } else if (numStr.includes(',')) {
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
    <span className={`text-[10px] ml-1 font-bold ${percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
      ({percent >= 0 ? '+' : ''}{percent.toFixed(1)}%)
    </span>
  );
};

const TickerCard: React.FC<{ symbol: string; price: string; analysis: TickerAnalysis }> = ({ symbol, price, analysis }) => {
  const action = analysis?.recommendation?.action || 'NẮM GIỮ';
  const classes = getRecommendationClasses(action);
  const currentPrice = parsePrice(price);

  return (
    <div className={`p-5 rounded-xl border ${classes.border} ${classes.bg} flex flex-col justify-between shadow-lg`}>
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-400 font-medium">Khuyến nghị cho</p>
        <h3 className="text-2xl font-extrabold text-gray-100 mt-0.5">{symbol}</h3>
        <p className={`text-3xl font-black ${classes.text} mt-1`}>{action.toUpperCase()}</p>
        <p className="font-semibold text-yellow-400 mt-2 text-base">{price}</p>

        {analysis?.targetPrices && (
          <div className="grid grid-cols-1 gap-2.5 w-full mt-4 border-t border-gray-700/50 pt-4">
            {[
              { label: 'Ngắn hạn', data: analysis.targetPrices.shortTerm, color: 'text-cyan-400' },
              { label: 'Trung hạn', data: analysis.targetPrices.midTerm, color: 'text-blue-400' },
              { label: 'Dài hạn', data: analysis.targetPrices.longTerm, color: 'text-purple-400' }
            ].map((item, idx) => {
              if (!item.data) return null;
              const targetVal = typeof item.data.value === 'number' ? item.data.value : parsePrice(item.data.value);
              return (
                <div key={idx} className="flex flex-col p-2.5 rounded-lg bg-gray-900/50 border border-gray-700/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{item.label}</span>
                    <div className="flex items-center">
                      <span className={`text-sm font-bold ${item.color}`}>
                        {targetVal ? `${targetVal.toLocaleString('vi-VN')} VND` : (item.data.label || 'N/A')}
                      </span>
                      {formatUpside(targetVal, currentPrice)}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 line-clamp-1 italic">{item.data.label}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {analysis?.recommendation?.details && (
        <details className="mt-4 text-sm group border-t border-gray-700/40 pt-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-gray-400 hover:text-cyan-400 flex items-center justify-between">
            <span>Chi tiết luận điểm</span>
            <ChevronDownIcon className="inline w-4 h-4 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <div className="mt-2 prose prose-invert prose-xs max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: analysis.recommendation.details }} />
        </details>
      )}
    </div>
  );
};

const ComparisonSection: React.FC<{ title: string; icon: React.ReactNode; content1: string; content2: string; defaultOpen?: boolean }> = ({ title, icon, content1, content2, defaultOpen = false }) => (
  <details className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden group" open={defaultOpen}>
    <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
      </div>
      <ChevronDownIcon className="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180" />
    </summary>
    <div className="p-4 border-t border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 border-r-0 md:border-r md:border-gray-700 md:pr-6" dangerouslySetInnerHTML={{ __html: content1 }} />
      <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: content2 }} />
    </div>
  </details>
);

const VerdictItem: React.FC<{ title: string; winner: string; ticker1: string; ticker2: string }> = ({ title, winner, ticker1, ticker2 }) => {
    const isWinner1 = (winner || '').toUpperCase() === ticker1.toUpperCase();
    const isWinner2 = (winner || '').toUpperCase() === ticker2.toUpperCase();

    return (
        <div className="text-center">
            <p className="text-sm text-gray-400 font-medium">{title}</p>
            <p className={`mt-1 text-2xl font-bold ${isWinner1 ? 'text-cyan-400' : isWinner2 ? 'text-purple-400' : 'text-yellow-400'}`}>
                {winner || 'N/A'}
            </p>
        </div>
    );
};

const HeadToHeadVerdict: React.FC<{ summary: StructuredComparisonSummary; ticker1: string; ticker2: string }> = ({ summary, ticker1, ticker2 }) => {
    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl shadow-lg">
            <div className="flex items-center justify-center gap-4 mb-6">
                <LightBulbIcon className="w-8 h-8 text-yellow-400" />
                <h3 className="text-2xl font-bold text-gray-100">Tổng kết Đối đầu</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6 border-b border-gray-700 pb-6">
                <VerdictItem title="Mạnh hơn về Cơ bản" winner={summary.fundamentalWinner} ticker1={ticker1} ticker2={ticker2} />
                <VerdictItem title="Mạnh hơn về Kỹ thuật" winner={summary.technicalWinner} ticker1={ticker1} ticker2={ticker2} />
                <VerdictItem title="Lựa chọn Tối ưu" winner={summary.overallWinner} ticker1={ticker1} ticker2={ticker2} />
            </div>

            <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: summary.summaryText }} />
        </div>
    );
};


export const ComparisonDisplay: React.FC<{ comparison: ComparisonResult }> = ({ comparison }) => {
  const { ticker1, ticker2, comparativeSummary, assumedDate, news, forumSentiment, groundingSources } = comparison;
  const reportTopRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      reportTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(timer);
  }, [comparison]);

  const handleExportPdf = async () => {
    if (!reportTopRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const sanitizedT1 = ticker1.symbol.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedT2 = ticker2.symbol.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedDate = (assumedDate || new Date().toLocaleDateString('vi-VN')).replace(/[\/\\]/g, '-');
      await exportElementToPdf(reportTopRef.current, {
        fileName: `So_Sanh_${sanitizedT1}_vs_${sanitizedT2}_${sanitizedDate}.pdf`,
        reportTitle: `SO SÁNH CỔ PHIẾU ${ticker1.symbol} VS ${ticker2.symbol}`,
      });
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('Đã có lỗi xảy ra khi xuất PDF. Vui lòng thử lại.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div ref={reportTopRef} className="mt-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <h2 className="text-3xl font-bold text-gray-100">
            So sánh Cổ phiếu: <span className="text-cyan-400">{ticker1.symbol}</span> vs <span className="text-purple-400">{ticker2.symbol}</span>
          </h2>
          <p className="text-gray-400 mt-1">Dữ liệu tính đến ngày {assumedDate}</p>
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
            title="Xuất báo cáo so sánh thành tệp PDF để xem ngoại tuyến"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TickerCard symbol={ticker1.symbol} price={ticker1.closingPrice} analysis={ticker1.analysis} />
        <TickerCard symbol={ticker2.symbol} price={ticker2.closingPrice} analysis={ticker2.analysis} />
      </div>
      
      <HeadToHeadVerdict summary={comparativeSummary} ticker1={ticker1.symbol} ticker2={ticker2.symbol} />

      {ticker1.stockSentiment && ticker2.stockSentiment && (
        <details className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden group" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
            <div className="flex items-center gap-3">
              <BeakerIcon className="w-6 h-6 text-yellow-400" />
              <h3 className="text-lg font-semibold text-gray-100">So sánh Tâm lý Cổ phiếu</h3>
            </div>
            <ChevronDownIcon className="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <div className="p-4 sm:p-6 border-t border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col items-center">
              <h4 className="text-md font-semibold text-cyan-400 mb-2">{ticker1.symbol}</h4>
              <SentimentGauge score={ticker1.stockSentiment.score} />
              <div className="mt-4 w-full prose prose-invert prose-sm max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: ticker1.stockSentiment.summary }} />
            </div>
            <div className="flex flex-col items-center">
              <h4 className="text-md font-semibold text-purple-400 mb-2">{ticker2.symbol}</h4>
              <SentimentGauge score={ticker2.stockSentiment.score} />
              <div className="mt-4 w-full prose prose-invert prose-sm max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: ticker2.stockSentiment.summary }} />
            </div>
          </div>
        </details>
      )}

      {forumSentiment && (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl shadow-lg">
            <div className="flex items-center gap-4">
                <ChatBubbleLeftEllipsisIcon className="w-8 h-8 text-teal-400" />
                <h3 className="text-xl font-bold text-gray-100">So sánh Thảo luận Cộng đồng</h3>
            </div>
            <div className="mt-4 prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: forumSentiment }} />
        </div>
      )}
      
      <div className="space-y-4">
        <ComparisonSection title="Phân tích Vĩ mô & Vi mô" icon={<GlobeAltIcon className="w-6 h-6 text-blue-400" />} content1={ticker1.analysis.macro} content2={ticker2.analysis.macro} defaultOpen />
        <ComparisonSection title="Phân tích Ngành" icon={<BuildingOfficeIcon className="w-6 h-6 text-purple-400" />} content1={ticker1.analysis.industry} content2={ticker2.analysis.industry} />
        <ComparisonSection title="Phân tích Cơ bản Doanh nghiệp" icon={<DocumentTextIcon className="w-6 h-6 text-orange-400" />} content1={ticker1.analysis.fundamental} content2={ticker2.analysis.fundamental} />
        <ComparisonSection title="Phân tích Kỹ thuật" icon={<ChartBarIcon className="w-6 h-6 text-green-400" />} content1={ticker1.analysis.technical} content2={ticker2.analysis.technical} />
      </div>

      {Array.isArray(news) && news.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6" data-pdf-ignore="true">
          <h3 className="text-xl font-bold text-gray-100 flex items-center gap-4 mb-4">
            <NewspaperIcon className="w-7 h-7 text-cyan-400" />
            Tin tức liên quan ({ticker1.symbol} & {ticker2.symbol}) (7 ngày gần nhất)
          </h3>
          <ul className="space-y-3">
            {news.slice(0, 7).map((item, index) => (
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
