import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Star, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import heic2any from 'heic2any';

interface ReviewFormProps {
  bookingId: string;
  serviceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewForm({ 
  bookingId, 
  serviceId, 
  onClose, 
  onSuccess,
}: ReviewFormProps) {
  const { t, i18n } = useTranslation();
  const { userProfile } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Auto-fill name from logged-in user (non-editable)
  const userName = userProfile?.full_name || userProfile?.email || '';

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxImages = 10; // Maximum 10 images per review
    const maxSizePerImage = 200 * 1024 * 1024; // 200MB per image

    // Check total number of images
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
          const processedFile = await convertHeicToJpeg(file);
          const reader = new FileReader();
          reader.onloadend = () => {
            const newPreviews = [...imagePreviews, reader.result as string];
            setImagePreviews(newPreviews);
          };
          reader.readAsDataURL(processedFile);
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

  // Compress image using Canvas API
  const compressImage = async (file: File): Promise<{ base64: string; filename: string }> => {
    // Convert HEIC to JPEG first if needed
    const processedFile = await convertHeicToJpeg(file);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions (max 800x800)
          const maxDimension = 800;
          if (width > height) {
            if (width > maxDimension) {
              height = (height * maxDimension) / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = (width * maxDimension) / height;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ base64: compressedBase64, filename: processedFile.name });
        };
        img.onerror = (error) => {
          console.error('Image load error:', error);
          reject(new Error('Failed to load image. Please ensure it is a valid image file.'));
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(processedFile);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (rating === 0) {
      setError(t('testimonials.ratingRequired') || 'Please select a rating');
      return;
    }

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
        throw new Error('You must be logged in to submit a review');
      }

      // Get tenant_id from service
      const serviceResponse = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: 'SELECT tenant_id FROM services WHERE id = $1',
          params: [serviceId],
        }),
      });

      if (!serviceResponse.ok) {
        throw new Error('Failed to fetch service information');
      }

      const serviceData = await serviceResponse.json();
      const tenantId = serviceData.rows?.[0]?.tenant_id;

      if (!tenantId) {
        throw new Error('Service not found');
      }

      const imagesBase64: { base64: string, filename: string }[] = [];
      if (images.length > 0) {
        const imagePromises = images.map(image => compressImage(image));
        const processedImages = await Promise.all(imagePromises);
        imagesBase64.push(...processedImages);
      }

      const response = await fetch(`${API_URL}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          service_id: serviceId,
          tenant_id: tenantId,
          booking_id: bookingId,
          rating: rating,
          comment: trimmedReview,
          comment_ar: i18n.language === 'ar' ? trimmedReview : undefined,
          images: imagesBase64.length > 0 ? imagesBase64 : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit review');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('testimonials.writeReview') || 'Write a Review'}
      size="lg"
    >
      {success ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star className="w-8 h-8 text-green-600 fill-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {t('testimonials.reviewSubmitted') || 'Review Submitted!'}
          </h3>
          <p className="text-gray-600">
            {t('testimonials.reviewSubmittedMessage') || 'Thank you for your feedback. Your review has been submitted successfully.'}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* User Name (Auto-filled, non-editable) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.name') || 'Name'}
            </label>
            <input
              type="text"
              value={userName}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
            />
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.rating') || 'Rating'} <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-sm text-gray-600">
                  {rating}/5
                </span>
              )}
            </div>
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.review') || 'Review'} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('testimonials.reviewPlaceholder') || 'Share your experience...'}
              required
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('testimonials.images') || 'Images'} ({t('testimonials.optional') || 'Optional'})
            </label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.ico,.heic,.heif"
              multiple
              onChange={handleImageChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {imagePreviews.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              type="submit"
              disabled={loading || rating === 0 || !review.trim()}
            >
              {loading
                ? (t('common.submitting') || 'Submitting...')
                : (t('testimonials.submit') || 'Submit Review')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}



