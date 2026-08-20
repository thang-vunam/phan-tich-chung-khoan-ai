
import type { Chat } from '@google/genai';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface MarketSentiment {
  score: number; // 0-100
  summary: string;
  vnIndexTrend?: string;
  foreignInvestors?: string;
  liquidity?: string;
}

export interface TargetPriceInfo {
  value: number;
  label: string;
}

export interface TargetPrices {
  shortTerm: TargetPriceInfo;
  midTerm: TargetPriceInfo;
  longTerm: TargetPriceInfo;
}

export interface NewsItem {
  title: string;
  url: string;
  publisher?: string;
  time?: string;
}

export interface AnalysisResult {
  assumedDate: string;
  closingPrice: string;
  marketSentiment: MarketSentiment;
  stockSentiment: MarketSentiment;
  macro: string;
  industry: string;
  fundamental: string;
  technical: string;
  forumSentiment: string;
  recommendation: {
    action: 'MUA' | 'BÁN' | 'NẮM GIỮ' | 'N/A';
    details: string;
  };
  targetPrices?: TargetPrices;
  news: NewsItem[];
  groundingSources?: GroundingSource[];
}

export interface AnalysisError {
    title: string;
    message: string;
}

export interface TickerAnalysis {
  macro: string;
  industry: string;
  fundamental: string;
  technical: string;
  recommendation: {
    action: 'MUA' | 'BÁN' | 'NẮM GIỮ' | 'N/A';
    details: string;
  };
  targetPrices?: TargetPrices;
}

export interface StructuredComparisonSummary {
  overallWinner: string;
  fundamentalWinner: string;
  technicalWinner: string;
  summaryText: string;
}

export interface ComparisonResult {
  assumedDate: string;
  ticker1: {
    symbol: string;
    closingPrice: string;
    analysis: TickerAnalysis;
    stockSentiment: MarketSentiment;
  };
  ticker2: {
    symbol: string;
    closingPrice: string;
    analysis: TickerAnalysis;
    stockSentiment: MarketSentiment;
  };
  comparativeSummary: StructuredComparisonSummary;
  forumSentiment: string;
  news: NewsItem[];
  groundingSources?: GroundingSource[];
}

export interface IndustryStock {
  symbol: string;
  companyName: string;
  price: string;
  highlights: string;
  recommendation: 'MUA' | 'THEO DÕI'; 
}

export interface IndustryAnalysisResult {
  industryName: string;
  assumedDate: string;
  marketSentiment: MarketSentiment;
  overview: string;
  opportunities: string;
  challenges: string;
  topStocks: IndustryStock[];
  news: NewsItem[];
  groundingSources?: GroundingSource[];
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  addedAt: number;
  lastKnownPrice?: string;
  note?: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'above' | 'below';
  isActive: boolean;
  createdAt: number;
}
