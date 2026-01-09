import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AnimatedRatingProps {
  rating: number;
  reviewCount: number;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
}

export function AnimatedRating({
  rating,
  reviewCount,
  primaryColor = '#FF6B9D',
  secondaryColor = '#4A90E2',
  className = '',
}: AnimatedRatingProps) {
  const { i18n } = useTranslation();
  const [animatedRating, setAnimatedRating] = useState(0);
  const [animatedCount, setAnimatedCount] = useState(0);
  const [starsVisible, setStarsVisible] = useState(false);

  useEffect(() => {
    // Animate rating number
    const ratingDuration = 1500;
    const ratingSteps = 30;
    const ratingIncrement = rating / ratingSteps;
    let currentStep = 0;

    const ratingInterval = setInterval(() => {
      currentStep++;
      if (currentStep <= ratingSteps) {
        setAnimatedRating(ratingIncrement * currentStep);
      } else {
        setAnimatedRating(rating);
        clearInterval(ratingInterval);
      }
    }, ratingDuration / ratingSteps);

    // Animate review count
    const countDuration = 2000;
    const countSteps = 40;
    const countIncrement = reviewCount / countSteps;
    let countStep = 0;

    const countInterval = setInterval(() => {
      countStep++;
      if (countStep <= countSteps) {
        setAnimatedCount(Math.floor(countIncrement * countStep));
      } else {
        setAnimatedCount(reviewCount);
        clearInterval(countInterval);
      }
    }, countDuration / countSteps);

    // Animate stars appearing
    setTimeout(() => {
      setStarsVisible(true);
    }, 300);

    return () => {
      clearInterval(ratingInterval);
      clearInterval(countInterval);
    };
  }, [rating, reviewCount]);

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Animated Stars */}
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const isFull = i < fullStars;
          const isHalf = i === fullStars && hasHalfStar;
          const isEmpty = !isFull && !isHalf;

          return (
            <Star
              key={i}
              className={`w-4 h-4 transition-all duration-500 ${
                starsVisible
                  ? isFull
                    ? 'fill-pink-500 text-pink-500 scale-100'
                    : isHalf
                    ? 'fill-pink-500/50 text-pink-500 scale-100'
                    : 'fill-gray-300 text-gray-300 scale-100'
                  : 'scale-0 opacity-0'
              }`}
              style={{
                transitionDelay: `${i * 100}ms`,
                ...(starsVisible && isFull ? {
                  animationName: 'starPulse',
                  animationDuration: '1s',
                  animationTimingFunction: 'ease-in-out',
                  animationIterationCount: 'infinite',
                  animationDelay: `${i * 150}ms`,
                } : {}),
              }}
            />
          );
        })}
      </div>

      {/* Animated Rating Number */}
      <div
        className="flex items-baseline gap-1"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        <span className="text-lg font-bold tabular-nums">
          {animatedRating.toFixed(1)}
        </span>
      </div>

      {/* Animated Review Count */}
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-gray-600 tabular-nums">
          {animatedCount.toLocaleString()}
        </span>
        <span className="text-xs text-gray-500">
          {i18n.language === 'ar' 
            ? reviewCount === 1 ? 'مراجعة' : 'مراجعات'
            : reviewCount === 1 ? 'review' : 'reviews'}
        </span>
      </div>

      <style>{`
        @keyframes starPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}

