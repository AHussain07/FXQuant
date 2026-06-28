import { useState, useEffect } from 'react';

export function useYouTubeData(videoIds) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideoData = async () => {
      try {
        const videoPromises = videoIds.map(async (id) => {
          const response = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
          );
          const data = await response.json();
          
          return {
            id,
            title: data.title,
            thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
            author: data.author_name
          };
        });

        const videoData = await Promise.all(videoPromises);
        setVideos(videoData);
      } catch (error) {
        console.error('Error fetching video data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (videoIds && videoIds.length > 0) {
      fetchVideoData();
    }
  }, [videoIds]);

  return { videos, loading };
}