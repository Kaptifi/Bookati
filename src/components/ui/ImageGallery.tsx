import React, { useState } from 'react';
import { X, ZoomIn } from 'lucide-react';

interface ImageGalleryProps {
  images: string[];
  className?: string;
  thumbnailSize?: 'sm' | 'md' | 'lg';
  showLightbox?: boolean;
}

export function ImageGallery({
  images,
  className = '',
  thumbnailSize = 'md',
  showLightbox = true,
}: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Ensure images is an array and filter out invalid values
  const safeImages = Array.isArray(images) ? images.filter(img => img && typeof img === 'string') : [];

  if (!safeImages || safeImages.length === 0) {
    return null;
  }

  const thumbnailClasses = {
    sm: 'h-16',
    md: 'h-24',
    lg: 'h-32',
  };

  const openLightbox = (image: string, index: number) => {
    if (showLightbox) {
      setSelectedImage(image);
      setLightboxIndex(index);
    }
  };

  const closeLightbox = () => {
    setSelectedImage(null);
  };

  const nextImage = () => {
    const nextIndex = (lightboxIndex + 1) % safeImages.length;
    setLightboxIndex(nextIndex);
    setSelectedImage(safeImages[nextIndex]);
  };

  const previousImage = () => {
    const prevIndex = (lightboxIndex - 1 + safeImages.length) % safeImages.length;
    setLightboxIndex(prevIndex);
    setSelectedImage(safeImages[prevIndex]);
  };

  return (
    <>
      <div className={className}>
        {/* Main image */}
        <div className="mb-3">
          <div className="relative group cursor-pointer" onClick={() => openLightbox(safeImages[0], 0)}>
            <img
              src={safeImages[0]}
              alt="Main"
              className="w-full h-64 object-cover rounded-lg"
              loading="eager"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {showLightbox && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </div>

        {/* Thumbnails */}
        {safeImages.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {safeImages.slice(1, 5).map((image, index) => (
              <button
                key={index + 1}
                onClick={() => openLightbox(image, index + 1)}
                className={`relative ${thumbnailClasses[thumbnailSize]} rounded overflow-hidden group`}
              >
                <img
                  src={image}
                  alt={`Thumbnail ${index + 2}`}
                  className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                  loading="lazy"
                />
                {safeImages.length > 5 && index === 3 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-medium">
                    +{safeImages.length - 5}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedImage && showLightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            aria-label="Close lightbox"
          >
            <X className="w-8 h-8" />
          </button>

          <div className="relative max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedImage}
              alt="Lightbox"
              className="max-w-full max-h-[90vh] object-contain"
            />

            {safeImages.length > 1 && (
              <>
                <button
                  onClick={previousImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-3 rounded-full"
                  aria-label="Previous image"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-3 rounded-full"
                  aria-label="Next image"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
              {lightboxIndex + 1} / {safeImages.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

