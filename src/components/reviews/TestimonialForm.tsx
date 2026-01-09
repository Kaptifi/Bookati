import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import heic2any from 'heic2any';

interface TestimonialFormProps {
  serviceId: string;
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
  reviewId?: string; // For editing existing review
  initialRating?: number;
  initialComment?: string;
  initialCommentAr?: string;
  initialImages?: string[]; // Array of image URLs
}

export function TestimonialForm({ 
  serviceId, 
  tenantId, 
  onClose, 
  onSuccess,
  reviewId,
  initialRating = 0,
  initialComment = '',
  initialCommentAr = '',
  initialImages = []
}: TestimonialFormProps) {
  const { t, i18n } = useTranslation();
  const { userProfile } = useAuth();
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState(initialComment);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>(initialImages);
  const [existingImages, setExistingImages] = useState<string[]>(initialImages); // Keep track of existing images
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isEditing = !!reviewId;

  // Auto-fill name from logged-in user (non-editable)
  const userName = userProfile?.full_name || userProfile?.email || '';

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxImages = 10; // Maximum 10 images per review
    const maxSizePerImage = 200 * 1024 * 1024; // 200MB per image

    // Check total number of images (existing + new)
    if (images.length + files.length > maxImages) {
      setError(t('testimonials.tooManyImages') || `Maximum ${maxImages} images allowed. You can add ${maxImages - images.length} more.`);
      return;
    }

    const validFiles: File[] = [];
    const previews: string[] = [];

    // Process each file
    Array.from(files).forEach((file) => {
      // Validate image size
      if (file.size > maxSizePerImage) {
        setError(t('testimonials.imageTooLarge') || 'One or more images exceed 200MB limit');
        return;
      }
      
      // Validate image type and extension
      const validImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic', '.heif'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!file.type.startsWith('image/') && !validImageExtensions.includes(fileExtension)) {
        setError(t('testimonials.invalidImageType') || 'Please select valid image files only (JPG, PNG, GIF, WEBP, SVG, BMP, ICO, HEIC, HEIF)');
        return;
      }

      validFiles.push(file);
      
      // Create preview (convert HEIC first if needed)
      const createPreview = async (file: File) => {
        try {
          const fileExtension = file.name.split('.').pop()?.toLowerCase();
          if (fileExtension === 'heic' || fileExtension === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
            const convertedBlob = await heic2any({
              blob: file,
              toType: 'image/jpeg',
              quality: 0.9,
            });
            const convertedFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            const processedFile = new File([convertedFile], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            const reader = new FileReader();
            reader.onloadend = () => {
              const newPreviews = [...imagePreviews, reader.result as string];
              setImagePreviews(newPreviews);
            };
            reader.readAsDataURL(processedFile);
          } else {
            const reader = new FileReader();
            reader.onloadend = () => {
              const newPreviews = [...imagePreviews, reader.result as string];
              setImagePreviews(newPreviews);
            };
            reader.readAsDataURL(file);
          }
        } catch (error) {
          console.error('Error creating preview:', error);
          // Fallback: try to read original file
          const reader = new FileReader();
          reader.onloadend = () => {
            const newPreviews = [...imagePreviews, reader.result as string];
            setImagePreviews(newPreviews);
          };
          reader.readAsDataURL(file);
        }
      };
      createPreview(file);
    });

    if (validFiles.length > 0) {
      setImages([...images, ...validFiles]);
      setError('');
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    setImages(newImages);
    setImagePreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation: Rating is required
    if (rating === 0) {
      setError(t('testimonials.ratingRequired') || 'Please select a rating');
      return;
    }

    // Validation: Review is required and cannot be empty
    const trimmedReview = review.trim();
    if (!trimmedReview) {
      setError(t('testimonials.reviewRequired') || 'Please write a review');
      return;
    }

    setLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const token = localStorage.getItem('auth_token');

      if (!token) {
        throw new Error('You must be logged in to submit a testimonial');
      }

      // Convert images to base64 if provided (with compression)
      const imagesBase64: Array<{ base64: string; filename: string }> = [];
      
      if (images.length > 0) {
        // Helper function to convert HEIC to JPEG
        const convertHeicToJpeg = async (file: File): Promise<File> => {
          try {
            const fileExtension = file.name.split('.').pop()?.toLowerCase();
            if (fileExtension === 'heic' || fileExtension === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
              const convertedBlob = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.9,
              });
              const convertedFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
              return new File([convertedFile], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            }
            return file;
          } catch (error) {
            console.error('Error converting HEIC:', error);
            throw new Error('Failed to convert HEIC file. Please try converting it to JPEG first.');
          }
        };

        // Process all images in parallel
        const imagePromises = images.map(async (image) => {
          // Convert HEIC to JPEG first if needed
          const processedFile = await convertHeicToJpeg(image);
          
          return new Promise<{ base64: string; filename: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                // Create canvas to resize and compress image
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                  reject(new Error('Could not get canvas context'));
                  return;
                }

                // Calculate new dimensions (max 800x800, maintain aspect ratio)
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                  if (width > MAX_WIDTH) {
                    height = (height * MAX_WIDTH) / width;
                    width = MAX_WIDTH;
                  }
                } else {
                  if (height > MAX_HEIGHT) {
                    width = (width * MAX_HEIGHT) / height;
                    height = MAX_HEIGHT;
                  }
                }

                // Set canvas dimensions
                canvas.width = width;
                canvas.height = height;

                // Draw and compress image
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 with compression (quality: 0.8 = 80%)
                const base64Data = canvas.toDataURL('image/jpeg', 0.8);
                
                // Remove data:image/...;base64, prefix
                const base64Only = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
                
                console.log(`Image ${processedFile.name}: Original ${processedFile.size} bytes, Compressed ${base64Only.length} characters`);
                
                resolve({ base64: base64Only, filename: processedFile.name });
              };
              img.onerror = () => reject(new Error(`Failed to load image: ${processedFile.name}`));
              img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(processedFile);
          });
        });

        const processedImages = await Promise.all(imagePromises);
        imagesBase64.push(...processedImages);
      }

      // For editing, combine existing images (that weren't removed) with new images
      let finalImages = imagesBase64;
      if (isEditing) {
        // If user removed all existing images and didn't add new ones, send null to clear images
        if (existingImages.length === 0 && imagesBase64.length === 0) {
          finalImages = null;
        } else if (imagesBase64.length > 0) {
          // User added new images, send them (existing images that weren't removed are kept in DB)
          finalImages = imagesBase64;
        } else {
          // User didn't add new images but may have removed some existing ones
          // If all existing images were removed, send null, otherwise don't send images field
          if (existingImages.length === 0) {
            finalImages = null;
          } else {
            // Keep existing images - don't send images array to preserve them
            finalImages = undefined;
          }
        }
      }

      const requestBody: any = isEditing
        ? {
            rating: rating,
            comment: trimmedReview,
            comment_ar: i18n.language === 'ar' ? trimmedReview : undefined,
            images: finalImages !== undefined ? (finalImages === null ? null : finalImages) : undefined, // Send null to clear, array to update, or undefined to keep
          }
        : {
            service_id: serviceId,
            tenant_id: tenantId,
            rating: rating,
            comment: trimmedReview,
            images: finalImages.length > 0 ? finalImages : null,
          };

      console.log('Sending review request:', {
        isEditing,
        service_id: isEditing ? undefined : serviceId,
        tenant_id: isEditing ? undefined : tenantId,
        reviewId: isEditing ? reviewId : undefined,
        rating,
        commentLength: trimmedReview.length,
        imageCount: imagesBase64.length,
        totalImageSize: imagesBase64.reduce((sum, img) => sum + img.base64.length, 0),
        requestBody
      });

      const url = isEditing 
        ? `${API_URL}/reviews/${reviewId}`
        : `${API_URL}/reviews`;
      
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to submit testimonial';
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
          console.error('Review submission error:', data);
        } catch (e) {
          console.error('Failed to parse error response:', e);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Show success message
      setSuccess(true);
      
      // Call onSuccess after a short delay
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit testimonial');
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('testimonials.writeReview') || 'Write a Review'}
    >
      {success ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t('testimonials.successTitle') || 'Thank you!'}
          </h3>
          <p className="text-gray-600">
            {t('testimonials.successMessage') || 'Your review has been submitted successfully.'}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Name field - Auto-filled and non-editable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testimonials.name') || 'Name'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={userName}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('testimonials.nameAutoFilled') || 'Your name is automatically filled from your account'}
            </p>
          </div>

          {/* Rating field - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.rating') || 'Rating'} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-110"
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating === 0 && (
              <p className="mt-1 text-xs text-red-500">
                {t('testimonials.ratingRequired') || 'Please select a rating'}
              </p>
            )}
          </div>

          {/* Review field - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.review') || 'Review'} <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder={t('testimonials.reviewPlaceholder') || 'Share your experience...'}
              required
            />
            {!review.trim() && (
              <p className="mt-1 text-xs text-red-500">
                {t('testimonials.reviewRequired') || 'Please write a review'}
              </p>
            )}
          </div>

          {/* Images field - Optional, Multiple */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.images') || 'Images'} <span className="text-gray-500 text-xs">({t('testimonials.optional') || 'Optional'})</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.ico,.heic,.heif"
              multiple
              onChange={handleImageChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {(imagePreviews.length > 0 || existingImages.length > 0) && (
              <div className="mt-3">
                <div className="grid grid-cols-3 gap-2">
                  {/* Existing images (when editing) */}
                  {existingImages.map((preview, idx) => (
                    <div key={`existing-${idx}`} className="relative group">
                      <img
                        src={preview}
                        alt={`Existing ${idx + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newExisting = existingImages.filter((_, i) => i !== idx);
                          setExistingImages(newExisting);
                        }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {/* New images */}
                  {imagePreviews.map((preview, idx) => (
                    <div key={`new-${idx}`} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${idx + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {existingImages.length + images.length} {(existingImages.length + images.length) === 1 ? 'image' : 'images'} {isEditing ? 'total' : 'selected'}
                </p>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {t('testimonials.imagesHint') || 'Maximum 10 images, 5MB each. Supported formats: JPG, PNG, GIF'}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading || rating === 0 || !review.trim()}
            >
              {t('testimonials.submit') || 'Submit Review'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={onClose}
              disabled={loading}
            >
              {t('common.cancel') || 'Cancel'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

