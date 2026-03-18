import { useState, useRef, useEffect } from 'react'

// public/music/ に置いた曲リスト（増えたらここに追加）
const PLAYLIST = [
  { title: 'Body Attack風', file: '/music/Body Attack風.mp3' },
]

export default function MusicPlayer() {
  const [trackIdx, setTrackIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.6)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef(null)

  const track = PLAYLIST[trackIdx]

  // 音量同期
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // 曲切替
  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.load()
    if (isPlaying) audioRef.current.play().catch(() => {})
  }, [trackIdx])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
    setIsPlaying(v => !v)
  }

  const handlePrev = () => setTrackIdx(i => (i - 1 + PLAYLIST.length) % PLAYLIST.length)
  const handleNext = () => setTrackIdx(i => (i + 1) % PLAYLIST.length)

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0)
  }
  const handleLoadedMetadata = () => {
    setDuration(audioRef.current?.duration || 0)
  }
  const handleEnded = () => {
    handleNext()
  }

  const handleSeek = (e) => {
    const t = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="music-player">
      <audio
        ref={audioRef}
        src={track.file}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <div className="mp-header">
        <span className="mp-icon">🎵</span>
        <span className="mp-title">{track.title}</span>
      </div>

      {/* シークバー */}
      <div className="mp-seek">
        <span className="mp-time">{fmt(currentTime)}</span>
        <input
          type="range"
          className="mp-range"
          min={0}
          max={duration || 0}
          step={0.5}
          value={currentTime}
          onChange={handleSeek}
        />
        <span className="mp-time">{fmt(duration)}</span>
      </div>

      {/* コントロール */}
      <div className="mp-controls">
        <button className="mp-btn" onClick={handlePrev} title="前の曲">⏮</button>
        <button className="mp-btn mp-play" onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶️'}
        </button>
        <button className="mp-btn" onClick={handleNext} title="次の曲">⏭</button>

        {/* 音量 */}
        <span className="mp-vol-icon">🔈</span>
        <input
          type="range"
          className="mp-vol"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={e => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  )
}
