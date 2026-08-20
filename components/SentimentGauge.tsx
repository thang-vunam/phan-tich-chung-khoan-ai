import React from 'react';

interface SentimentGaugeProps {
  score: number; // A value from 0 to 100
  size?: number; // The width of the component
}

// Defines the labels and text colors for different score ranges.
const getSentimentDetails = (score: number) => {
    if (score <= 20) return { label: 'Rất bi quan', color: 'text-red-500' };
    if (score <= 40) return { label: 'Bi quan', color: 'text-red-400' };
    if (score <= 60) return { label: 'Trung lập', color: 'text-yellow-400' };
    if (score <= 80) return { label: 'Lạc quan', color: 'text-green-400' };
    return { label: 'Rất lạc quan', color: 'text-green-500' };
};

export const SentimentGauge: React.FC<SentimentGaugeProps> = ({ score, size = 200 }) => {
    const clampedScore = Math.max(0, Math.min(100, score));
    const sentiment = getSentimentDetails(clampedScore);
    
    // Correctly maps score (0-100) to rotation angle (-90 to 90 degrees) for a vertical needle.
    const rotation = (clampedScore / 100) * 180 - 90;

    const radius = size * 0.4;
    const center = size / 2;
    const strokeWidth = size * 0.1;

    // Helper function to describe an SVG arc path.
    const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
        const start = {
            x: x + radius * Math.cos(startAngle * Math.PI / 180),
            y: y + radius * Math.sin(startAngle * Math.PI / 180)
        };
        const end = {
            x: x + radius * Math.cos(endAngle * Math.PI / 180),
            y: y + radius * Math.sin(endAngle * Math.PI / 180)
        };
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
    };
    
    // Correct angles for color segments: Red (0-40), Yellow (41-60), Green (61-100).
    const redEndAngle = 180 + (40 / 100) * 180;      // Starts at 180 deg, covers 40% of the arc.
    const yellowEndAngle = redEndAngle + (20 / 100) * 180; // Covers the next 20%.
    const greenEndAngle = 360;                       // Covers the final 40%.

    return (
        <div className="flex flex-col items-center justify-center w-full max-w-[250px] mx-auto" style={{ width: size, height: size / 2 + 30 }}>
            <svg width={size} height={size / 2} viewBox={`0 0 ${size} ${size / 2}`} className="overflow-visible">
                
                {/* 1. Background color arcs */}
                <path d={describeArc(center, center, radius, 180, redEndAngle)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} />
                <path d={describeArc(center, center, radius, redEndAngle, yellowEndAngle)} fill="none" stroke="#facc15" strokeWidth={strokeWidth} />
                <path d={describeArc(center, center, radius, yellowEndAngle, greenEndAngle)} fill="none" stroke="#4ade80" strokeWidth={strokeWidth} />

                {/* 2. Needle pointer */}
                <g transform={`rotate(${rotation} ${center} ${center})`}>
                    <polygon points={`${center - 4},${center} ${center + 4},${center} ${center},${center - radius - 8}`} fill="#e5e7eb" />
                </g>

                {/* 3. Needle pivot */}
                <circle cx={center} cy={center} r={size * 0.05} fill="#e5e7eb" stroke="#374151" strokeWidth="2" />
                <circle cx={center} cy={center} r={size * 0.02} fill="#374151" />
                
            </svg>
            
            <div className={`mt-2 text-lg font-semibold ${sentiment.color}`}>
                {sentiment.label}
            </div>
        </div>
    );
};
