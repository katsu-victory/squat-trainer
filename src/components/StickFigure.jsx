import { useEffect, useRef } from 'react'

// ===== スクワットキーフレーム（正規化座標 0-1） =====
const KEYFRAMES = {
  standing: {
    head:      { x: 0.50, y: 0.08 },
    neck:      { x: 0.50, y: 0.15 },
    shoulderL: { x: 0.37, y: 0.21 },
    shoulderR: { x: 0.63, y: 0.21 },
    elbowL:    { x: 0.31, y: 0.34 },
    elbowR:    { x: 0.69, y: 0.34 },
    wristL:    { x: 0.33, y: 0.46 },
    wristR:    { x: 0.67, y: 0.46 },
    hipL:      { x: 0.42, y: 0.47 },
    hipR:      { x: 0.58, y: 0.47 },
    kneeL:     { x: 0.40, y: 0.68 },
    kneeR:     { x: 0.60, y: 0.68 },
    ankleL:    { x: 0.40, y: 0.88 },
    ankleR:    { x: 0.60, y: 0.88 },
    toeL:      { x: 0.35, y: 0.92 },
    toeR:      { x: 0.65, y: 0.92 },
  },
  squat: {
    head:      { x: 0.50, y: 0.24 },
    neck:      { x: 0.50, y: 0.31 },
    shoulderL: { x: 0.37, y: 0.38 },
    shoulderR: { x: 0.63, y: 0.38 },
    elbowL:    { x: 0.26, y: 0.47 },
    elbowR:    { x: 0.74, y: 0.47 },
    wristL:    { x: 0.22, y: 0.55 },
    wristR:    { x: 0.78, y: 0.55 },
    hipL:      { x: 0.40, y: 0.60 },
    hipR:      { x: 0.60, y: 0.60 },
    kneeL:     { x: 0.33, y: 0.73 },
    kneeR:     { x: 0.67, y: 0.73 },
    ankleL:    { x: 0.38, y: 0.88 },
    ankleR:    { x: 0.62, y: 0.88 },
    toeL:      { x: 0.32, y: 0.92 },
    toeR:      { x: 0.68, y: 0.92 },
  },
}

function lerp(a, b, t) { return a + (b - a) * t }
function lerpPt(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) } }

function getFrame(phase) {
  const k = {}
  for (const j in KEYFRAMES.standing)
    k[j] = lerpPt(KEYFRAMES.standing[j], KEYFRAMES.squat[j], phase)
  return k
}

// ===== フィードバック → 関節マッピング =====
// どのキーワードがどの関節に対応するか
const FEEDBACK_JOINT_MAP = [
  { pattern: /しゃがも|しゃがん|膝の角度|膝を曲げ|もっと/,  joint: 'kneeL',  side: 'left'  },
  { pattern: /膝の曲げすぎ|膝.*注意/,                       joint: 'kneeL',  side: 'left'  },
  { pattern: /前傾しすぎ|上体.*前|股関節の深さ/,            joint: 'hipL',   side: 'left'  },
  { pattern: /背中|前傾.*°|背中.*起こ/,                     joint: 'neck',   side: 'right' },
  { pattern: /膝.*ポジション|膝.*OK/,                        joint: 'kneeR',  side: 'right' },
  { pattern: /股関節.*OK/,                                   joint: 'hipR',   side: 'right' },
]

function resolveJoint(text) {
  for (const { pattern, joint, side } of FEEDBACK_JOINT_MAP) {
    if (pattern.test(text)) return { joint, side }
  }
  return { joint: 'neck', side: 'right' } // default: 首あたり
}

// ===== 吹き出し描画 =====
function drawBubble(ctx, px, py, text, type, side) {
  const padding = { x: 10, y: 6 }
  const fontSize = 11
  ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`
  const tw = ctx.measureText(text).width
  const bw = tw + padding.x * 2
  const bh = fontSize + padding.y * 2
  const arrowLen = 18

  // 吹き出しの向きで位置を決める
  const bx = side === 'left'
    ? px - arrowLen - bw   // 左側に吹き出し
    : px + arrowLen         // 右側に吹き出し
  const by = py - bh / 2

  // 色
  const isWarn = type === 'warn' || type === 'danger'
  const fillColor  = isWarn ? 'rgba(239,68,68,0.88)' : 'rgba(34,197,94,0.88)'
  const arrowColor = isWarn ? '#ef4444' : '#22c55e'
  const textColor  = '#fff'

  // 矢印（関節から吹き出しへ）
  ctx.beginPath()
  ctx.strokeStyle = arrowColor
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  const arrowTip = side === 'left' ? bx + bw : bx
  ctx.moveTo(px, py)
  ctx.lineTo(arrowTip, py)
  ctx.stroke()
  ctx.setLineDash([])

  // 矢じり
  ctx.beginPath()
  ctx.fillStyle = arrowColor
  const arrowDir = side === 'left' ? 1 : -1
  ctx.moveTo(px, py)
  ctx.lineTo(px + arrowDir * 7, py - 4)
  ctx.lineTo(px + arrowDir * 7, py + 4)
  ctx.closePath()
  ctx.fill()

  // 吹き出し背景（角丸矩形）
  const r = 6
  ctx.beginPath()
  ctx.moveTo(bx + r, by)
  ctx.lineTo(bx + bw - r, by)
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r)
  ctx.lineTo(bx + bw, by + bh - r)
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh)
  ctx.lineTo(bx + r, by + bh)
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r)
  ctx.lineTo(bx, by + r)
  ctx.quadraticCurveTo(bx, by, bx + r, by)
  ctx.closePath()
  ctx.fillStyle = fillColor
  ctx.fill()

  // テキスト
  ctx.fillStyle = textColor
  ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`
  ctx.fillText(text, bx + padding.x, by + padding.y + fontSize * 0.85)
}

// ===== メイン描画 =====
function draw(ctx, w, h, phase, feedback) {
  ctx.clearRect(0, 0, w, h)
  const k = getFrame(phase)
  const p = (pt) => ({ x: pt.x * w, y: pt.y * h })

  // 微妙な床グリッド（仮想空間テイスト）
  ctx.strokeStyle = 'rgba(96,165,250,0.07)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += 36) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // 床ライン
  ctx.strokeStyle = 'rgba(96,165,250,0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w * 0.05, h * 0.94)
  ctx.lineTo(w * 0.95, h * 0.94)
  ctx.stroke()

  const lw = Math.max(3, w / 70)
  const jr = Math.max(5, w / 50)

  const line = (a, b, color, alpha = 1) => {
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.beginPath()
    const pa = p(a), pb = p(b)
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  const joint = (pt, color, r = jr) => {
    const pp = p(pt)
    ctx.beginPath()
    ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // 胴体
  line(k.neck,      k.hipL,      '#93c5fd')
  line(k.neck,      k.hipR,      '#93c5fd')
  line(k.hipL,      k.hipR,      '#60a5fa')
  line(k.shoulderL, k.shoulderR, '#60a5fa')
  // 腕
  line(k.shoulderL, k.elbowL,   '#34d399')
  line(k.elbowL,    k.wristL,   '#34d399')
  line(k.shoulderR, k.elbowR,   '#34d399')
  line(k.elbowR,    k.wristR,   '#34d399')
  // 脚
  line(k.hipL,  k.kneeL,  '#a78bfa', 1)
  line(k.kneeL, k.ankleL, '#a78bfa', 1)
  line(k.ankleL,k.toeL,   '#f59e0b', 1)
  line(k.hipR,  k.kneeR,  '#a78bfa', 0.6)
  line(k.kneeR, k.ankleR, '#a78bfa', 0.6)
  line(k.ankleR,k.toeR,   '#f59e0b', 0.6)

  // 関節
  ;[k.shoulderL, k.shoulderR, k.elbowL, k.elbowR,
    k.hipL, k.hipR, k.kneeL, k.kneeR, k.ankleL, k.ankleR
  ].forEach(pt => joint(pt, '#fbbf24'))

  // 頭
  const hp = p(k.head)
  const hr = Math.max(13, w / 26)
  ctx.beginPath()
  ctx.arc(hp.x, hp.y, hr, 0, Math.PI * 2)
  ctx.fillStyle = '#1e40af'
  ctx.fill()
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = lw * 0.8
  ctx.stroke()
  // 目
  ;[-1, 1].forEach(s => {
    ctx.beginPath()
    ctx.arc(hp.x + s * hr * 0.32, hp.y - hr * 0.12, hr * 0.13, 0, Math.PI * 2)
    ctx.fillStyle = '#e2e8f0'
    ctx.fill()
  })

  // ===== フィードバック吹き出し =====
  if (feedback && feedback.length > 0) {
    // warn を先に、最大3件まで
    const msgs = [
      ...feedback.filter(f => f.type === 'warn' || f.type === 'danger'),
      ...feedback.filter(f => f.type === 'good'),
    ].slice(0, 3)

    const drawn = new Set() // 同じ関節に2つ描かない
    for (const fb of msgs) {
      const { joint: jname, side } = resolveJoint(fb.text)
      if (drawn.has(jname)) continue
      drawn.add(jname)
      const jpt = k[jname]
      if (!jpt) continue
      const pp = p(jpt)
      drawBubble(ctx, pp.x, pp.y, fb.text, fb.type, side)
    }
  }

  // スクワット角度ラベル（理想値）
  if (phase > 0.05) {
    const kneeIdeal = Math.round(lerp(170, 90, phase))
    const hipIdeal  = Math.round(lerp(170, 85, phase))
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = 'rgba(251,191,36,0.8)'
    const kp = p(k.kneeL)
    const hpL = p(k.hipL)
    ctx.fillText(`${kneeIdeal}°`, kp.x + jr + 2, kp.y + 4)
    ctx.fillText(`${hipIdeal}°`,  hpL.x + jr + 2, hpL.y + 4)
  }
}

// ===== React コンポーネント =====
export default function StickFigure({ phase = 0, feedback = [] }) {
  const canvasRef = useRef(null)
  const phaseRef  = useRef(phase)
  const feedRef   = useRef(feedback)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { feedRef.current  = feedback }, [feedback])

  // ResizeObserver でキャンバスサイズを親に追従
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width  || 300
      canvas.height = rect.height || 500
      draw(ctx, canvas.width, canvas.height, phaseRef.current, feedRef.current)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)
    resize()
    return () => ro.disconnect()
  }, [])

  // phase / feedback が変わるたびに再描画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    draw(ctx, canvas.width, canvas.height, phase, feedback)
  }, [phase, feedback])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={500}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
