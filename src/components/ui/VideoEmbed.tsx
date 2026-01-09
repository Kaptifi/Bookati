import React from 'react';

interface VideoEmbedProps {
  url: string;
  className?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1';
}

export function VideoEmbed({ url, className = '', aspectRatio = '16:9' }: VideoEmbedProps) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Check if it's a base64 data URL (uploaded video)
  const isBase64Video = url.startsWith('data:video/');

  // If it's a base64 video, render it directly
  if (isBase64Video) {
    const aspectRatioClasses = {
      '16:9': 'aspect-video',
      '4:3': 'aspect-4/3',
      '1:1': 'aspect-square',
    };

    // Check if className contains "w-full h-full" (for hero section background)
    const isFullScreen = className.includes('w-full h-full') || className.includes('inset-0');

    return (
      <div className={`relative ${isFullScreen ? 'w-full h-full' : aspectRatioClasses[aspectRatio]} ${className}`}>
        <video
          src={url}
          className={`absolute ${isFullScreen ? 'inset-0 w-full h-full' : 'inset-0 w-full h-full'} object-cover ${isFullScreen ? '' : 'rounded-lg'}`}
          controls={!isFullScreen}
          autoPlay={isFullScreen}
          loop={isFullScreen}
          muted={isFullScreen}
          playsInline
        />
      </div>
    );
  }

  const getEmbedUrl = (url: string): string | null => {
    // YouTube
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch) {
      const videoId = youtubeMatch[1];
      // Use youtube-nocookie.com to avoid ads and tracking
      // Add parameters to reduce ads and improve performance
      // rel=0: Don't show related videos from other channels
      // modestbranding=1: Reduce YouTube branding
      // playsinline=1: Play inline on mobile
      // origin: Set origin to prevent CORS issues
      // enablejsapi=0: Disable JavaScript API to reduce requests
      // iv_load_policy=3: Hide annotations
      // cc_load_policy=0: Disable captions
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(origin)}&enablejsapi=0&iv_load_policy=3&cc_load_policy=0`;
    }

    // Vimeo
    const vimeoRegex = /(?:vimeo\.com\/)(?:.*\/)?(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    return null;
  };

  const embedUrl = getEmbedUrl(url);

  if (!embedUrl) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`}>
        <p className="text-gray-500">Invalid video URL. Please provide a YouTube or Vimeo URL.</p>
      </div>
    );
  }

  const aspectRatioClasses = {
    '16:9': 'aspect-video',
    '4:3': 'aspect-4/3',
    '1:1': 'aspect-square',
  };

  return (
    <div className={`relative ${aspectRatioClasses[aspectRatio]} ${className}`}>
      <iframe
        src={embedUrl}
        className="absolute inset-0 w-full h-full rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Video embed"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ border: 'none' }}
      />
    </div>
  );
}

