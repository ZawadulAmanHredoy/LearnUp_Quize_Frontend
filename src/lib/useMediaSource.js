import { useEffect, useState } from 'react';
import { getPlayableUrl } from './mediaCache';
import { mediaSrc } from './config';

/**
 * Where to play a question's clip from: the copy downloaded into this
 * browser when there is one (no buffering), otherwise the server URL.
 * Returns { url, isLocal } or null while it is being looked up / when the
 * question has no media.
 */
export function useMediaSource(question) {
  const mediaId = question?.mediaId || null;
  const mediaUrl = question?.mediaUrl || null;
  const [source, setSource] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setSource(null);

    if (mediaId) {
      getPlayableUrl(mediaId).then((result) => {
        if (cancelled) {
          if (result.isLocal) URL.revokeObjectURL(result.url);
          return;
        }
        if (result.isLocal) objectUrl = result.url;
        setSource(result);
      });
    } else if (mediaUrl) {
      setSource({ url: mediaSrc({ mediaUrl }), isLocal: false });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, mediaUrl]);

  return source;
}

/**
 * True when the question has a clip to show (uploaded or external link)
 */
export function hasMedia(question) {
  return Boolean(question && question.mediaType && question.mediaType !== 'NONE' && (question.mediaId || question.mediaUrl));
}
