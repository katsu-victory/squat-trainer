import { useState, useCallback, useEffect, useRef } from 'react'
import StickFigure from './components/StickFigure'
import CameraView from './components/CameraView'
import FeedbackPanel from './components/FeedbackPanel'
import MusicPlayer from './components/MusicPlayer'
import { useSquatAnalysis } from './hooks/useSquatAnalysis'
import { useVoiceFeedback } from './hooks/useVoiceFeedback'
import './App.css'

// 理想フォームを常にループアニメーションするフック
function useIdealAnimation() {
  const [idealPhase, setIdealPhase] = useState(0)
  const frameRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const loop = (ts) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = (ts - startRef.current) / 1000
      // 3秒周期でスタンディング↔スクワットを繰り返す
      const t = (Math.sin((elapsed * 2 * Math.PI) / 3 - Math.PI / 2) + 1) / 2
      setIdealPhase(t)
      frameRef.current = requestAnimationFrame(loop)
    }
    frameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  return idealPhase
}

export default function App() {
  const [cameraActive, setCameraActive] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [keypoints, setKeypoints] = useState(null)

  const { repCount, squatPhase, feedback, angles, resetReps } = useSquatAnalysis(keypoints)
  const idealPhase = useIdealAnimation()   // 常時ループ（ユーザーの動きとは独立）
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
              title="音声フィードバック切替"
            >
              {voiceEnabled ? '🔊 音声ON' : '🔇 音声OFF'}
            </button>
            <button
              className={`cam-toggle-btn ${cameraActive ? 'active' : ''}`}
              onClick={() => setCameraActive(v => !v)}
            >
              {cameraActive ? '📷 カメラOFF' : '📷 カメラON'}
            </button>
          </div>
        </div>
      </header>

      <main className="main-layout">

        {/* ① カメラ映像 ＋ 骨格オーバーレイ（あなたのフォーム） */}
        <section className="panel camera-panel">
          <div className="panel-header">
            <span className="panel-badge user">📹 あなたのフォーム</span>
          </div>
          <div className="panel-body">
            <CameraView onKeypoints={handleKeypoints} isActive={cameraActive} />
          </div>
        </section>

        {/* ② 理想の棒人間（常時ループアニメーション） */}
        <section className="panel figure-panel">
          <div className="panel-header">
            <span className="panel-badge model">✅ 理想フォーム（手本）</span>
            {cameraActive && squatPhase > 0.1 && (
              <span className="phase-live">
                あなた: {Math.round(squatPhase * 100)}%
              </span>
            )}
          </div>
          <div className="panel-body figure-body">
            {/* 理想の棒人間は常に独自アニメーション */}
            <StickFigure phase={idealPhase} />
            {!cameraActive && (
              <div className="phase-hint">
                カメラをONにして骨格解析を開始しよう
              </div>
            )}
          </div>
        </section>

        {/* ③ フィードバックパネル */}
        <section className="panel feedback-col">
          <div className="panel-header">
            <span className="panel-badge feedback">📊 フィードバック</span>
          </div>
          <div className="panel-body">
            <FeedbackPanel
              repCount={repCount}
              angles={angles}
              feedback={feedback}
              squatPhase={squatPhase}
              onReset={resetReps}
            />
            <div style={{ marginTop: '12px' }}>
              <MusicPlayer />
            </div>
          </div>
        </section>

      </main>

      <footer className="app-footer">
        <span className={`status-dot ${cameraActive ? 'active' : ''}`} />
        {cameraActive
          ? `AI解析中 — レップ: ${repCount}回 / ${voiceEnabled ? '音声ON' : '音声OFF'}`
          : 'カメラをONにして自分のスクワットフォームをチェックしよう'}
      </footer>
    </div>
  )
}
