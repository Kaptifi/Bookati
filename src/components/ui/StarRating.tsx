import React from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
  showReviewCount?: boolean;
  reviewCount?: number;
  className?: string;
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  showNumber = false,
  showReviewCount = false,
  reviewCount,
  className = '',
}: StarRatingProps) {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = maxRating - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star
            key={`full-${i}`}
            className={`${sizeClasses[size]} fill-pink-500 text-pink-500`}
          />
        ))}
        {hasHalfStar && (
          <div className="relative">
            <Star className={`${sizeClasses[size]} fill-gray-300 text-gray-300`} />
            <Star
              className={`${sizeClasses[size]} fill-pink-500 text-pink-500 absolute inset-0 overflow-hidden`}
              style={{ clipPath: 'inset(0 50% 0 0)' }}
            />
          </div>
        )}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star
            key={`empty-${i}`}
            className={`${sizeClasses[size]} fill-gray-300 text-gray-300`}
          />
        ))}
      </div>
      {showNumber && (
        <span className={`font-medium text-gray-700 ${textSizeClasses[size]}`}>
          {rating.toFixed(1)}
        </span>
      )}
      {showReviewCount && reviewCount !== undefined && reviewCount > 0 && (
        <span className={`text-gray-500 ${textSizeClasses[size]}`}>
          ({reviewCount.toLocaleString()})
        </span>
      )}
    </div>
  );
}

