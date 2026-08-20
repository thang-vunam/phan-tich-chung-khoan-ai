import React, { useState, useEffect } from 'react';

const steps = [
  { threshold: 0, label: 'Đang truy vấn dữ liệu từ Google Search...' },
  { threshold: 35, label: 'Đang trích xuất chỉ số tài chính & kỹ thuật...' },
  { threshold: 65, label: 'Đang phân tích tâm lý dòng tiền & ngành...' },
  { threshold: 85, label: 'Đang tổng hợp báo cáo & định giá mục tiêu...' },
];

export const LoadingSpinner: React.FC = () => {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    // Tăng tiến trình liên tục, mượt mà và tiệm cận mốc 98% theo thời gian thực (không bị khựng ở 94%)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) return 98;
        // Tốc độ tăng giảm dần theo khoảng cách đến 98%
        const delta = Math.max(0.3, (98 - prev) * 0.045);
        return Math.min(98, Math.round((prev + delta) * 10) / 10);
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  const currentStep = [...steps].reverse().find(s => progress >= s.threshold) || steps[0];

  return (
    <div className="mt-8 max-w-xl mx-auto p-4 bg-gray-800/80 backdrop-blur border border-gray-700/80 rounded-xl shadow-lg">
      <div className="flex items-center justify-between text-xs font-semibold text-gray-300 mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="text-cyan-300 transition-all duration-300">{currentStep.label}</span>
        </div>
        <span className="text-gray-400 font-mono font-bold">{Math.floor(progress)}%</span>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full bg-gray-950/80 h-2.5 rounded-full overflow-hidden p-0.5 border border-gray-700/50">
        <div 
          className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 rounded-full transition-all duration-150 ease-out shadow-[0_0_12px_rgba(6,182,212,0.6)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
