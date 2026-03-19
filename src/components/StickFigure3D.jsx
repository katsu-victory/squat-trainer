import { useEffect, useRef } from 'react'

// ===== 3D関節座標（正規化: x=左右, y=上下 0=頭/1=床, z=前後 正=前方） =====
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
  toeL:      [-0.11, 0.87,  0.10],
  toeR:      [ 0.11, 0.87,  0.10],
}

const JOINTS_SQUAT = {
  head:      [ 0.00, 0.31,  0.07],
  neck:      [ 0.00, 0.37,  0.05],
  shoulderL: [-0.14, 0.44,  0.07],
  shoulderR: [ 0.14, 0.44,  0.07],
  elbowL:    [-0.22, 0.50,  0.13],
  elbowR:    [ 0.22, 0.50,  0.13],
  wristL:    [-0.24, 0.55,  0.20],
  wristR:    [ 0.24, 0.55,  0.20],
  hipL:      [-0.11, 0.65, -0.10],
  hipR:      [ 0.11, 0.65, -0.10],
  kneeL:     [-0.12, 0.65,  0.04],
  kneeR:     [ 0.12, 0.65,  0.04],
  ankleL:    [-0.10, 0.87,  0.00],
  ankleR:    [ 0.10, 0.87,  0.00],
  toeL:      [-0.12, 0.87,  0.10],
  toeR:      [ 0.12, 0.87,  0.10],
}

const CONNECTIONS = [
  ['neck','hipL'],['neck','hipR'],['hipL','hipR'],
  ['shoulderL','shoulderR'],['neck','shoulderL'],['neck','shoulderR'],
  ['shoulderL','elbowL'],['elbowL','wristL'],
  ['shoulderR','elbowR'],['elbowR','wristR'],
  ['hipL','kneeL'],['kneeL','ankleL'],['ankleL','toeL'],
  ['hipR','kneeR'],['kneeR','ankleR'],['ankleR','toeR'],
]

const lerp  = (a, b, t) => a + (b - a) * t

// ===== スタンド時の骨長を事前計算（不変の基準） =====
const LEG_BONE_LENGTHS = (() => {
  const d = {}
  for (const side of ['L', 'R']) {
    for (const [a, b] of [
      [`ankle${side}`, `knee${side}`],
      [`knee${side}`,  `hip${side}` ],
    ]) {
      const pa = JOINTS_STAND[a], pb = JOINTS_STAND[b]
      const dx=pb[0]-pa[0], dy=pb[1]-pa[1], dz=pb[2]-pa[2]
      d[`${a}-${b}`] = Math.sqrt(dx*dx + dy*dy + dz*dz)
    }
  }
  return d
})()

// ===== ベクトルを指定長にリスケール（親→子の方向を保ちつつ長さ固定） =====
function fixBoneLen(joints, parentKey, childKey, targetLen) {
  const p = joints[parentKey], c = joints[childKey]
  const dx=c[0]-p[0], dy=c[1]-p[1], dz=c[2]-p[2]
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz)
  if (len < 1e-6) return
  const s = targetLen / len
  joints[childKey] = [p[0]+dx*s, p[1]+dy*s, p[2]+dz*s]
}

// ===== 関節補間 + 脚の骨長を正規化 =====
function interpJoints(t) {
  const out = {}
  for (const key of Object.keys(JOINTS_STAND)) {
    const s = JOINTS_STAND[key], q = JOINTS_SQUAT[key]
    out[key] = [lerp(s[0],q[0],t), lerp(s[1],q[1],t), lerp(s[2],q[2],t)]
  }

  // 足首は床に固定 → 足首から膝へ、膝から股関節へと順番に長さを保証
  for (const side of ['L', 'R']) {
    const ankle = `ankle${side}`, knee = `knee${side}`, hip = `hip${side}`
    fixBoneLen(out, ankle, knee, LEG_BONE_LENGTHS[`${ankle}-${knee}`])
    fixBoneLen(out, knee,  hip,  LEG_BONE_LENGTHS[`${knee}-${hip}` ])
  }

  return out
}

// ===== 投影 =====
const C30 = Math.cos(Math.PI/6), S30 = Math.sin(Math.PI/6)
const VIEWS = {
  front:    ([x,y])    => [x, y],
  side:     ([,y,z])   => [z*2.2, y],
  diagonal: ([x,y,z])  => [x*C30+z*S30, y],
}

// ===== Canvas 座標変換 =====
function makeToCanvas(sectionX, sectionW, sectionH) {
  const XRANGE = 0.35, YPAD = 0.05
  return ([nx, ny]) => ({
    cx: sectionX + (nx + XRANGE) / (XRANGE * 2) * sectionW,
    cy: (ny + YPAD) / (1 + YPAD * 2) * sectionH,
  })
}

// ===== カプセル（丸みのある棒）描画 =====
function drawCapsule(ctx, ax, ay, bx, by, r, fill, stroke, alpha = 1) {
  const dx = bx - ax, dy = by - ay
  const len = Math.sqrt(dx*dx + dy*dy)
  if (len < 1) return
  const px = -dy/len*r, py = dx/len*r

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(ax+px, ay+py)
  ctx.lineTo(bx+px, by+py)
  ctx.arc(bx, by, r, Math.atan2(py,px), Math.atan2(-py,-px))
  ctx.lineTo(ax-px, ay-py)
  ctx.arc(ax, ay, r, Math.atan2(-py,-px), Math.atan2(py,px))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke() }
  ctx.restore()
}

// ===== 胴体台形 =====
function drawTorso(ctx, sL, sR, hL, hR, fill, stroke, alpha = 1) {
  if (!sL||!sR||!hL||!hR) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(sL.cx, sL.cy); ctx.lineTo(sR.cx, sR.cy)
  ctx.lineTo(hR.cx, hR.cy); ctx.lineTo(hL.cx, hL.cy)
  ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke() }
  ctx.restore()
}

// ===== 1ビュー描画（棒人間モード） =====
function drawStickMode(ctx, pj, sectionX, sectionW, sectionH, viewLabel, viewColor, feedback) {
  const lw = Math.max(2, sectionW/55)
  const jr = Math.max(4, sectionW/40)

  CONNECTIONS.forEach(([a,b]) => {
    if (!pj[a]||!pj[b]) return
    const isRight = a.includes('R')||b.includes('R')
    const isLeg   = /knee|ankle|toe|hip/.test(a+b)
    ctx.save()
    ctx.globalAlpha   = isRight ? 0.55 : 1.0
    ctx.strokeStyle   = isLeg ? (isRight?'#7c3aed':'#a78bfa') : (isRight?'#047857':'#34d399')
    ctx.lineWidth = lw; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(pj[a].cx,pj[a].cy); ctx.lineTo(pj[b].cx,pj[b].cy)
    ctx.stroke(); ctx.restore()
  })

  ;['shoulderL','shoulderR','elbowL','elbowR','hipL','hipR','kneeL','kneeR','ankleL','ankleR'].forEach(n => {
    if (!pj[n]) return
    const isRight = n.includes('R')
    ctx.beginPath()
    ctx.arc(pj[n].cx, pj[n].cy, jr*(isRight?0.65:1), 0, Math.PI*2)
    ctx.fillStyle = isRight ? '#92400e' : '#fbbf24'
    ctx.fill()
  })

  // 頭
  const hp = pj['head']
  if (hp) {
    const hr = Math.max(10, sectionW/20)
    ctx.beginPath(); ctx.arc(hp.cx, hp.cy, hr, 0, Math.PI*2)
    ctx.fillStyle = '#1e40af'; ctx.fill()
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = lw*0.8; ctx.stroke()
    ;[-1,1].forEach(s => {
      ctx.beginPath(); ctx.arc(hp.cx+s*hr*0.3, hp.cy-hr*0.1, hr*0.14, 0, Math.PI*2)
      ctx.fillStyle = '#e2e8f0'; ctx.fill()
    })
  }
}

// ===== 1ビュー描画（人体モード） =====
function drawBodyMode(ctx, pj, sectionW, sectionH) {
  const h = sectionH
  // 各部位の太さ（セクション高さに比例）
  const R = {
    neck:    h * 0.022,
    upperArm:h * 0.030,
    forearm: h * 0.022,
    thigh:   h * 0.042,
    shin:    h * 0.030,
    foot:    h * 0.018,
  }
  // 頭
  const headR = Math.max(h * 0.068, 10)

  // --- 色定義 ---
  const C = {
    bodyFillL:   'rgba(29, 78, 216, 0.82)',
    bodyFillR:   'rgba(29, 78, 216, 0.42)',
    strokeL:     '#60a5fa',
    strokeR:     '#3b82f6',
    legFillL:    'rgba(109, 40, 217, 0.82)',
    legFillR:    'rgba(109, 40, 217, 0.42)',
    legStrokeL:  '#a78bfa',
    legStrokeR:  '#7c3aed',
    footFillL:   'rgba(146, 64, 14, 0.82)',
    footStrokeL: '#f59e0b',
    torsoFill:   'rgba(23, 37, 84, 0.88)',
    torsoStroke: '#60a5fa',
    headFill:    '#1e3a8a',
    headStroke:  '#60a5fa',
  }

  const g = (name) => pj[name]

  // ── 奥側（右）を先に描画 ──
  // 右腕
  if (g('shoulderR')&&g('elbowR'))
    drawCapsule(ctx, g('shoulderR').cx,g('shoulderR').cy, g('elbowR').cx,g('elbowR').cy, R.upperArm, C.bodyFillR, C.strokeR, 1)
  if (g('elbowR')&&g('wristR'))
    drawCapsule(ctx, g('elbowR').cx,g('elbowR').cy, g('wristR').cx,g('wristR').cy, R.forearm, C.bodyFillR, C.strokeR, 1)
  // 右脚
  if (g('hipR')&&g('kneeR'))
    drawCapsule(ctx, g('hipR').cx,g('hipR').cy, g('kneeR').cx,g('kneeR').cy, R.thigh, C.legFillR, C.legStrokeR, 1)
  if (g('kneeR')&&g('ankleR'))
    drawCapsule(ctx, g('kneeR').cx,g('kneeR').cy, g('ankleR').cx,g('ankleR').cy, R.shin, C.legFillR, C.legStrokeR, 1)
  if (g('ankleR')&&g('toeR'))
    drawCapsule(ctx, g('ankleR').cx,g('ankleR').cy, g('toeR').cx,g('toeR').cy, R.foot, C.legFillR, C.legStrokeR, 1)

  // ── 胴体（中央）──
  drawTorso(ctx, g('shoulderL'),g('shoulderR'),g('hipL'),g('hipR'), C.torsoFill, C.torsoStroke, 1)
  // 首
  if (g('neck')&&g('shoulderL')&&g('shoulderR')) {
    const mx = (g('shoulderL').cx+g('shoulderR').cx)/2
    const my = (g('shoulderL').cy+g('shoulderR').cy)/2
    drawCapsule(ctx, g('neck').cx,g('neck').cy, mx,my, R.neck, C.bodyFillL, C.strokeL, 1)
  }

  // ── 手前側（左）──
  // 左腕
  if (g('shoulderL')&&g('elbowL'))
    drawCapsule(ctx, g('shoulderL').cx,g('shoulderL').cy, g('elbowL').cx,g('elbowL').cy, R.upperArm, C.bodyFillL, C.strokeL, 1)
  if (g('elbowL')&&g('wristL'))
    drawCapsule(ctx, g('elbowL').cx,g('elbowL').cy, g('wristL').cx,g('wristL').cy, R.forearm, C.bodyFillL, C.strokeL, 1)
  // 左脚
  if (g('hipL')&&g('kneeL'))
    drawCapsule(ctx, g('hipL').cx,g('hipL').cy, g('kneeL').cx,g('kneeL').cy, R.thigh, C.legFillL, C.legStrokeL, 1)
  if (g('kneeL')&&g('ankleL'))
    drawCapsule(ctx, g('kneeL').cx,g('kneeL').cy, g('ankleL').cx,g('ankleL').cy, R.shin, C.legFillL, C.legStrokeL, 1)
  if (g('ankleL')&&g('toeL'))
    drawCapsule(ctx, g('ankleL').cx,g('ankleL').cy, g('toeL').cx,g('toeL').cy, R.foot, C.footFillL, C.footStrokeL, 1)

  // ── 頭 ──
  const hp = g('head')
  if (hp) {
    // 頭部（球体っぽく）
    const grad = ctx.createRadialGradient(
      hp.cx - headR*0.3, hp.cy - headR*0.3, headR*0.1,
      hp.cx, hp.cy, headR
    )
    grad.addColorStop(0, '#3b82f6')
    grad.addColorStop(1, '#1e3a8a')
    ctx.beginPath(); ctx.arc(hp.cx, hp.cy, headR, 0, Math.PI*2)
    ctx.fillStyle = grad; ctx.fill()
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.stroke()

    // 目
    ;[-1,1].forEach(s => {
      ctx.beginPath()
      ctx.arc(hp.cx+s*headR*0.30, hp.cy-headR*0.12, headR*0.13, 0, Math.PI*2)
      ctx.fillStyle = '#e2e8f0'; ctx.fill()
    })
    // 口
    ctx.beginPath()
    ctx.arc(hp.cx, hp.cy+headR*0.22, headR*0.22, 0.1*Math.PI, 0.9*Math.PI)
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // ── 関節（発光点）──
  ;['kneeL','kneeR','elbowL','elbowR','hipL','hipR','ankleL','ankleR','shoulderL','shoulderR'].forEach(n => {
    if (!pj[n]) return
    const isRight = n.includes('R')
    const r2 = Math.max(4, sectionW/48)
    ctx.save()
    ctx.shadowColor = isRight ? '#7c3aed' : '#60a5fa'
    ctx.shadowBlur  = 8
    ctx.beginPath(); ctx.arc(pj[n].cx, pj[n].cy, r2, 0, Math.PI*2)
    ctx.fillStyle = isRight ? '#a78bfa' : '#fbbf24'
    ctx.fill(); ctx.restore()
  })
}

// ===== シルエットモード =====
function drawSilhouetteMode(ctx, pj, sectionW, sectionH) {
  const h = sectionH
  const R = {
    neck: h*0.028, upperArm: h*0.036, forearm: h*0.028,
    thigh: h*0.050, shin: h*0.036, foot: h*0.022,
  }
  const headR = Math.max(h*0.072, 10)
  const fill   = 'rgba(15, 23, 42, 0.92)'
  const stroke = 'rgba(96,165,250,0.7)'
  const g = (n) => pj[n]

  const parts = [
    // 右（後ろ）
    ['shoulderR','elbowR',R.upperArm],['elbowR','wristR',R.forearm],
    ['hipR','kneeR',R.thigh],['kneeR','ankleR',R.shin],['ankleR','toeR',R.foot],
  ]
  const partsL = [
    ['shoulderL','elbowL',R.upperArm],['elbowL','wristL',R.forearm],
    ['hipL','kneeL',R.thigh],['kneeL','ankleL',R.shin],['ankleL','toeL',R.foot],
  ]

  parts.forEach(([a,b,r]) => {
    if (g(a)&&g(b)) drawCapsule(ctx,g(a).cx,g(a).cy,g(b).cx,g(b).cy,r,fill,stroke,0.55)
  })
  // 胴体
  drawTorso(ctx,g('shoulderL'),g('shoulderR'),g('hipL'),g('hipR'),fill,stroke,0.85)
  partsL.forEach(([a,b,r]) => {
    if (g(a)&&g(b)) drawCapsule(ctx,g(a).cx,g(a).cy,g(b).cx,g(b).cy,r,fill,stroke,1)
  })

  // 頭
  if (g('head')) {
    ctx.save()
    ctx.shadowColor = '#60a5fa'; ctx.shadowBlur = 12
    ctx.beginPath(); ctx.arc(g('head').cx, g('head').cy, headR, 0, Math.PI*2)
    ctx.fillStyle = fill; ctx.fill()
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke()
    ctx.restore()
  }
}

// ===== フィードバック吹き出し =====
const JOINT_MAP = [
  { patterns:[/しゃがも|しゃがん|もっと深|膝.*曲げ/],  joint:'kneeL',  side:'left'  },
  { patterns:[/前傾しすぎ|上体.*前|股関節の深/],        joint:'hipL',   side:'left'  },
  { patterns:[/背中|前傾.*°|上体.*起こ/],               joint:'neck',   side:'right' },
  { patterns:[/膝.*OK|膝のポジション/],                 joint:'kneeL',  side:'right' },
  { patterns:[/股関節.*OK/],                            joint:'hipL',   side:'right' },
  { patterns:[/足幅|肩幅/],                             joint:'ankleL', side:'left'  },
]
function resolveJoint(text) {
  for (const {patterns,joint,side} of JOINT_MAP) {
    if (patterns.some(p=>p.test(text))) return {joint,side}
  }
  return {joint:'neck', side:'right'}
}
function drawFeedbackAnnotations(ctx, pj, feedback, sectionX, sectionW) {
  const msgs = [
    ...feedback.filter(f=>f.type==='warn'||f.type==='danger'),
    ...feedback.filter(f=>f.type==='good'),
  ].slice(0,3)
  const drawn = new Set()
  for (const fb of msgs) {
    const {joint,side} = resolveJoint(fb.text)
    if (drawn.has(joint)) continue
    drawn.add(joint)
    const pt = pj[joint]; if (!pt) continue
    const isWarn    = fb.type!=='good'
    const bubbleW   = Math.min(sectionW*0.62, 130)
    const bubbleH   = 22
    const arrowLen  = 14
    const fillColor = isWarn?'rgba(239,68,68,0.90)':'rgba(34,197,94,0.90)'
    const lineColor = isWarn?'#ef4444':'#22c55e'
    const {cx,cy}   = pt
    const bx = side==='left'
      ? Math.max(sectionX+2, cx-arrowLen-bubbleW)
      : Math.min(sectionX+sectionW-bubbleW-2, cx+arrowLen)
    const by = cy-bubbleH/2
    ctx.beginPath(); ctx.strokeStyle=lineColor; ctx.lineWidth=1.5
    ctx.setLineDash([3,2])
    const tipX = side==='left'?bx+bubbleW:bx
    ctx.moveTo(cx,cy); ctx.lineTo(tipX,cy); ctx.stroke()
    ctx.setLineDash([])
    const d = side==='left'?1:-1
    ctx.beginPath(); ctx.fillStyle=lineColor
    ctx.moveTo(cx,cy); ctx.lineTo(cx+d*6,cy-3); ctx.lineTo(cx+d*6,cy+3)
    ctx.closePath(); ctx.fill()
    const r=5
    ctx.beginPath()
    ctx.moveTo(bx+r,by); ctx.lineTo(bx+bubbleW-r,by)
    ctx.quadraticCurveTo(bx+bubbleW,by,bx+bubbleW,by+r)
    ctx.lineTo(bx+bubbleW,by+bubbleH-r)
    ctx.quadraticCurveTo(bx+bubbleW,by+bubbleH,bx+bubbleW-r,by+bubbleH)
    ctx.lineTo(bx+r,by+bubbleH)
    ctx.quadraticCurveTo(bx,by+bubbleH,bx,by+bubbleH-r)
    ctx.lineTo(bx,by+r)
    ctx.quadraticCurveTo(bx,by,bx+r,by); ctx.closePath()
    ctx.fillStyle=fillColor; ctx.fill()
    ctx.fillStyle='#fff'
    ctx.font=`bold ${Math.max(9,Math.min(11,bubbleW/9))}px 'Segoe UI', sans-serif`
    ctx.textAlign='center'
    let text=fb.text
    const maxW=bubbleW-8
    while(ctx.measureText(text).width>maxW&&text.length>4) text=text.slice(0,-1)
    if(text!==fb.text) text=text.slice(0,-1)+'…'
    ctx.fillText(text, bx+bubbleW/2, by+bubbleH*0.68)
    ctx.textAlign='left'
  }
}

// ===== 1ビューのラベル・床・共通要素 =====
function drawViewCommon(ctx, pj, sectionX, sectionW, sectionH, viewLabel, viewColor) {
  // 床ライン
  const toCanvas = makeToCanvas(sectionX, sectionW, sectionH)
  ctx.strokeStyle = 'rgba(96,165,250,0.25)'; ctx.lineWidth=1.5
  ctx.beginPath()
  const floorY = toCanvas([0,0.94]).cy
  ctx.moveTo(sectionX+sectionW*0.08, floorY)
  ctx.lineTo(sectionX+sectionW*0.92, floorY)
  ctx.stroke()
  // ビュー名ラベル
  ctx.font      = `bold ${Math.max(10,sectionW/18)}px 'Segoe UI', sans-serif`
  ctx.fillStyle = viewColor; ctx.textAlign='center'
  ctx.fillText(viewLabel, sectionX+sectionW/2, sectionH*0.97)
  ctx.textAlign='left'
}

// ===== メイン描画 =====
function drawAll(ctx, w, h, phase, feedback, drawMode) {
  ctx.clearRect(0,0,w,h)
  ctx.fillStyle='rgba(2,6,23,0.95)'; ctx.fillRect(0,0,w,h)

  // グリッド
  ctx.strokeStyle='rgba(96,165,250,0.05)'; ctx.lineWidth=1
  for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
  for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}

  // セクション仕切り線
  ctx.strokeStyle='rgba(96,165,250,0.18)'; ctx.lineWidth=1
  const sw=w/3
  ctx.beginPath();ctx.moveTo(sw,0);ctx.lineTo(sw,h);ctx.stroke()
  ctx.beginPath();ctx.moveTo(sw*2,0);ctx.lineTo(sw*2,h);ctx.stroke()

  const joints = interpJoints(phase)
  const views = [
    {label:'正面',    color:'#60a5fa', project:VIEWS.front   },
    {label:'真横',    color:'#34d399', project:VIEWS.side    },
    {label:'斜め30°', color:'#c084fc', project:VIEWS.diagonal},
  ]

  views.forEach(({label,color,project}, i) => {
    const sx = i*sw
    const toCanvas = makeToCanvas(sx, sw, h)
    const pj = {}
    for(const [name,coords] of Object.entries(joints))
      pj[name] = toCanvas(project(coords))

    drawViewCommon(ctx, pj, sx, sw, h, label, color)

    if (drawMode === 'body') {
      drawBodyMode(ctx, pj, sw, h)
    } else if (drawMode === 'silhouette') {
      drawSilhouetteMode(ctx, pj, sw, h)
    } else {
      drawStickMode(ctx, pj, sx, sw, h, label, color, i===0?feedback:[])
    }

    // フィードバック吹き出しは正面ビューのみ
    if (i===0 && feedback && feedback.length>0) {
      drawFeedbackAnnotations(ctx, pj, feedback, sx, sw)
    }
  })
}

// ===== React コンポーネント =====
export default function StickFigure3D({ phase=0, feedback=[], drawMode='stick' }) {
  const canvasRef  = useRef(null)
  const phaseRef   = useRef(phase)
  const feedRef    = useRef(feedback)
  const modeRef    = useRef(drawMode)

  useEffect(()=>{ phaseRef.current = phase },    [phase])
  useEffect(()=>{ feedRef.current  = feedback }, [feedback])
  useEffect(()=>{ modeRef.current  = drawMode }, [drawMode])

  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = ()=>{
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width  || 600
      canvas.height = rect.height || 400
      drawAll(ctx, canvas.width, canvas.height, phaseRef.current, feedRef.current, modeRef.current)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)
    resize()
    return ()=>ro.disconnect()
  }, [])

  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d')
    drawAll(ctx, canvas.width, canvas.height, phase, feedback, drawMode)
  }, [phase, feedback, drawMode])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={400}
      style={{width:'100%', height:'100%', display:'block'}}
    />
  )
}
