import { useEffect, useRef } from 'react'

// Stick figure joint positions for squat keyframes
// All coordinates normalized 0-1 relative to canvas
// phase: 0 = standing, 1 = bottom of squat

const KEYFRAMES = {
  standing: {
    head:       { x: 0.50, y: 0.08 },
    neck:       { x: 0.50, y: 0.15 },
    shoulderL:  { x: 0.38, y: 0.20 },
    shoulderR:  { x: 0.62, y: 0.20 },
    elbowL:     { x: 0.33, y: 0.33 },
    elbowR:     { x: 0.67, y: 0.33 },
    wristL:     { x: 0.35, y: 0.44 },
    wristR:     { x: 0.65, y: 0.44 },
    hipL:       { x: 0.42, y: 0.46 },
    hipR:       { x: 0.58, y: 0.46 },
    kneeL:      { x: 0.40, y: 0.68 },
    kneeR:      { x: 0.60, y: 0.68 },
    ankleL:     { x: 0.40, y: 0.88 },
    ankleR:     { x: 0.60, y: 0.88 },
    toeL:       { x: 0.36, y: 0.91 },
    toeR:       { x: 0.64, y: 0.91 },
  },
  squat: {
    head:       { x: 0.50, y: 0.25 },
    neck:       { x: 0.50, y: 0.32 },
    shoulderL:  { x: 0.38, y: 0.38 },
    shoulderR:  { x: 0.62, y: 0.38 },
    elbowL:     { x: 0.28, y: 0.46 },
    elbowR:     { x: 0.72, y: 0.46 },
    wristL:     { x: 0.24, y: 0.54 },
    wristR:     { x: 0.76, y: 0.54 },
    hipL:       { x: 0.40, y: 0.60 },
    hipR:       { x: 0.60, y: 0.60 },
    kneeL:      { x: 0.35, y: 0.72 },
    kneeR:      { x: 0.65, y: 0.72 },
    ankleL:     { x: 0.38, y: 0.88 },
    ankleR:     { x: 0.62, y: 0.88 },
    toeL:       { x: 0.34, y: 0.91 },
    toeR:       { x: 0.66, y: 0.91 },
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function lerpPoint(pa, pb, t) {
  return { x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t) }
}

function getFrame(phase) {
  const keys = {}
  for (const joint in KEYFRAMES.standing) {
    keys[joint] = lerpPoint(KEYFRAMES.standing[joint], KEYFRAMES.squat[joint], phase)
  }
  return keys
}

function drawStickFigure(ctx, w, h, phase, colors) {
  const k = getFrame(phase)
  // Scale to canvas
  const p = (pt) => ({ x: pt.x * w, y: pt.y * h })

  ctx.clearRect(0, 0, w, h)

  // Background grid (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Floor line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w * 0.1, h * 0.93)
  ctx.lineTo(w * 0.9, h * 0.93)
  ctx.stroke()

  const lineWidth = Math.max(3, w / 80)
  const jointRadius = Math.max(5, w / 55)

  const drawLine = (a, b, color = colors.body) => {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.beginPath()
    const pa = p(a), pb = p(b)
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  const drawJoint = (pt, color = colors.joint, r = jointRadius) => {
    const pp = p(pt)
    ctx.beginPath()
    ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // Spine
  drawLine(k.neck, k.hipL, colors.spine)
  drawLine(k.neck, k.hipR, colors.spine)

  // Torso (hip line)
  drawLine(k.hipL, k.hipR, colors.body)

  // Shoulder line
  drawLine(k.shoulderL, k.shoulderR, colors.body)

  // Left arm
  drawLine(k.shoulderL, k.elbowL, colors.limb)
  drawLine(k.elbowL, k.wristL, colors.limb)

  // Right arm
  drawLine(k.shoulderR, k.elbowR, colors.limb)
  drawLine(k.elbowR, k.wristR, colors.limb)

  // Left leg
  drawLine(k.hipL, k.kneeL, colors.leg)
  drawLine(k.kneeL, k.ankleL, colors.leg)
  drawLine(k.ankleL, k.toeL, colors.foot)

  // Right leg
  drawLine(k.hipR, k.kneeR, colors.leg)
  drawLine(k.kneeR, k.ankleR, colors.leg)
  drawLine(k.ankleR, k.toeR, colors.foot)

  // Joints
  ;[k.shoulderL, k.shoulderR, k.elbowL, k.elbowR,
    k.hipL, k.hipR, k.kneeL, k.kneeR, k.ankleL, k.ankleR
  ].forEach(pt => drawJoint(pt))

  // Head
  const headPt = p(k.head)
  const headR = Math.max(14, w / 28)
  ctx.beginPath()
  ctx.arc(headPt.x, headPt.y, headR, 0, Math.PI * 2)
  ctx.fillStyle = colors.head
  ctx.fill()
  ctx.strokeStyle = colors.headStroke
  ctx.lineWidth = lineWidth * 0.8
  ctx.stroke()

  // Eyes
  const eyeOffset = headR * 0.3
  const eyeY = headPt.y - headR * 0.15
  ;[-1, 1].forEach(side => {
    ctx.beginPath()
    ctx.arc(headPt.x + side * eyeOffset, eyeY, headR * 0.12, 0, Math.PI * 2)
    ctx.fillStyle = colors.eye
    ctx.fill()
  })

  // Angle labels on key joints
  if (phase > 0.05) {
    const kneeAngle = Math.round(lerp(170, 90, phase))
    const hipAngle  = Math.round(lerp(170, 85, phase))
    drawAngleLabel(ctx, p(k.kneeL), `${kneeAngle}°`, colors.label)
    drawAngleLabel(ctx, p(k.hipL),  `${hipAngle}°`,  colors.label)
  }
}

function drawAngleLabel(ctx, pt, text, color) {
  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = color
  ctx.fillText(text, pt.x - 16, pt.y - 10)
}

export default function StickFigure({ phase = 0 }) {
  const canvasRef = useRef(null)

  const colors = {
    body:       '#60a5fa',
    spine:      '#93c5fd',
    limb:       '#34d399',
    leg:        '#a78bfa',
    foot:       '#f59e0b',
    head:       '#1e40af',
    headStroke: '#60a5fa',
    eye:        '#e2e8f0',
    joint:      '#fbbf24',
    label:      '#fde68a',
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    drawStickFigure(ctx, canvas.width, canvas.height, phase, colors)
  }, [phase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width = rect.width || 300
      canvas.height = rect.height || 500
      const ctx = canvas.getContext('2d')
      drawStickFigure(ctx, canvas.width, canvas.height, phase, colors)
    })
    resizeObserver.observe(canvas.parentElement)
    return () => resizeObserver.disconnect()
  }, [phase])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={500}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
