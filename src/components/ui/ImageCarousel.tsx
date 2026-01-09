import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageCarouselProps {
  images: string[];
  className?: string;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showDots?: boolean;
  showArrows?: boolean;
  aspectRatio?: '16:9' | '4:3' | '1:1' | 'auto';
  objectFit?: 'cover' | 'contain';
}

export function ImageCarousel({
  images,
  className = '',
  autoPlay = false,
  autoPlayInterval = 5000,
  showDots = true,
  showArrows = true,
  aspectRatio = '16:9',
  objectFit = 'contain',
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Ensure images is an array
  const safeImages = Array.isArray(images) ? images.filter(img => img && typeof img === 'string') : [];

  useEffect(() => {
    if (!autoPlay || safeImages.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % safeImages.length);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, safeImages.length]);

  if (!safeImages || safeImages.length === 0) {
    return null;
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % safeImages.length);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const aspectRatioClasses = {
    '16:9': 'aspect-video',
    '4:3': 'aspect-4/3',
    '1:1': 'aspect-square',
    'auto': '',
  };

  return (
    <div className={`relative group w-full h-full ${className}`}>
      <div className={`relative overflow-hidden ${className.includes('absolute') ? '' : 'rounded-lg'} w-full h-full ${aspectRatio === 'auto' ? '' : aspectRatioClasses[aspectRatio]}`}>
        {safeImages.map((image, index) => (
          <img
            key={index}
            src={image}
            alt={`Slide ${index + 1}`}
            className={`absolute inset-0 w-full h-full ${objectFit === 'cover' ? 'object-cover' : 'object-contain'} transition-opacity duration-500 ${
              index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
            loading={index === 0 ? 'eager' : 'lazy'}
            onError={(e) => {
              // Hide broken images
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ))}

        {showArrows && safeImages.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full opacity-100 group-hover:opacity-100 transition-all z-20 shadow-lg hover:scale-110"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full opacity-100 group-hover:opacity-100 transition-all z-20 shadow-lg hover:scale-110"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Dots indicator - always visible */}
        {showDots && safeImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-100 transition-opacity z-20">
            <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg">
              <span className="text-white text-xs font-medium mr-2">
                {currentIndex + 1} / {safeImages.length}
              </span>
              <div className="flex gap-1.5">
                {safeImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      goToSlide(index);
                    }}
                    className={`rounded-full transition-all ${
                      index === currentIndex
                        ? 'w-2.5 h-2.5 bg-white'
                        : 'w-2 h-2 bg-white/50 hover:bg-white/75'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

