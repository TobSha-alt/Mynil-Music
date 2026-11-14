import React, { useEffect, useState } from 'react';

export default function ArtistAvatar({ name, src, className = '' }) {
  const avatarApiUrl = `/api/avatar?name=${encodeURIComponent(name || '')}${
    src ? `&fallback=${encodeURIComponent(src)}` : ''
  }`;

  const [imgSrc, setImgSrc] = useState(src || avatarApiUrl);
  const [triedProxy, setTriedProxy] = useState(!src);

  useEffect(() => {
    setImgSrc(src || avatarApiUrl);
    setTriedProxy(!src);
  }, [src, name, avatarApiUrl]);

  const handleError = () => {
    if (!triedProxy) {
      setTriedProxy(true);
      setImgSrc(avatarApiUrl);
    }
  };

  return (
    <img
      src={imgSrc}
      alt={name || 'Artist'}
      loading="lazy"
      onError={handleError}
      className={className}
    />
  );
}
