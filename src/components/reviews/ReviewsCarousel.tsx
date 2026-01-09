import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StarRating } from '../ui/StarRating';
import { format } from 'date-fns';
import { ReviewImageStory } from './ReviewImageStory';

interface Review {
  id: string;
  customer_name?: string;
  customer_name_ar?: string;
  rating: number;
  comment: string;
  comment_ar?: string;
  image_url?: string;
  created_at: string;
  booking_id?: string;
  service_id?: string;
  service_name?: string;
  service_name_ar?: string;
}

interface ReviewsCarouselProps {
  reviews: Review[];
  language: 'en' | 'ar';
  itemsPerPage?: number;
  onEdit?: (review: Review) => void;
  onDelete?: (reviewId: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  currentUserId?: string;
}

export function ReviewsCarousel({
  reviews,
  language,
  itemsPerPage = 2,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
  currentUserId,
}: ReviewsCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [storyModal, setStoryModal] = useState<{
    isOpen: boolean;
    images: string[];
    review: Review | null;
  }>({ isOpen: false, images: [], review: null });

  // Check scroll position - RTL compatible
  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      console.log('🔍 [Scroll Check] Container not found');
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    // Get computed direction
    const computedStyle = window.getComputedStyle(container);
    const isRTL = computedStyle.direction === 'rtl' || document.documentElement.dir === 'rtl';
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;
    const hasScroll = maxScroll > 10; // 10px tolerance

    // In RTL, scrollLeft can be negative or work differently
    // We normalize it to always work the same way
    const normalizedScrollLeft = isRTL && scrollLeft < 0 
      ? Math.abs(scrollLeft) 
      : scrollLeft;

    console.log('🔍 [Scroll Check]', {
      isRTL,
      scrollLeft: Math.round(scrollLeft),
      normalizedScrollLeft: Math.round(normalizedScrollLeft),
      scrollWidth: Math.round(scrollWidth),
      clientWidth: Math.round(clientWidth),
      maxScroll: Math.round(maxScroll),
      hasScroll,
    });

    if (!hasScroll) {
      console.log('🔍 [Scroll Check] No scroll needed');
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    // For RTL, we need to check differently
    const canLeft = normalizedScrollLeft > 10;
    const canRight = normalizedScrollLeft < maxScroll - 10;
    
    console.log('🔍 [Scroll Check] Buttons state:', {
      canScrollLeft: canLeft,
      canScrollRight: canRight,
    });

    setCanScrollLeft(canLeft);
    setCanScrollRight(canRight);
  }, []);

  // Initialize scroll detection
  useEffect(() => {
    console.log('🚀 [Component] ReviewsCarousel mounted/updated');
    console.log('🚀 [Component] Reviews count:', reviews.length);
    
    const container = scrollContainerRef.current;
    if (!container) {
      console.warn('⚠️ [Component] Container not found on mount');
      return;
    }

    console.log('🚀 [Component] Container found:', {
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
      scrollLeft: container.scrollLeft,
    });

    // Multiple checks to ensure layout is ready
    const timeouts: NodeJS.Timeout[] = [];
    [0, 100, 300, 500, 1000].forEach(delay => {
      timeouts.push(setTimeout(() => {
        console.log(`⏰ [Component] Checking scroll after ${delay}ms`);
        updateScrollButtons();
      }, delay));
    });

    // Event listeners
    const handleScroll = () => {
      console.log('📜 [Scroll Event] User scrolled');
      updateScrollButtons();
    };
    
    const handleResize = () => {
      console.log('📐 [Resize Event] Window resized');
      updateScrollButtons();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    // MutationObserver to detect content changes
    const observer = new MutationObserver(() => {
      console.log('🔄 [Mutation] Content changed');
      setTimeout(updateScrollButtons, 100);
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      console.log('🧹 [Component] Cleaning up');
      timeouts.forEach(clearTimeout);
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [reviews, updateScrollButtons]);

  // Scroll functions - RTL compatible
  const handleScrollLeft = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    console.log('⬅️ [Button Click] Scroll Left button clicked');
    console.log('⬅️ [Button Click] canScrollLeft:', canScrollLeft);
    
    const container = scrollContainerRef.current;
    if (!container) {
      console.error('❌ [Button Click] Container not found!');
      return;
    }

    const computedStyle = window.getComputedStyle(container);
    const isRTL = computedStyle.direction === 'rtl' || document.documentElement.dir === 'rtl';
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    // Calculate card width based on itemsPerPage and container width
    const gap = 24; // Gap between cards
    const cardWidth = itemsPerPage > 0 ? (clientWidth - (gap * (itemsPerPage - 1))) / itemsPerPage : 450;
    const scrollAmount = (cardWidth + gap) * itemsPerPage; // Scroll by itemsPerPage cards
    
    // Normalize scrollLeft for RTL
    const normalizedScrollLeft = isRTL && scrollLeft < 0 ? Math.abs(scrollLeft) : scrollLeft;
    const newScroll = Math.max(0, normalizedScrollLeft - scrollAmount);
    
    console.log('⬅️ [Button Click] Before scroll:', {
      isRTL,
      scrollLeft: Math.round(scrollLeft),
      normalizedScrollLeft: Math.round(normalizedScrollLeft),
      scrollWidth: Math.round(scrollWidth),
      clientWidth: Math.round(clientWidth),
      scrollAmount: Math.round(scrollAmount),
      newScroll: Math.round(newScroll),
    });

    // Force LTR direction for scrolling to work correctly
    const originalDirection = container.style.direction;
    container.style.direction = 'ltr';
    
    // Use scrollTo
    container.scrollTo({
      left: newScroll,
      behavior: 'smooth',
    });

    // Force scroll if needed
    setTimeout(() => {
      if (Math.abs(container.scrollLeft - newScroll) > 5) {
        console.log('⚠️ [Button Click] scrollTo didn\'t work, forcing scroll');
        container.scrollLeft = newScroll;
      }
    }, 50);

    // Restore direction after scroll
    setTimeout(() => {
      if (originalDirection) {
        container.style.direction = originalDirection;
      }
      const finalScroll = container.scrollLeft;
      console.log('⬅️ [Button Click] After scroll:', {
        newScrollLeft: Math.round(finalScroll),
        expectedScroll: Math.round(newScroll),
        scrollChanged: Math.abs(finalScroll - normalizedScrollLeft) > 1,
      });
      updateScrollButtons();
    }, 700);
  }, [canScrollLeft, updateScrollButtons, itemsPerPage]);

  const handleScrollRight = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    console.log('➡️ [Button Click] Scroll Right button clicked');
    console.log('➡️ [Button Click] canScrollRight:', canScrollRight);
    
    const container = scrollContainerRef.current;
    if (!container) {
      console.error('❌ [Button Click] Container not found!');
      return;
    }

    const computedStyle = window.getComputedStyle(container);
    const isRTL = computedStyle.direction === 'rtl' || document.documentElement.dir === 'rtl';
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    // Calculate card width based on itemsPerPage and container width
    const gap = 24; // Gap between cards
    const cardWidth = itemsPerPage > 0 ? (clientWidth - (gap * (itemsPerPage - 1))) / itemsPerPage : 450;
    const scrollAmount = (cardWidth + gap) * itemsPerPage; // Scroll by itemsPerPage cards
    const maxScroll = scrollWidth - clientWidth;
    
    // Normalize scrollLeft for RTL
    const normalizedScrollLeft = isRTL && scrollLeft < 0 ? Math.abs(scrollLeft) : scrollLeft;
    const newScroll = Math.min(maxScroll, normalizedScrollLeft + scrollAmount);
    
    console.log('➡️ [Button Click] Before scroll:', {
      isRTL,
      scrollLeft: Math.round(scrollLeft),
      normalizedScrollLeft: Math.round(normalizedScrollLeft),
      scrollWidth: Math.round(scrollWidth),
      clientWidth: Math.round(clientWidth),
      maxScroll: Math.round(maxScroll),
      scrollAmount: Math.round(scrollAmount),
      newScroll: Math.round(newScroll),
    });

    // Force LTR direction for scrolling to work correctly
    const originalDirection = container.style.direction;
    container.style.direction = 'ltr';
    
    // Use scrollTo
    container.scrollTo({
      left: newScroll,
      behavior: 'smooth',
    });

    // Force scroll if needed
    setTimeout(() => {
      if (Math.abs(container.scrollLeft - newScroll) > 5) {
        console.log('⚠️ [Button Click] scrollTo didn\'t work, forcing scroll');
        container.scrollLeft = newScroll;
      }
    }, 50);

    // Restore direction after scroll
    setTimeout(() => {
      if (originalDirection) {
        container.style.direction = originalDirection;
      }
      const finalScroll = container.scrollLeft;
      console.log('➡️ [Button Click] After scroll:', {
        newScrollLeft: Math.round(finalScroll),
        expectedScroll: Math.round(newScroll),
        scrollChanged: Math.abs(finalScroll - normalizedScrollLeft) > 1,
      });
      updateScrollButtons();
    }, 700);
  }, [canScrollRight, updateScrollButtons, itemsPerPage]);

  if (!reviews || reviews.length === 0) {
    return null;
  }

  // Sort reviews by date (newest first)
  const currentReviews = [...reviews].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  const parseImages = (imageUrl: string | null | undefined): string[] => {
    if (!imageUrl) return [];
    
    try {
      if (imageUrl.startsWith('data:')) {
        return [imageUrl];
      }
      const parsed = JSON.parse(imageUrl);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [imageUrl];
    } catch {
      if (imageUrl.includes(',') && !imageUrl.startsWith('data:')) {
        return imageUrl.split(',').map(img => img.trim());
      }
      return [imageUrl];
    }
  };

  return (
    <div className="relative w-full group">
      {/* Modern Navigation Buttons - Always visible, positioned inside container */}
      {reviews.length > 1 && (
        <>
          <button
            onClick={(e) => {
              console.log('🖱️ [Button] Left button onClick triggered');
              console.log('🖱️ [Button] Event:', e);
              console.log('🖱️ [Button] canScrollLeft state:', canScrollLeft);
              handleScrollLeft(e);
            }}
            onMouseDown={(e) => {
              console.log('🖱️ [Button] Left button onMouseDown');
              e.preventDefault();
            }}
            onMouseUp={(e) => {
              console.log('🖱️ [Button] Left button onMouseUp');
            }}
            disabled={!canScrollLeft}
            className={`
              absolute left-2 top-1/2 -translate-y-1/2 z-30
              w-10 h-10 md:w-12 md:h-12
              bg-white rounded-full shadow-lg
              flex items-center justify-center
              transition-all duration-200
              border-2 border-gray-200
              ${canScrollLeft 
                ? 'opacity-100 hover:scale-110 hover:shadow-xl hover:border-blue-500 text-blue-600 cursor-pointer' 
                : 'opacity-30 cursor-not-allowed text-gray-400'
              }
            `}
            aria-label="Previous reviews"
            type="button"
            style={{ pointerEvents: 'auto' }}
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <button
            onClick={(e) => {
              console.log('🖱️ [Button] Right button onClick triggered');
              console.log('🖱️ [Button] Event:', e);
              console.log('🖱️ [Button] canScrollRight state:', canScrollRight);
              handleScrollRight(e);
            }}
            onMouseDown={(e) => {
              console.log('🖱️ [Button] Right button onMouseDown');
              e.preventDefault();
            }}
            onMouseUp={(e) => {
              console.log('🖱️ [Button] Right button onMouseUp');
            }}
            disabled={!canScrollRight}
            className={`
              absolute right-2 top-1/2 -translate-y-1/2 z-30
              w-10 h-10 md:w-12 md:h-12
              bg-white rounded-full shadow-lg
              flex items-center justify-center
              transition-all duration-200
              border-2 border-gray-200
              ${canScrollRight 
                ? 'opacity-100 hover:scale-110 hover:shadow-xl hover:border-blue-500 text-blue-600 cursor-pointer' 
                : 'opacity-30 cursor-not-allowed text-gray-400'
              }
            `}
            aria-label="Next reviews"
            type="button"
            style={{ pointerEvents: 'auto' }}
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </>
      )}

      {/* Modern Scrollable Container with Snap - Force LTR for scrolling */}
      <div 
        ref={scrollContainerRef}
        className="flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        style={{ 
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          paddingLeft: '0',
          paddingRight: '0',
          overflowX: 'auto',
          overflowY: 'hidden',
          willChange: 'scroll-position',
          direction: 'ltr', // Force LTR for scrolling to work correctly in RTL pages
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
        onScroll={(e) => {
          console.log('📜 [Scroll Event] onScroll triggered, scrollLeft:', Math.round(e.currentTarget.scrollLeft));
          updateScrollButtons();
        }}
      >
        {currentReviews.map((review, index) => {
          const customerName = language === 'ar'
            ? (review.customer_name_ar || review.customer_name || 'User')
            : (review.customer_name || review.customer_name_ar || 'User');
          const reviewText = language === 'ar'
            ? (review.comment_ar || review.comment || '')
            : (review.comment || review.comment_ar || '');
          const serviceName = language === 'ar'
            ? (review.service_name_ar || review.service_name || '')
            : (review.service_name || review.service_name_ar || '');
          
          const images = parseImages(review.image_url);
          const displayText = reviewText.length > 200 
            ? reviewText.substring(0, 200) + '...' 
            : reviewText;

          return (
            <div
              key={review.id}
              className="
                reviews-carousel-card
                flex-shrink-0
                bg-white rounded-xl p-4 md:p-5
                border border-gray-100 shadow-md hover:shadow-xl
                transition-all duration-300
                snap-start
                flex flex-col
              "
              style={{ 
                scrollSnapAlign: 'start',
                width: itemsPerPage > 0 
                  ? `calc((100% - ${(itemsPerPage - 1) * 24}px) / ${itemsPerPage})`
                  : '350px',
                minWidth: itemsPerPage > 0 
                  ? `calc((100% - ${(itemsPerPage - 1) * 24}px) / ${itemsPerPage})`
                  : '350px',
                maxWidth: itemsPerPage > 0 
                  ? `calc((100% - ${(itemsPerPage - 1) * 24}px) / ${itemsPerPage})`
                  : '350px',
              }}
            >
              {/* Header with Avatar and Rating */}
              <div className="flex items-start gap-3 mb-3">
                <div className="
                  w-10 h-10 md:w-12 md:h-12
                  rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600
                  flex items-center justify-center flex-shrink-0
                  shadow-md ring-2 ring-blue-100
                ">
                  <span className="text-white font-bold text-sm md:text-base">
                    {customerName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-gray-900 text-sm md:text-base">
                      {customerName.split(' ')[0]}
                    </h4>
                    {(review as any).customer_country && (
                      <span className="text-xs text-gray-500 uppercase font-medium px-2 py-1 bg-gray-100 rounded-full">
                        {(review as any).customer_country}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <StarRating rating={review.rating} size="sm" />
                    <span className="text-xs font-semibold text-gray-700">
                      {review.rating}.0
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>
                      {review.created_at ? format(new Date(review.created_at), language === 'ar' ? 'MMM yyyy' : 'MMM yyyy') : ''}
                    </span>
                    {review.booking_id && (
                      <>
                        <span>•</span>
                        <span className="text-green-600 font-semibold flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          {language === 'ar' ? 'حجز مؤكد' : 'Verified'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Review Text */}
              <p className="text-xs md:text-sm text-gray-700 mb-3 leading-relaxed flex-grow">
                {displayText}
              </p>

              {/* Service Name Badge */}
              {serviceName && (
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                    {serviceName}
                  </span>
                </div>
              )}

              {/* Images Grid */}
              {images.length > 0 && (
                <div className="flex gap-1.5 mb-3">
                  {images.slice(0, 3).map((imageUrl, idx) => (
                    <div
                      key={idx}
                      className="
                        relative w-16 h-16 md:w-18 md:h-18
                        rounded-lg overflow-hidden
                        border-2 border-gray-200
                        bg-gray-100 cursor-pointer
                        hover:opacity-90 hover:border-blue-400
                        transition-all duration-200
                        flex-shrink-0
                        group/image
                      "
                      onClick={() => {
                        setStoryModal({
                          isOpen: true,
                          images: images,
                          review: review,
                        });
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={`Review ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors" />
                    </div>
                  ))}
                  {images.length > 3 && (
                    <div className="
                      w-16 h-16 md:w-18 md:h-18
                      rounded-lg border-2 border-gray-200
                      bg-gradient-to-br from-gray-100 to-gray-200
                      flex items-center justify-center
                      text-xs font-bold text-gray-600
                      cursor-pointer hover:border-blue-400
                      transition-all duration-200
                    ">
                      +{images.length - 3}
                    </div>
                  )}
                </div>
              )}

              {/* Edit/Delete Actions */}
              {(canEdit || canDelete) && (
                <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
                  {canEdit && onEdit && (
                    <button
                      onClick={() => onEdit(review)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {language === 'ar' ? 'تعديل' : 'Edit'}
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      onClick={() => onDelete(review.id)}
                      className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {language === 'ar' ? 'حذف' : 'Delete'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Review Image Story Modal */}
      {storyModal.isOpen && storyModal.review && (
        <ReviewImageStory
          isOpen={storyModal.isOpen}
          onClose={() => setStoryModal({ isOpen: false, images: [], review: null })}
          images={storyModal.images}
          review={storyModal.review}
          language={language}
          autoPlayInterval={5000}
        />
      )}
    </div>
  );
}
