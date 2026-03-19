import { useEffect, useRef } from 'react'
import { KP, getKP } from '../hooks/usePoseDetection'

// ユーザーの実際のキーポイントを棒人間として描画するコンポーネント
// MoveNetのキーポイント座標をそのままCanvasに反映（ミラー済み）

const BONES = [
  // 胴体
  [KP.LEFT_SHOULDER,  KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER,  KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP,       KP.RIGHT_HIP],
  // 左腕
  [KP.LEFT_SHOULDER,  KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW,     KP.LEFT_WRIST],
  // 右腕
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW,    KP.RIGHT_WRIST],
  // 左脚
  [KP.LEFT_HIP,   KP.LEFT_KNEE],
  [KP.LEFT_KNEE,  KP.LEFT_ANKLE],
  // 右脚
  [KP.RIGHT_HIP,  KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
]

const LEG_JOINTS = new Set([
  KP.LEFT_HIP, KP.RIGHT_HIP,
  KP.LEFT_KNEE, KP.RIGHT_KNEE,
  KP.LEFT_ANKLE, KP.RIGHT_ANKLE,
])

function drawUserFigure(ctx, keypoints, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH)

  // 背景グリッド
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let x = 0; x < canvasW; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke()
  }
  for (let y = 0; y < canvasH; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke()
  }

  if (!keypoints || keypoints.length === 0) {
    // キーポイントなし → 待機メッセージ
    ctx.font = 'bold 14px system-ui'
    ctx.fillStyle = 'rgba(148,163,184,0.8)'
    ctx.textAlign = 'center'
    ctx.fillText('カメラをONにして', canvasW / 2, canvasH / 2 - 16)
    ctx.fillText('あなたの姿を映してください', canvasW / 2, canvasH / 2 + 8)
    ctx.textAlign = 'left'
    return
  }

  // キーポイントをCanvasサイズに正規化
  // MoveNetは 192x192 基準で x,y を返す → 0〜1 に正規化して使う
  // カメラ映像はscaleX(-1)でミラーされているので x を反転
  const validKps = keypoints.filter(kp => kp && kp.score >= 0.2)
  if (validKps.length < 5) {
    ctx.font = 'bold 14px system-ui'
    ctx.fillStyle = 'rgba(248,113,113,0.9)'
    ctx.textAlign = 'center'
    ctx.fillText('体全体が映るよう調整してください', canvasW / 2, canvasH / 2)
    ctx.textAlign = 'left'
    return
  }

  // 座標変換: MoveNetのx,yは画像ピクセル座標（640x480想定）
  // canvasに収まるようにスケーリング
  const xs = validKps.map(kp => kp.x)
  const ys = validKps.map(kp => kp.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const bodyW = maxX - minX || 1
  const bodyH = maxY - minY || 1

  const padding = 0.12
  const drawW = canvasW * (1 - padding * 2)
  const drawH = canvasH * (1 - padding * 2)
  const scale = Math.min(drawW / bodyW, drawH / bodyH)
  const offsetX = canvasW / 2 - ((minX + maxX) / 2) * scale
  const offsetY = canvasH * padding - minY * scale + (drawH - bodyH * scale) / 2

  // MoveNetはカメラの生座標なので、ミラー（左右反転）して表示
  const tx = (x) => canvasW - (x * scale + offsetX)
  const ty = (y) => y * scale + offsetY

  const lineW = Math.max(3, canvasW / 70)
  const jointR = Math.max(5, canvasW / 50)

  // ボーン（骨格ライン）描画
  BONES.forEach(([i, j]) => {
    const a = getKP(keypoints, i, 0.2)
    const b = getKP(keypoints, j, 0.2)
    if (!a || !b) return

    const isLeg = LEG_JOINTS.has(i) || LEG_JOINTS.has(j)
    ctx.strokeStyle = isLeg ? 'rgba(167,139,250,0.9)' : 'rgba(52,211,153,0.9)'
    ctx.lineWidth = lineW
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tx(a.x), ty(a.y))
    ctx.lineTo(tx(b.x), ty(b.y))
    ctx.stroke()
  })

  // 関節（円）描画
  keypoints.forEach((kp, i) => {
    if (!kp || kp.score < 0.2) return
    const isLeg = LEG_JOINTS.has(i)
    ctx.beginPath()
    ctx.arc(tx(kp.x), ty(kp.y), isLeg ? jointR * 1.2 : jointR, 0, Math.PI * 2)
    ctx.fillStyle = isLeg ? '#fbbf24' : '#60a5fa'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
  })

  // 頭（鼻ポイントを中心に円）
  const nose = getKP(keypoints, KP.NOSE, 0.2)
  if (nose) {
    const headR = jointR * 2.5
    ctx.beginPath()
    ctx.arc(tx(nose.x), ty(nose.y), headR, 0, Math.PI * 2)
    ctx.fillStyle = '#1e40af'
    ctx.fill()
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = lineW * 0.8
    ctx.stroke()
  }

  // 床ライン（足首の位置から）
  const la = getKP(keypoints, KP.LEFT_ANKLE,  0.2)
  const ra = getKP(keypoints, KP.RIGHT_ANKLE, 0.2)
  if (la || ra) {
    const ankleY = Math.max(
      la ? ty(la.y) : 0,
      ra ? ty(ra.y) : 0
    ) + jointR + 4
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(canvasW * 0.1, ankleY)
    ctx.lineTo(canvasW * 0.9, ankleY)
    ctx.stroke()
  }
}

export default function UserStickFigure({ keypoints }) {
  const canvasRef = useRef(null)

  // キーポイント変化時に再描画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    drawUserFigure(ctx, keypoints, canvas.width, canvas.height)
  }, [keypoints])

  // リサイズ対応
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width  || 300
      canvas.height = rect.height || 500
      const ctx = canvas.getContext('2d')
      drawUserFigure(ctx, keypoints, canvas.width, canvas.height)
    })
    ro.observe(canvas.parentElement)
    return () => ro.disconnect()
  }, [keypoints])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={500}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
