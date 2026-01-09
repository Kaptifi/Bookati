import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StarRating } from './StarRating';

export interface Testimonial {
  name?: string;
  name_ar?: string;
  role?: string;
  role_ar?: string;
  comment?: string;
  comment_ar?: string;
  rating?: number;
  image?: string;
}

interface TestimonialsCarouselProps {
  testimonials: Testimonial[];
  language: 'en' | 'ar';
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

export function TestimonialsCarousel({
  testimonials,
  language,
  autoPlay = false,
  autoPlayInterval = 5000,
}: TestimonialsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-play functionality
  useEffect(() => {
    if (!autoPlay || testimonials.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, testimonials.length]);

  if (!testimonials || testimonials.length === 0) {
    return null;
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const currentTestimonial = testimonials[currentIndex];
  const name = language === 'ar'
    ? (currentTestimonial.name_ar || currentTestimonial.name || '')
    : (currentTestimonial.name || currentTestimonial.name_ar || '');
  const role = language === 'ar'
    ? (currentTestimonial.role_ar || currentTestimonial.role || '')
    : (currentTestimonial.role || currentTestimonial.role_ar || '');
  const comment = language === 'ar'
    ? (currentTestimonial.comment_ar || currentTestimonial.comment || '')
    : (currentTestimonial.comment || currentTestimonial.comment_ar || '');

  return (
    <div className="relative">
      {/* Testimonial Card */}
      <div className="bg-white rounded-lg shadow-lg p-8 md:p-12 max-w-3xl mx-auto">
        {/* Quote Icon */}
        <div className="text-4xl md:text-5xl text-blue-600 mb-6 text-center">
          "
        </div>

        {/* Comment */}
        {comment && (
          <p className="text-lg md:text-xl text-gray-700 text-center mb-8 leading-relaxed">
            {comment}
          </p>
        )}

        {/* Rating */}
        {currentTestimonial.rating && (
          <div className="flex justify-center mb-6">
            <StarRating rating={currentTestimonial.rating} size="md" />
          </div>
        )}

        {/* Author Info */}
        <div className="flex flex-col items-center">
          {currentTestimonial.image && (
            <div className="w-16 h-16 rounded-full overflow-hidden mb-4 border-2 border-blue-600">
              <img
                src={currentTestimonial.image}
                alt={name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          {name && (
            <h4 className="font-semibold text-gray-900 text-lg mb-1">
              {name}
            </h4>
          )}
          {role && (
            <p className="text-sm text-gray-500">
              {role}
            </p>
          )}
        </div>
      </div>

      {/* Navigation Arrows */}
      {testimonials.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-12 bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-shadow text-gray-600 hover:text-blue-600 z-10"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-12 bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-shadow text-gray-600 hover:text-blue-600 z-10"
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {testimonials.length > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-blue-600 w-8'
                  : 'bg-gray-300 w-2 hover:bg-gray-400'
              }`}
              aria-label={`Go to testimonial ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}























