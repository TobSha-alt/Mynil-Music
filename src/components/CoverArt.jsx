import React, { useEffect, useState } from 'react';
import { getCoverUrl } from '../utils/cover';

export default function CoverArt({
  item,
  src,
  videoId,
  title,
  artist,
  alt = '',
  className = '',
  loading = 'lazy',
}) {
  const resolvedUrl = getCoverUrl(item || { thumbnail: src, videoId, title, artist }, {
    ...(src !== undefined ? { thumbnail: src } : {}),
    ...(videoId !== undefined ? { videoId } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(artist !== undefined ? { artist } : {}),
  });

  const fallbackOnlyUrl = getCoverUrl({
    videoId: videoId ?? item?.videoId ?? '',
    title: title ?? item?.title ?? '',
    artist: artist ?? item?.artist ?? '',
  });

  const [imgSrc, setImgSrc] = useState(resolvedUrl);
  const [retriedFallback, setRetriedFallback] = useState(false);

  useEffect(() => {
    setImgSrc(resolvedUrl);
    setRetriedFallback(false);
  }, [resolvedUrl]);

  const handleError = () => {
    if (!retriedFallback && imgSrc !== fallbackOnlyUrl) {
      setRetriedFallback(true);
      setImgSrc(fallbackOnlyUrl);
    }
  };

  return (
    <img
      src={imgSrc}
      alt={alt || title || item?.title || 'Cover'}
      loading={loading}
      decoding="async"
      onError={handleError}
      className={className}
    />
  );
}
