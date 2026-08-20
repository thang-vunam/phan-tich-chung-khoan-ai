import React from 'react';
import type { GroundingSource } from '../types';
import { LinkIcon } from './IconComponents';

interface SourceLinksProps {
  sources?: GroundingSource[];
}

export const SourceLinks: React.FC<SourceLinksProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  const getCleanDomain = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('google.com') && (parsed.pathname.includes('redirect') || parsed.pathname.includes('url'))) {
        const target = parsed.searchParams.get('url') || parsed.searchParams.get('q');
        if (target) {
          return new URL(target).hostname.replace(/^www\./, '');
        }
      }
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const getValidClickUrl = (url: string, title?: string) => {
    if (!url || url.includes('vertexaisearch.cloud.google.com') || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return `https://www.google.com/search?q=${encodeURIComponent(title || 'tin tức thị trường chứng khoán')}`;
    }
    return url;
  };

  // Lọc lấy tối đa 3-4 nguồn uy tín, loại bỏ trùng domain
  const uniqueSources: GroundingSource[] = [];
  const seenDomains = new Set<string>();

  for (const s of sources) {
    const domain = getCleanDomain(s.url);
    if (!seenDomains.has(domain)) {
      seenDomains.add(domain);
      uniqueSources.push(s);
    }
    if (uniqueSources.length >= 4) break;
  }

  const displaySources = uniqueSources.length > 0 ? uniqueSources : sources.slice(0, 4);

  return (
    <div className="mt-8 pt-6 border-t border-gray-700/50">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Nguồn trích dẫn chính ({displaySources.length} nguồn tiêu biểu)
          </h4>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {displaySources.map((source, index) => {
          const domain = getCleanDomain(source.url);
          const displayTitle = source.title && source.title.trim() ? source.title : domain;
          const href = getValidClickUrl(source.url, displayTitle);
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 bg-gray-800/40 border border-gray-700/60 rounded-lg hover:bg-gray-700/40 hover:border-cyan-500/50 transition-all group shadow-sm"
            >
              <div className="flex-shrink-0 w-5 h-5 rounded bg-gray-700 flex items-center justify-center text-cyan-400 text-[10px] font-bold">
                {index + 1}
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-xs font-medium text-gray-200 group-hover:text-cyan-300 truncate">
                  {displayTitle}
                </p>
                <p className="text-[10px] text-gray-500 truncate">{domain}</p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
