import { useEffect, useRef, useState } from 'react'
import { usePoseDetection, KP, getKP, calcAngle } from '../hooks/usePoseDetection'

const CONNECTIONS = [
  [KP.LEFT_SHOULDER,  KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER,  KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW,     KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW,    KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER,  KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP,       KP.RIGHT_HIP],
  [KP.LEFT_HIP,       KP.LEFT_KNEE],
  [KP.LEFT_KNEE,      KP.LEFT_ANKLE],
  [KP.RIGHT_HIP,      KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE,     KP.RIGHT_ANKLE],
]

// 仮想空間グリッドを描画
function drawVirtualBg(ctx, w, h) {
  // ベース: 半透明ダーク
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)'
  ctx.fillRect(0, 0, w, h)

  // グリッドライン
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.12)'
  ctx.lineWidth = 1
  const gs = 48
  for (let x = 0; x < w; x += gs) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += gs) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // スキャンライン（縞模様）
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 2)
  }
}

export default function CameraView({ onKeypoints, isActive }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const [camError,  setCamError]  = useState(null)
  const [camReady,  setCamReady]  = useState(false)

  const { keypoints, isModelReady } = usePoseDetection(videoRef, isActive && camReady)

  // キーポイントを親に渡す
  useEffect(() => {
    if (onKeypoints) onKeypoints(keypoints)
  }, [keypoints, onKeypoints])

  // カメラ起動
  useEffect(() => {
    if (!isActive) return
    let mounted = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play()
            setCamReady(true)
          }
        }
      } catch {
        if (mounted) setCamError('カメラのアクセスが拒否されました。ブラウザ設定を確認してください。')
      }
    })()
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setCamReady(false)
    }
  }, [isActive])

  // ===== アニメーションループ：1枚のキャンバスにすべて描画 =====
  useEffect(() => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video || !camReady) return

    const ctx = canvas.getContext('2d')

    const loop = () => {
      const cw = canvas.width
      const ch = canvas.height
      const vw = video.videoWidth  || 640
      const vh = video.videoHeight || 480

      // ① クリア
      ctx.clearRect(0, 0, cw, ch)

      // ② カメラ映像を object-fit:cover 相当でミラー描画
      if (video.readyState >= 2) {
        const scale   = Math.max(cw / vw, ch / vh)
        const sw      = vw * scale
        const sh      = vh * scale
        const ox      = (cw - sw) / 2
        const oy      = (ch - sh) / 2

        ctx.save()
        ctx.translate(cw, 0)    // ミラー
        ctx.scale(-1, 1)
        ctx.globalAlpha = 0.90
        ctx.drawImage(video, ox, oy, sw, sh)
        ctx.globalAlpha = 1
        ctx.restore()

        // ③ 仮想空間グリッドをオーバーレイ（multiply で自然に馴染む）
        drawVirtualBg(ctx, cw, ch)

        // ④ 骨格を描画（キャンバスと同じ座標系）
        if (keypoints) {
          // cover モードでのスケール・オフセットを計算
          const skSx = (x) => cw - (x * scale + ox)   // ミラー
          const skSy = (y) =>       y * scale + oy

          // ライン
          CONNECTIONS.forEach(([i, j]) => {
            const a = getKP(keypoints, i, 0.3)
            const b = getKP(keypoints, j, 0.3)
            if (!a || !b) return
            ctx.beginPath()
            ctx.moveTo(skSx(a.x), skSy(a.y))
            ctx.lineTo(skSx(b.x), skSy(b.y))
            ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)'
            ctx.lineWidth   = 3
            ctx.lineCap     = 'round'
            ctx.stroke()
          })

          // 関節点
          const LEG_KP = [KP.LEFT_HIP, KP.RIGHT_HIP, KP.LEFT_KNEE,
                          KP.RIGHT_KNEE, KP.LEFT_ANKLE, KP.RIGHT_ANKLE]
          keypoints.forEach((kp, i) => {
            if (!kp || kp.score < 0.3) return
            const isLeg = LEG_KP.includes(i)
            ctx.beginPath()
            ctx.arc(skSx(kp.x), skSy(kp.y), isLeg ? 7 : 5, 0, Math.PI * 2)
            ctx.fillStyle = isLeg ? '#fbbf24' : '#34d399'
            ctx.fill()
          })

          // 膝の角度ラベル
          const lHip   = getKP(keypoints, KP.LEFT_HIP,   0.3)
          const lKnee  = getKP(keypoints, KP.LEFT_KNEE,  0.3)
          const lAnkle = getKP(keypoints, KP.LEFT_ANKLE, 0.3)
          if (lHip && lKnee && lAnkle) {
            const angle = calcAngle(lHip, lKnee, lAnkle)
            if (angle !== null) {
              const tx = skSx(lKnee.x) + 10
              const ty = skSy(lKnee.y) - 10
              ctx.font        = 'bold 14px monospace'
              ctx.lineWidth   = 3
              ctx.strokeStyle = 'rgba(0,0,0,0.7)'
              ctx.fillStyle   = '#fde68a'
              ctx.strokeText(`${angle}°`, tx, ty)
              ctx.fillText   (`${angle}°`, tx, ty)
            }
          }
        }
      } else {
        // ビデオ未準備: 仮想背景のみ
        ctx.fillStyle = '#020617'
        ctx.fillRect(0, 0, cw, ch)
        drawVirtualBg(ctx, cw, ch)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    // キャンバスサイズをコンテナに追従
    const ro = new ResizeObserver(() => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = Math.round(rect.width)  || 640
      canvas.height = Math.round(rect.height) || 480
    })
    ro.observe(canvas.parentElement)
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width  = Math.round(rect.width)  || 640
    canvas.height = Math.round(rect.height) || 480

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [camReady, keypoints])

  // プレースホルダー（カメラOFF）
  if (!isActive) {
    return (
      <div className="cam-placeholder">
        <span className="cam-placeholder-icon">📷</span>
        <p>カメラを起動して<br />自分のフォームを確認しよう</p>
      </div>
    )
  }
  if (camError) {
    return (
      <div className="cam-placeholder">
        <span className="cam-placeholder-icon">⚠️</span>
        <p>{camError}</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* TF.js 用: 非表示ビデオ */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      {/* 映像＋骨格＋仮想背景を合成するキャンバス */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {/* AI解析ステータス */}
      <div className="cam-status">
        {!isModelReady
          ? <span className="status-badge loading">AI解析 読み込み中…</span>
          : <span className="status-badge ready">AI解析 稼働中</span>
        }
      </div>
    </div>
  )
}
