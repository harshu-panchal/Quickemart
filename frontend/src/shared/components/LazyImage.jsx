import React, { useState } from 'react';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

const LazyImage = ({ src, alt = '', className = '', ...rest }) => {
  const [loaded, setLoaded] = useState(false);
  const resolvedSrc = applyCloudinaryTransform(src);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      {...rest}
    />
  );
};

export default LazyImage;

