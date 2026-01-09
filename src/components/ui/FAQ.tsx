import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface FAQItem {
  question: string;
  question_ar?: string;
  answer: string;
  answer_ar?: string;
}

interface FAQProps {
  items: FAQItem[];
  language: 'en' | 'ar';
  allowMultipleOpen?: boolean;
}

export function FAQ({ items, language, allowMultipleOpen = false }: FAQProps) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setOpenIndexes((prev) => {
      const newSet = new Set(prev);
      
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        if (!allowMultipleOpen) {
          newSet.clear();
        }
        newSet.add(index);
      }
      
      return newSet;
    });
  };

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const isOpen = openIndexes.has(index);
        const question = language === 'ar' 
          ? (item.question_ar || item.question) 
          : (item.question || item.question_ar);
        const answer = language === 'ar' 
          ? (item.answer_ar || item.answer) 
          : (item.answer || item.answer_ar);

        return (
          <div
            key={index}
            className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md"
          >
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              aria-expanded={isOpen}
            >
              <span className="font-semibold text-gray-900 pr-4 flex-1">
                {question}
              </span>
              <div className="flex-shrink-0">
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </div>
            </button>
            
            {isOpen && (
              <div className="px-6 pb-4 pt-0">
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {answer}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}























