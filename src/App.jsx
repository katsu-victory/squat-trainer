import { useState, useCallback, useEffect, useRef } from 'react'
import StickFigure from './components/StickFigure'
import CameraView from './components/CameraView'
import FeedbackPanel from './components/FeedbackPanel'
import MusicPlayer from './components/MusicPlayer'
import { useSquatAnalysis } from './hooks/useSquatAnalysis'
import { useVoiceFeedback } from './hooks/useVoiceFeedback'
import './App.css'

function useAnimatedPhase(isAnimating, externalPhase) {
  const [animPhase, setAnimPhase] = useState(0)
  const frameRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    if (!isAnimating) {
      cancelAnimationFrame(frameRef.current)
      return
    }
    const loop = (ts) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = (ts - startRef.current) / 1000
      const t = (Math.sin((elapsed * 2 * Math.PI) / 3 - Math.PI / 2) + 1) / 2
      setAnimPhase(t)
      frameRef.current = requestAnimationFrame(loop)
    }
    frameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameRef.current)
  }, [isAnimating])

  return isAnimating ? animPhase : externalPhase
}

export default function App() {
  const [cameraActive, setCameraActive] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [keypoints, setKeypoints] = useState(null)

  const { repCount, squatPhase, feedback, angles, resetReps } = useSquatAnalysis(keypoints)
  const displayPhase = useAnimatedPhase(!cameraActive, squatPhase)
  useVoiceFeedback(feedback, voiceEnabled && cameraActive)

  const handleKeypoints = useCallback((kp) => setKeypoints(kp), [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🏋️</span>
            <div>
              <div className="logo-title">Squat Trainer</div>
              <div className="logo-sub">AI フォーム解析</div>
            </div>
          </div>
          <div className="header-actions">
            <button
              className={`cam-toggle-btn ${voiceEnabled ? 'active' : ''}`}
              onClick={() => setVoiceEnabled(v => !v)}
              title="音声フィードバック"
            >
              {voiceEnabled ? '🔊 音声 ON' : '🔇 音声 OFF'}
            </button>
            <button
              className={`cam-toggle-btn ${cameraActive ? 'active' : ''}`}
              onClick={() => setCameraActive(v => !v)}
            >
              {cameraActive ? '📷 カメラ OFF' : '📷 カメラ ON'}
            </button>
          </div>
        </div>
      </header>

      <main className="main-layout">
        <section className="panel camera-panel">
          <div className="panel-header">
            <span className="panel-badge user">あなたのフォーム</span>
          </div>
          <div className="panel-body">
            <CameraView onKeypoints={handleKeypoints} isActive={cameraActive} />
          </div>
        </section>

        <section className="panel figure-panel">
          <div className="panel-header">
            <span className="panel-badge model">正しいフォーム</span>
          </div>
          <div className="panel-body figure-body">
            <StickFigure phase={displayPhase} />
            <div className="phase-hint">
              {cameraActive ? 'あなたの動きを反映中' : 'デモアニメーション（カメラONで連動）'}
            </div>
          </div>
        </section>

        <section className="panel feedback-col">
          <div className="panel-header">
            <span className="panel-badge feedback">フィードバック</span>
          </div>
          <div className="panel-body">
            <FeedbackPanel
              repCount={repCount}
              angles={angles}
              feedback={feedback}
              squatPhase={squatPhase}
              onReset={resetReps}
            />
            {/* BGM プレイヤー */}
            <div style={{ marginTop: '12px' }}>
              <MusicPlayer />
            </div>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span className={`status-dot ${cameraActive ? 'active' : ''}`} />
        {cameraActive
          ? 'カメラ稼働中 — TensorFlow.js MoveNet でリアルタイム解析'
          : 'カメラをONにして自分のスクワットフォームをチェックしよう'}
      </footer>
    </div>
  )
}
