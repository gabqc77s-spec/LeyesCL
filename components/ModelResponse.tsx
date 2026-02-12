
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AiReference } from '../types.ts';
import { ExternalLinkIcon, BookmarkIcon } from './icons.tsx';

interface ModelResponseProps {
  content: string;
  references: AiReference[];
}

export const ModelResponse: React.FC<ModelResponseProps> = ({ content, references }) => {
  const [highlightedRef, setHighlightedRef] = useState<number | null>(null);
  const refElements = useRef<(HTMLLIElement | null)[]>([]);

  const handleHighlight = (refIndex: number) => {
    setHighlightedRef(refIndex);
    const element = refElements.current[refIndex - 1];
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  
  useEffect(() => {
    const handleClickOutside = () => setHighlightedRef(null);
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const parseAndRenderAnswer = useCallback((text: string) => {
    const parts = text.split(/(\(\d+(?:,\s*\d+)*\))/g);
    return parts.map((part, index) => {
      const match = part.match(/^\((\d+(?:,\s*\d+)*)\)$/);
      if (match) {
        const refNumbers = match[1].split(',').map(n => parseInt(n.trim(), 10));
        return (
          <span key={index} className="inline-flex items-center not-prose">
            {refNumbers.map((num) => (
              <span key={num} className="group relative mx-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); handleHighlight(num); }}
                  className="inline-flex items-center font-bold text-blue-600 bg-blue-100 rounded-full w-6 h-6 justify-center text-xs hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Ver referencia ${num}`}
                >
                  {num}
                </button>
              </span>
            ))}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  }, []);

  return (
    <div className="prose prose-sm max-w-none">
      {parseAndRenderAnswer(content)}

      <div className="mt-6 border-t pt-4">
        <h3 className="text-base font-bold text-gray-800 mb-2 flex items-center not-prose">
          <BookmarkIcon className="w-5 h-5 mr-2 text-gray-500" />
          Referencias Utilizadas
        </h3>
        <ul className="space-y-3 pl-0 list-none">
          {references.map((ref, index) => (
            <li
              key={ref.id}
              ref={el => { refElements.current[index] = el; }}
              className={`p-3 border rounded-lg transition-all duration-300 not-prose ${highlightedRef === index + 1 ? 'bg-blue-50 border-blue-300 shadow-md' : 'bg-white border-gray-200'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white font-bold text-xs">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{ref.title}</p>
                  <blockquote className="mt-1 pl-2 border-l-2 border-gray-300 text-xs text-gray-600 italic">
                    "{ref.fragment}"
                  </blockquote>
                  <div className="mt-2 flex items-center gap-x-3 text-xs text-gray-500">
                    <span><span className="font-semibold">Pub:</span> {ref.publicationDate}</span>
                    <a href={ref.link} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 hover:underline font-semibold">
                      Ver <ExternalLinkIcon className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
