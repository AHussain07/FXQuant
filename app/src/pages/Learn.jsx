import React from 'react';
import Nav from '../components/layout/Nav';
import { confluenceVideos, strategyVideos } from '../data/learnData';
import { useYouTubeData } from '../hooks/useYouTubeData';
import '../styles/learn.css';

function VideoCard({ video, onPlay }) {
  return (
    <div className="video-card" onClick={() => onPlay(video.id)}>
      <div className="thumbnail-container">
        <img 
          src={video.thumbnail}
          alt={video.title} 
          className="video-thumbnail"
        />
        <div className="play-overlay">
          <div className="play-icon">▶</div>
        </div>
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        {video.author && <p className="video-author">{video.author}</p>}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="video-card loading-skeleton">
      <div className="thumbnail-container skeleton-shimmer"></div>
      <div className="video-info">
        <div className="skeleton-line skeleton-shimmer"></div>
        <div className="skeleton-line skeleton-shimmer" style={{ width: '60%' }}></div>
      </div>
    </div>
  );
}

export default function Learn() {
  const { videos: confluenceData, loading: loadingConfluence } = useYouTubeData(confluenceVideos);
  const { videos: strategyData, loading: loadingStrategy } = useYouTubeData(strategyVideos);

  const handleVideoClick = (videoId) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="learn-page">
      <Nav />
      
      <div className="learn-container">

        <section className="video-section">
          <h2 className="section-title">Trading Confluences</h2>
          <div className="video-grid">
            {loadingConfluence ? (
              <>
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
              </>
            ) : confluenceData.length > 0 ? (
              confluenceData.map(video => (
                <VideoCard key={video.id} video={video} onPlay={handleVideoClick} />
              ))
            ) : (
              <p className="no-videos">No videos available yet.</p>
            )}
          </div>
        </section>

        <section className="video-section">
          <h2 className="section-title">Trading Strategies</h2>
          <div className="video-grid">
            {loadingStrategy ? (
              <>
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
              </>
            ) : strategyData.length > 0 ? (
              strategyData.map(video => (
                <VideoCard key={video.id} video={video} onPlay={handleVideoClick} />
              ))
            ) : (
              <p className="no-videos">No videos available yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}