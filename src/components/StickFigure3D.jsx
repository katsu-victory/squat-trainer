import { useEffect, useRef } from 'react'

// ===== 3D関節座標（正規化: x=左右, y=上下 0=頭/1=床, z=前後 正=前方） =====
//
// 設計ルール（正しいスクワット）:
//   1. つま先は床と平行    → toeY = ankleY (同じ高さ)
//   2. 膝と腰が同じ高さ    → kneeY = hipY  (パラレルスクワット)
//   3. 腰は斜め後ろ下へ    → hipZ < 0 (後方) かつ hipY 増加 (下降)
//   4. 膝はつま先を超えない → kneeZ ≤ toeZ
//   5. 横から肩・膝・くるぶしが一直線 → 3点がZY平面で共線

const JOINTS_STAND = {
  head:      [ 0.00, 0.07,  0.00],
  neck:      [ 0.00, 0.14,  0.00],
  shoulderL: [-0.13, 0.21,  0.00],
  shoulderR: [ 0.13, 0.21,  0.00],
  elbowL:    [-0.16, 0.33,  0.01],
  elbowR:    [ 0.16, 0.33,  0.01],
  wristL:    [-0.14, 0.44,  0.01],
  wristR:    [ 0.14, 0.44,  0.01],
  hipL:      [-0.09, 0.47,  0.00],
  hipR:      [ 0.09, 0.47,  0.00],
  kneeL:     [-0.09, 0.67,  0.00],
  kneeR:     [ 0.09, 0.67,  0.00],
  ankleL:    [-0.09, 0.87,  0.00],
  ankleR:    [ 0.09, 0.87,  0.00],
  toeL:      [-0.11, 0.87,  0.10],  // toeY = ankleY（床と平行）
  toeR:      [ 0.11, 0.87,  0.10],
}

// パラレルスクワット（正しいフォーム）
// 共線性検証 (ZY平面: ankle(0, 0.87), knee(0.04, 0.65), shoulder(0.07, 0.44)):
//   v1=(0.04,-0.22), v2=(0.07,-0.43) → cross≈0 ✓ 一直線に近い
const JOINTS_SQUAT = {
  head:      [ 0.00, 0.31,  0.07],  // 上体わずかに前傾（バランス）
  neck:      [ 0.00, 0.37,  0.05],
  shoulderL: [-0.14, 0.44,  0.07],  // ← 肩Z=0.07: 横から見て膝(0.04)・くるぶし(0)と一直線
  shoulderR: [ 0.14, 0.44,  0.07],
  elbowL:    [-0.22, 0.50,  0.13],  // 腕は前方に伸ばしてバランス維持
  elbowR:    [ 0.22, 0.50,  0.13],
  wristL:    [-0.24, 0.55,  0.20],
  wristR:    [ 0.24, 0.55,  0.20],
  hipL:      [-0.11, 0.65, -0.10],  // ← 腰: 斜め後ろ下（Z=-0.10 後方, Y=0.65 下降）
  hipR:      [ 0.11, 0.65, -0.10],
  kneeL:     [-0.12, 0.65,  0.04],  // ← 膝Y = 腰Y（パラレル達成）, Z=0.04 ≤ toeZ=0.04
  kneeR:     [ 0.12, 0.65,  0.04],
  ankleL:    [-0.10, 0.87,  0.00],  // 足首: 固定（動かない）
  ankleR:    [ 0.10, 0.87,  0.00],
  toeL:      [-0.12, 0.87,  0.04],  // ← つま先: toeY=ankleY（床と平行）, toeZ=kneeZ（膝がちょうどつま先まで）
  toeR:      [ 0.12, 0.87,  0.04],
}

// 骨格の接続関係
const CONNECTIONS = [
  ['neck',      'hipL'],
  ['neck',      'hipR'],
  ['hipL',      'hipR'],
  ['shoulderL', 'shoulderR'],
  ['neck',      'shoulderL'],
  ['neck',      'shoulderR'],
  ['shoulderL', 'elbowL'],
  ['elbowL',    'wristL'],
  ['shoulderR', 'elbowR'],
  ['elbowR',    'wristR'],
  ['hipL',      'kneeL'],
  ['kneeL',     'ankleL'],
  ['ankleL',    'toeL'],
  ['hipR',      'kneeR'],
  ['kneeR',     'ankleR'],
  ['ankleR',    'toeR'],
]

// 線形補間
const lerp = (a, b, t) => a + (b - a) * t

// 3D関節を補間
function interpJoints(t) {
  const out = {}
  for (const key of Object.keys(JOINTS_STAND)) {
    const s = JOINTS_STAND[key]
    const q = JOINTS_SQUAT[key]
    out[key] = [
      lerp(s[0], q[0], t),
      lerp(s[1], q[1], t),
      lerp(s[2], q[2], t),
    ]
  }
  return out
}

// ===== 投影関数 =====
const C30 = Math.cos(Math.PI / 6)  // cos 30°
const S30 = Math.sin(Math.PI / 6)  // sin 30°
const C45 = Math.cos(Math.PI / 4)
const S45 = Math.sin(Math.PI / 4)

const VIEWS = {
  front:    ([x, y])    => [x, y],
  // 真横（左側から見る）: z軸が左右になる。腰の後退(-z)が左側に、膝の前進(+z)が右側に表示
  // z方向を拡大（×2.2）して腰・膝の前後差を見やすく
  side:     ([, y, z])  => [z * 2.2, y],
  // 斜め30°（右前方から見る）
  diagonal: ([x, y, z]) => [x * C30 + z * S30, y],
}

// ===== 1ビューを描画 =====
function drawOneView(ctx, joints, project, sectionX, sectionW, sectionH, viewLabel, viewColor, feedback) {
  // 投影して正規化 (x: -0.35〜0.35 → 0〜sectionW, y: 0〜1 → 0〜sectionH)
  const XRANGE = 0.35
  const YPAD   = 0.05  // 上下のパディング（正規化単位）

  const toCanvas = ([nx, ny]) => ({
    cx: sectionX + (nx + XRANGE) / (XRANGE * 2) * sectionW,
    cy: (ny + YPAD) / (1 + YPAD * 2) * sectionH,
  })

  // 投影済み関節マップ
  const pj = {}
  for (const [name, coords] of Object.entries(joints)) {
    pj[name] = toCanvas(project(coords))
  }

  // ===== 床ライン =====
  ctx.strokeStyle = 'rgba(96,165,250,0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const floorY = toCanvas([0, 0.94]).cy
  ctx.moveTo(sectionX + sectionW * 0.08, floorY)
  ctx.lineTo(sectionX + sectionW * 0.92, floorY)
  ctx.stroke()

  // ===== 骨格ライン =====
  const lw = Math.max(2, sectionW / 55)
  const jr = Math.max(4, sectionW / 40)

  const drawLine = (a, b, color, alpha = 1) => {
    if (!pj[a] || !pj[b]) return
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth   = lw
    ctx.lineCap     = 'round'
    ctx.beginPath()
    ctx.moveTo(pj[a].cx, pj[a].cy)
    ctx.lineTo(pj[b].cx, pj[b].cy)
    ctx.stroke()
    ctx.restore()
  }

  // 左右で色分け (左=明るい/前面, 右=暗い/奥行き感)
  CONNECTIONS.forEach(([a, b]) => {
    const isRight = a.includes('R') || b.includes('R')
    const isLeg   = /knee|ankle|toe|hip/.test(a + b)
    const alpha   = isRight ? 0.55 : 1.0
    const color   = isLeg ? (isRight ? '#7c3aed' : '#a78bfa') : (isRight ? '#047857' : '#34d399')
    drawLine(a, b, color, alpha)
  })

  // ===== 関節点 =====
  ;['shoulderL','shoulderR','elbowL','elbowR',
    'hipL','hipR','kneeL','kneeR','ankleL','ankleR'].forEach(n => {
    if (!pj[n]) return
    const isRight = n.includes('R')
    ctx.beginPath()
    ctx.arc(pj[n].cx, pj[n].cy, jr * (isRight ? 0.65 : 1), 0, Math.PI * 2)
    ctx.fillStyle = isRight ? '#92400e' : '#fbbf24'
    ctx.fill()
  })

  // ===== 頭 =====
  const hp = pj['head']
  if (hp) {
    const hr = Math.max(10, sectionW / 20)
    ctx.beginPath()
    ctx.arc(hp.cx, hp.cy, hr, 0, Math.PI * 2)
    ctx.fillStyle   = '#1e40af'
    ctx.fill()
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth   = lw * 0.8
    ctx.stroke()
    // 目
    ;[-1, 1].forEach(s => {
      ctx.beginPath()
      ctx.arc(hp.cx + s * hr * 0.3, hp.cy - hr * 0.1, hr * 0.14, 0, Math.PI * 2)
      ctx.fillStyle = '#e2e8f0'
      ctx.fill()
    })
  }

  // ===== ラベル（ビュー名） =====
  ctx.font      = `bold ${Math.max(10, sectionW / 18)}px 'Segoe UI', sans-serif`
  ctx.fillStyle = viewColor
  ctx.textAlign = 'center'
  ctx.fillText(viewLabel, sectionX + sectionW / 2, sectionH * 0.97)
  ctx.textAlign = 'left'

  // ===== フィードバック吹き出し（正面ビューのみ） =====
  if (feedback && feedback.length > 0) {
    drawFeedbackAnnotations(ctx, pj, feedback, sectionX, sectionW)
  }
}

// ===== フィードバック吹き出し =====
const JOINT_MAP = [
  { patterns: [/しゃがも|しゃがん|もっと深|膝.*曲げ/],     joint: 'kneeL',    side: 'left'  },
  { patterns: [/前傾しすぎ|上体.*前|股関節の深/],           joint: 'hipL',     side: 'left'  },
  { patterns: [/背中|前傾.*°|上体.*起こ/],                  joint: 'neck',     side: 'right' },
  { patterns: [/膝.*OK|膝のポジション/],                    joint: 'kneeL',    side: 'right' },
  { patterns: [/股関節.*OK/],                               joint: 'hipL',     side: 'right' },
  { patterns: [/足幅|肩幅/],                                joint: 'ankleL',   side: 'left'  },
]

function resolveJoint(text) {
  for (const { patterns, joint, side } of JOINT_MAP) {
    if (patterns.some(p => p.test(text))) return { joint, side }
  }
  return { joint: 'neck', side: 'right' }
}

function drawFeedbackAnnotations(ctx, pj, feedback, sectionX, sectionW) {
  const msgs = [
    ...feedback.filter(f => f.type === 'warn' || f.type === 'danger'),
    ...feedback.filter(f => f.type === 'good'),
  ].slice(0, 3)

  const drawn = new Set()
  for (const fb of msgs) {
    const { joint, side } = resolveJoint(fb.text)
    if (drawn.has(joint)) continue
    drawn.add(joint)
    const pt = pj[joint]
    if (!pt) continue

    const isWarn     = fb.type !== 'good'
    const bubbleW    = Math.min(sectionW * 0.62, 130)
    const bubbleH    = 22
    const arrowLen   = 14
    const fillColor  = isWarn ? 'rgba(239,68,68,0.90)' : 'rgba(34,197,94,0.90)'
    const lineColor  = isWarn ? '#ef4444' : '#22c55e'
    const { cx, cy } = pt

    const bx = side === 'left'
      ? Math.max(sectionX + 2, cx - arrowLen - bubbleW)
      : Math.min(sectionX + sectionW - bubbleW - 2, cx + arrowLen)
    const by = cy - bubbleH / 2

    // 矢印
    ctx.beginPath()
    ctx.strokeStyle = lineColor
    ctx.lineWidth   = 1.5
    ctx.setLineDash([3, 2])
    const tipX = side === 'left' ? bx + bubbleW : bx
    ctx.moveTo(cx, cy); ctx.lineTo(tipX, cy)
    ctx.stroke()
    ctx.setLineDash([])

    // 矢じり
    const d = side === 'left' ? 1 : -1
    ctx.beginPath()
    ctx.fillStyle = lineColor
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + d * 6, cy - 3)
    ctx.lineTo(cx + d * 6, cy + 3)
    ctx.closePath(); ctx.fill()

    // 吹き出し背景
    const r = 5
    ctx.beginPath()
    ctx.moveTo(bx + r, by)
    ctx.lineTo(bx + bubbleW - r, by)
    ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + r)
    ctx.lineTo(bx + bubbleW, by + bubbleH - r)
    ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - r, by + bubbleH)
    ctx.lineTo(bx + r, by + bubbleH)
    ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - r)
    ctx.lineTo(bx, by + r)
    ctx.quadraticCurveTo(bx, by, bx + r, by)
    ctx.closePath()
    ctx.fillStyle = fillColor; ctx.fill()

    // テキスト
    ctx.fillStyle = '#fff'
    ctx.font      = `bold ${Math.max(9, Math.min(11, bubbleW / 9))}px 'Segoe UI', sans-serif`
    ctx.textAlign = 'center'
    // テキストを省略
    let text = fb.text
    const maxW = bubbleW - 8
    while (ctx.measureText(text).width > maxW && text.length > 4) text = text.slice(0, -1)
    if (text !== fb.text) text = text.slice(0, -1) + '…'
    ctx.fillText(text, bx + bubbleW / 2, by + bubbleH * 0.68)
    ctx.textAlign = 'left'
  }
}

// ===== メイン描画 =====
function drawAll(ctx, w, h, phase, feedback) {
  ctx.clearRect(0, 0, w, h)

  // 背景
  ctx.fillStyle = 'rgba(2,6,23,0.95)'
  ctx.fillRect(0, 0, w, h)

  // サブグリッド
  ctx.strokeStyle = 'rgba(96,165,250,0.05)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // セクション仕切り線
  ctx.strokeStyle = 'rgba(96,165,250,0.18)'
  ctx.lineWidth   = 1
  const sw = w / 3
  ctx.beginPath(); ctx.moveTo(sw, 0);     ctx.lineTo(sw, h);     ctx.stroke()
  ctx.beginPath(); ctx.moveTo(sw * 2, 0); ctx.lineTo(sw * 2, h); ctx.stroke()

  const joints = interpJoints(phase)

  const views = [
    { key: 'front',    label: '正面',    color: '#60a5fa', project: VIEWS.front    },
    { key: 'side',     label: '真横',    color: '#34d399', project: VIEWS.side     },
    { key: 'diagonal', label: '斜め30°', color: '#c084fc', project: VIEWS.diagonal },
  ]

  views.forEach(({ label, color, project }, i) => {
    drawOneView(
      ctx, joints, project,
      i * sw, sw, h,
      label, color,
      i === 0 ? feedback : []  // フィードバック吹き出しは正面ビューのみ
    )
  })
}

// ===== React コンポーネント =====
export default function StickFigure3D({ phase = 0, feedback = [] }) {
  const canvasRef = useRef(null)
  const phaseRef  = useRef(phase)
  const feedRef   = useRef(feedback)

  useEffect(() => { phaseRef.current = phase },    [phase])
  useEffect(() => { feedRef.current  = feedback }, [feedback])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width  || 600
      canvas.height = rect.height || 400
      drawAll(ctx, canvas.width, canvas.height, phaseRef.current, feedRef.current)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)
    resize()
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    drawAll(ctx, canvas.width, canvas.height, phase, feedback)
  }, [phase, feedback])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={400}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
