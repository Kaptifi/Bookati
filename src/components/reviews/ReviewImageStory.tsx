import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { StarRating } from '../ui/StarRating';
import { format } from 'date-fns';

interface ReviewImageStoryProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  review: {
    customer_name?: string;
    customer_name_ar?: string;
    rating: number;
    comment?: string;
    comment_ar?: string;
    created_at: string;
    booking_id?: string;
  };
  language: 'en' | 'ar';
  autoPlayInterval?: number; // milliseconds between auto-switching images
}

export function ReviewImageStory({
  isOpen,
  onClose,
  images,
  review,
  language,
  autoPlayInterval = 5000, // 5 seconds default
}: ReviewImageStoryProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Reset to first image when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentImageIndex(0);
      setIsPaused(false);
    }
  }, [isOpen]);

  // Auto-play for multiple images
  useEffect(() => {
    if (!isOpen || images.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [isOpen, images.length, isPaused, autoPlayInterval]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const goToNext = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
    setIsPaused(true); // Pause auto-play when user manually navigates
    setTimeout(() => setIsPaused(false), 3000); // Resume after 3 seconds
  };

  const goToPrevious = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 3000);
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentImageIndex];
  const customerName = language === 'ar' 
    ? (review.customer_name_ar || review.customer_name || 'مستخدم')
    : (review.customer_name || review.customer_name_ar || 'User');
  const reviewText = language === 'ar'
    ? (review.comment_ar || review.comment || '')
    : (review.comment || review.comment_ar || '');

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors p-2"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Image container */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main image */}
        <img
          src={currentImage}
          alt={`Review image ${currentImageIndex + 1}`}
          className="max-w-full max-h-full object-contain"
          onError={(e) => {
            console.error('Failed to load story image:', currentImage);
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* Navigation arrows (only if multiple images) */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-colors z-10"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-colors z-10"
              aria-label="Next image"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* Image indicators (dots) */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentImageIndex(idx);
                    setIsPaused(true);
                    setTimeout(() => setIsPaused(false), 3000);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentImageIndex
                      ? 'bg-white w-8'
                      : 'bg-white/50 w-1.5'
                  }`}
                  aria-label={`Go to image ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Review overlay (bottom) */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-6 pt-12">
          <div className="max-w-2xl mx-auto">
            {/* User info */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">
                  {customerName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-white text-sm truncate">
                    {customerName}
                  </h4>
                  <span className="text-white/70 text-xs whitespace-nowrap">
                    {review.created_at ? format(new Date(review.created_at), language === 'ar' ? 'MMM yyyy' : 'MMM yyyy') : ''}
                  </span>
                  {review.booking_id && (
                    <span className="text-green-400 text-xs font-medium whitespace-nowrap">
                      • {language === 'ar' ? 'حجز مؤكد' : 'Verified booking'}
                    </span>
                  )}
                </div>
                {/* Star rating */}
                <div className="flex items-center gap-1">
                  <StarRating rating={review.rating} size="sm" />
                  <span className="text-white/80 text-xs ml-1">
                    {review.rating}/5
                  </span>
                </div>
              </div>
            </div>

            {/* Review text */}
            {reviewText && (
              <p className="text-white text-sm leading-relaxed line-clamp-3">
                {reviewText}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

