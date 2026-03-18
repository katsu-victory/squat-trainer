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

function drawPoseOverlay(ctx, keypoints, videoW, videoH, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH)
  if (!keypoints) return

  const scaleX = canvasW / videoW
  const scaleY = canvasH / videoH

  // Flip x for mirrored camera
  const sx = (x) => canvasW - x * scaleX
  const sy = (y) => y * scaleY

  // Connections
  CONNECTIONS.forEach(([i, j]) => {
    const a = getKP(keypoints, i, 0.3)
    const b = getKP(keypoints, j, 0.3)
    if (!a || !b) return
    ctx.beginPath()
    ctx.moveTo(sx(a.x), sy(a.y))
    ctx.lineTo(sx(b.x), sy(b.y))
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.85)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.stroke()
  })

  // Keypoints
  keypoints.forEach((kp, i) => {
    if (!kp || kp.score < 0.3) return
    const isLeg = [KP.LEFT_HIP, KP.RIGHT_HIP, KP.LEFT_KNEE,
                   KP.RIGHT_KNEE, KP.LEFT_ANKLE, KP.RIGHT_ANKLE].includes(i)
    ctx.beginPath()
    ctx.arc(sx(kp.x), sy(kp.y), isLeg ? 7 : 5, 0, Math.PI * 2)
    ctx.fillStyle = isLeg ? '#fbbf24' : '#34d399'
    ctx.fill()
  })

  // Knee angle label
  const lHip   = getKP(keypoints, KP.LEFT_HIP,   0.3)
  const lKnee  = getKP(keypoints, KP.LEFT_KNEE,  0.3)
  const lAnkle = getKP(keypoints, KP.LEFT_ANKLE, 0.3)
  if (lHip && lKnee && lAnkle) {
    const angle = calcAngle(lHip, lKnee, lAnkle)
    if (angle !== null) {
      ctx.font = 'bold 14px monospace'
      ctx.fillStyle = '#fde68a'
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 3
      const tx = sx(lKnee.x) + 10
      const ty = sy(lKnee.y) - 10
      ctx.strokeText(`${angle}°`, tx, ty)
      ctx.fillText(`${angle}°`, tx, ty)
    }
  }
}

export default function CameraView({ onKeypoints, isActive }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [camError, setCamError] = useState(null)
  const [camReady, setCamReady] = useState(false)

  const { keypoints, isModelReady } = usePoseDetection(videoRef, isActive && camReady)

  // Pass keypoints up
  useEffect(() => {
    if (onKeypoints) onKeypoints(keypoints)
  }, [keypoints, onKeypoints])

  // Start camera
  useEffect(() => {
    if (!isActive) return
    let mounted = true

    const startCam = async () => {
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
      } catch (e) {
        if (mounted) setCamError('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。')
      }
    }

    startCam()
    return () => {
      mounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setCamReady(false)
      }
    }
  }, [isActive])

  // Draw pose overlay
  useEffect(() => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video || !camReady) return
    const ctx = canvas.getContext('2d')
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    drawPoseOverlay(ctx, keypoints, video.videoWidth, video.videoHeight, canvas.width, canvas.height)
  }, [keypoints, camReady])

  if (!isActive) {
    return (
      <div className="camera-placeholder">
        <div className="placeholder-inner">
          <span className="cam-icon">📷</span>
          <p>カメラを起動して</p>
          <p>自分のフォームを確認しよう</p>
        </div>
      </div>
    )
  }

  if (camError) {
    return (
      <div className="camera-placeholder error">
        <div className="placeholder-inner">
          <span className="cam-icon">⚠️</span>
          <p>{camError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="camera-container">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas ref={canvasRef} className="pose-overlay" />
      <div className="cam-status">
        {!isModelReady
          ? <span className="status-badge loading">AI解析 読み込み中…</span>
          : <span className="status-badge ready">AI解析 稼働中</span>
        }
      </div>
    </div>
  )
}
