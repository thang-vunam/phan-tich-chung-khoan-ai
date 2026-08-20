import React, { useState, useEffect, useRef } from 'react';

interface TickerInputProps {
  onAnalyze: (ticker: string) => void;
  isLoading: boolean;
  currentValue?: string;
}

// Strict list of Market Indices
export const MARKET_INDICES = [
  'VN-INDEX', 'VN30', 'HNX-Index', 'UPCOM'
];

// Comprehensive list of Industries
export const INDUSTRIES = [
  'Ngân hàng', 'Bất động sản', 'Chứng khoán', 'Thép', 'Dầu khí', 
  'Bán lẻ', 'Công nghệ', 'Xây dựng', 'Thủy sản', 'Dệt may', 
  'Điện - Năng lượng', 'Hóa chất', 'Phân bón', 'Cảng biển - Vận tải',
  'Khu công nghiệp', 'Thực phẩm - Đồ uống', 'Y tế - Dược phẩm',
  'Bảo hiểm', 'Nông nghiệp', 'Hàng không - Du lịch', 'Vật liệu xây dựng', 'Khai khoáng'
];

// Helper to remove accents and special characters for search matching
export const normalizeSearchText = (str: string) => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]/g, '');
};

// Aliases mapping for common user queries
const INDUSTRY_ALIASES: Record<string, string> = {
  'yte': 'Y tế - Dược phẩm',
  'duoc': 'Y tế - Dược phẩm',
  'duocpham': 'Y tế - Dược phẩm',
  'nganhyte': 'Y tế - Dược phẩm',
  'nganhduoc': 'Y tế - Dược phẩm',
  'thuoc': 'Y tế - Dược phẩm',
  'nganhang': 'Ngân hàng',
  'bank': 'Ngân hàng',
  'banking': 'Ngân hàng',
  'batdongsan': 'Bất động sản',
  'bds': 'Bất động sản',
  'chungkhoan': 'Chứng khoán',
  'thep': 'Thép',
  'tonma': 'Thép',
  'daukhi': 'Dầu khí',
  'xangdau': 'Dầu khí',
  'banle': 'Bán lẻ',
  'congnghe': 'Công nghệ',
  'it': 'Công nghệ',
  'xaydung': 'Xây dựng',
  'dautucong': 'Xây dựng',
  'thuysan': 'Thủy sản',
  'detmay': 'Dệt may',
  'dien': 'Điện - Năng lượng',
  'nangluong': 'Điện - Năng lượng',
  'hoachat': 'Hóa chất',
  'phanbon': 'Phân bón',
  'cangbien': 'Cảng biển - Vận tải',
  'vantai': 'Cảng biển - Vận tải',
  'logistic': 'Cảng biển - Vận tải',
  'logistics': 'Cảng biển - Vận tải',
  'khucongnghiep': 'Khu công nghiệp',
  'kcn': 'Khu công nghiệp',
  'thucpham': 'Thực phẩm - Đồ uống',
  'douong': 'Thực phẩm - Đồ uống',
  'fnb': 'Thực phẩm - Đồ uống',
  'baohiem': 'Bảo hiểm',
  'nongnghiep': 'Nông nghiệp',
  'channuoi': 'Nông nghiệp',
  'hangkhong': 'Hàng không - Du lịch',
  'dulich': 'Hàng không - Du lịch',
  'vatlieuxaydung': 'Vật liệu xây dựng',
  'vlxd': 'Vật liệu xây dựng',
  'khaikhoang': 'Khai khoáng',
  'than': 'Khai khoáng',
};

export const findMatchingIndustry = (input: string): string | null => {
  const norm = normalizeSearchText(input);
  if (!norm) return null;

  if (INDUSTRY_ALIASES[norm]) {
    return INDUSTRY_ALIASES[norm];
  }

  for (const ind of INDUSTRIES) {
    const indNorm = normalizeSearchText(ind);
    if (indNorm === norm || indNorm.includes(norm) || norm.includes(indNorm)) {
      return ind;
    }
  }

  return null;
};

export const findMatchingIndex = (input: string): string | null => {
  const norm = normalizeSearchText(input);
  if (!norm) return null;

  if (norm === 'vnindex' || norm === 'vni' || norm === 'chisovnindex') return 'VN-INDEX';
  if (norm === 'vn30' || norm === 'vn30index' || norm === 'chisovn30') return 'VN30';
  if (norm === 'hnx' || norm === 'hnxindex' || norm === 'hnx30') return 'HNX-Index';
  if (norm === 'upcom' || norm === 'upcomindex') return 'UPCOM';
  if (norm === 'vnmid' || norm === 'vnsml' || norm === 'vndiamond' || norm === 'vnfinlead') {
    return input.toUpperCase();
  }
  return null;
};

// Common Tickers for suggestions (User can still type others)
const COMMON_TICKERS = [
  'HPG', 'VCB', 'VHM', 'VIC', 'VNM', 'GAS', 'BID', 'TCB', 
  'FPT', 'MWG', 'MSN', 'GVR', 'SAB', 'VRE', 'CTG', 'MBB', 
  'ACB', 'SSI', 'VND', 'NVL', 'PDR', 'DIG', 'CEO', 'DXG'
];

export const TickerInput: React.FC<TickerInputProps> = ({ onAnalyze, isLoading, currentValue }) => {
  const [inputValue, setInputValue] = useState(currentValue || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<{type: 'Index' | 'Industry' | 'Ticker', value: string}[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Đồng bộ giá trị input khi có sự kiện chọn mã từ ngoài (ví dụ click vào cổ phiếu nổi bật VGC)
  useEffect(() => {
    if (currentValue !== undefined) {
      setInputValue(currentValue);
    }
  }, [currentValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Filter logic with accent-insensitive matching
  useEffect(() => {
    if (!inputValue) {
        // When empty, show Market Indices and Top Industries first
        const indices = MARKET_INDICES.map(i => ({ type: 'Index' as const, value: i }));
        const industries = INDUSTRIES.map(i => ({ type: 'Industry' as const, value: i }));
        setSuggestions([...indices, ...industries]);
        return;
    }

    const normInput = normalizeSearchText(inputValue);
    
    // Filter Indices
    const filteredIndices = MARKET_INDICES.filter(item => 
        normalizeSearchText(item).includes(normInput)
    ).map(i => ({ type: 'Index' as const, value: i }));

    // Filter Industries
    const filteredIndustries = INDUSTRIES.filter(item => 
        normalizeSearchText(item).includes(normInput)
    ).map(i => ({ type: 'Industry' as const, value: i }));

    // Filter Tickers
    const filteredTickers = COMMON_TICKERS.filter(item => 
        normalizeSearchText(item).includes(normInput)
    ).map(t => ({ type: 'Ticker' as const, value: t }));

    setSuggestions([...filteredIndices, ...filteredIndustries, ...filteredTickers]);
  }, [inputValue]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onAnalyze(inputValue.trim());
      setShowDropdown(false);
    }
  };

  const handleSelect = (value: string) => {
      setInputValue(value);
      setShowDropdown(false);
      onAnalyze(value);
  };

  return (
    <div className="max-w-2xl mx-auto mb-8 relative" ref={wrapperRef}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 bg-gray-800 border border-gray-700 rounded-full shadow-lg relative z-10">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
              setInputValue(e.target.value);
              setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Nhập mã (FPT), chỉ số (VN-Index) hoặc Ngành (Thép)..."
          className="w-full bg-transparent text-gray-200 text-lg placeholder-gray-500 focus:outline-none px-4 py-2 rounded-l-full"
          disabled={isLoading}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Xử lý...
            </>
          ) : (
            'Phân tích'
          )}
        </button>
      </form>

      {/* Autocomplete Dropdown */}
      {showDropdown && !isLoading && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-h-80 overflow-y-auto z-50 divide-y divide-gray-700 scrollbar-thin scrollbar-thumb-gray-600">
              {suggestions.length > 0 ? (
                  suggestions.map((item, index) => (
                      <div 
                        key={index}
                        onClick={() => handleSelect(item.value)}
                        className="px-5 py-3 hover:bg-gray-700 cursor-pointer flex justify-between items-center group transition-colors"
                      >
                          <span className="text-gray-200 font-medium">{item.value}</span>
                          <span className={`text-xs px-2 py-1 rounded border font-semibold ${
                              item.type === 'Index'
                              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                              : item.type === 'Industry' 
                              ? 'border-purple-500 text-purple-400 bg-purple-500/10' 
                              : 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                          }`}>
                              {item.type === 'Index' ? 'Chỉ số' : item.type === 'Industry' ? 'Ngành' : 'Mã CP'}
                          </span>
                      </div>
                  ))
              ) : (
                  <div className="px-5 py-3 text-gray-500 text-center italic">
                      Nhấn Enter để tìm kiếm tự do...
                  </div>
              )}
          </div>
      )}
    </div>
  );
};
