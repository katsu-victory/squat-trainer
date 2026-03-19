import { useState, useCallback, useEffect, useRef } from 'react'
import StickFigure3D from './components/StickFigure3D'
import CameraView  from './components/CameraView'
import MusicPlayer from './components/MusicPlayer'
import { useSquatAnalysis }  from './hooks/useSquatAnalysis'
import { useVoiceFeedback }  from './hooks/useVoiceFeedback'
import './App.css'

// 理想フォームを常にループアニメーション
function useIdealAnimation() {
  const [phase, setPhase] = useState(0)
  const rafRef   = useRef(null)
  const startRef = useRef(null)
  useEffect(() => {
    const loop = (ts) => {
      if (!startRef.current) startRef.current = ts
      const t = (Math.sin(((ts - startRef.current) / 1000) * (2 * Math.PI / 3) - Math.PI / 2) + 1) / 2
      setPhase(t)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])
  return phase
}

// 角度カードのステータス（範囲に応じて色付け）
function angleStatus(name, value) {
  if (value == null) return ''
  if (name === 'knee')  return value >= 70 && value <= 110 ? 'good' : 'warn'
  if (name === 'hip')   return value >= 60 && value <= 110 ? 'good' : 'warn'
  if (name === 'back')  return value <= 50               ? 'good' : 'warn'
  return ''
}

export default function App() {
  const [cameraActive, setCameraActive] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [keypoints,    setKeypoints]    = useState(null)

  const { repCount, squatPhase, feedback, angles, resetReps } =
    useSquatAnalysis(keypoints)
  const idealPhase = useIdealAnimation()
  useVoiceFeedback(feedback, voiceEnabled && cameraActive)

  const handleKeypoints = useCallback((kp) => setKeypoints(kp), [])

  // HUD フィードバックテキスト（先頭1件）
  const topFb = feedback[0] ?? null
  const fbClass = topFb ? topFb.type : 'info'
  const fbText  = topFb
    ? topFb.text
    : cameraActive
      ? 'スクワット開始！膝を曲げて'
      : 'カメラをONにして解析スタート'

  // 深度バーの色
  const depthColor = squatPhase > 0.85
    ? '#22c55e' : squatPhase > 0.5
    ? '#f59e0b' : '#60a5fa'

  return (
    <div className="app">

      {/* ── 仮想空間背景 ── */}
      <div className="vr-bg" aria-hidden="true">
        <div className="vr-grid" />
        <div className="vr-glow" />
        <div className="vr-scan" />
      </div>

      {/* ── ヘッダー ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🏋️</span>
            <span className="logo-title">SQUAT TRAINER</span>
            <span className="logo-sub">AI フォーム解析</span>
          </div>
          <div className="header-actions">
            <button
              className={`hdr-btn ${voiceEnabled ? 'on' : ''}`}
              onClick={() => setVoiceEnabled(v => !v)}
            >
              {voiceEnabled ? '🔊 音声ON' : '🔇 音声OFF'}
            </button>
            <button
              className={`hdr-btn ${cameraActive ? 'cam-on' : ''}`}
              onClick={() => setCameraActive(v => !v)}
            >
              {cameraActive ? '📷 カメラOFF' : '📷 カメラON'}
            </button>
          </div>
        </div>
      </header>

      {/* ── メイン：左右2分割 ── */}
      <main className="main-layout">

        {/* ① 左：カメラ映像 ＋ 骨格オーバーレイ */}
        <section className="half-panel">
          <div className="half-label user">📹 あなたのフォーム</div>
          <CameraView onKeypoints={handleKeypoints} isActive={cameraActive} />
        </section>

        {/* ② 右：理想棒人間 ＋ 埋め込みHUD */}
        <section className="half-panel right-panel">
          <div className="half-label model">✅ 理想フォーム</div>

          {/* 3視点 棒人間（正面・真横・斜め30°） */}
          <div className="figure-wrap">
            <StickFigure3D
              phase={idealPhase}
              feedback={cameraActive ? feedback : []}
            />
          </div>

          {/* ── 埋め込みHUD ── */}
          <div className="inline-hud">

            {/* 回数 */}
            <div className="hud-rep">
              <span className="hud-rep-num">{repCount}</span>
              <span className="hud-rep-unit">回</span>
            </div>

            <div className="hud-sep" />

            {/* 角度カード */}
            <div className="hud-angles">
              <div className={`hud-angle-card ${angleStatus('knee', angles.kneeAngle)}`}>
                <span className="hud-angle-lbl">膝</span>
                <span className="hud-angle-val">
                  {angles.kneeAngle != null ? `${angles.kneeAngle}°` : '--'}
                </span>
              </div>
              <div className={`hud-angle-card ${angleStatus('hip', angles.hipAngle)}`}>
                <span className="hud-angle-lbl">股関節</span>
                <span className="hud-angle-val">
                  {angles.hipAngle != null ? `${angles.hipAngle}°` : '--'}
                </span>
              </div>
              <div className={`hud-angle-card ${angleStatus('back', angles.backAngle)}`}>
                <span className="hud-angle-lbl">背中</span>
                <span className="hud-angle-val">
                  {angles.backAngle != null ? `${angles.backAngle}°` : '--'}
                </span>
              </div>
            </div>

            <div className="hud-sep" />

            {/* フィードバックテキスト */}
            <div className={`hud-fb ${fbClass}`}>{fbText}</div>

            {/* 深度バー ＋ リセット */}
            <div className="hud-right-ctrl">
              {cameraActive && (
                <div className="hud-depth">
                  <span className="hud-depth-lbl">深度</span>
                  <div className="hud-depth-track">
                    <div
                      className="hud-depth-fill"
                      style={{
                        width: `${Math.round(squatPhase * 100)}%`,
                        background: depthColor,
                      }}
                    />
                  </div>
                  <span className="hud-depth-pct" style={{ color: depthColor }}>
                    {Math.round(squatPhase * 100)}%
                  </span>
                </div>
              )}
              <button className="hud-reset-btn" onClick={resetReps}>
                リセット
              </button>
            </div>

          </div>{/* /inline-hud */}

          {/* BGMプレイヤー（右パネル最下部） */}
          <div className="mp-bar">
            <MusicPlayer />
          </div>

        </section>{/* /right-panel */}

      </main>

    </div>
  )
}
