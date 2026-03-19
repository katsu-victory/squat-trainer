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
  for (const side of ['L', 'R']) {
    const ankle = `ankle${side}`, knee = `knee${side}`, hip = `hip${side}`
    fixBoneLen(out, ankle, knee, LEG_BONE_LENGTHS[`${ankle}-${knee}`])
    fixBoneLen(out, knee,  hip,  LEG_BONE_LENGTHS[`${knee}-${hip}` ])
  }
  return out
}

// ===== 投影定義（投影関数 + キャンバスマッピングパラメータ） =====
const C30 = Math.cos(Math.PI/6), S30 = Math.sin(Math.PI/6)
const VIEWS = {
  front:    { label:'正面',    color:'#60a5fa', proj:([x,y])    => [x,            y], xc: 0.00, xspan: 0.65 },
  side:     { label:'真横',    color:'#34d399', proj:([,y,z])   => [z,            y], xc: 0.05, xspan: 0.42 },
  diagonal: { label:'斜め30°', color:'#c084fc', proj:([x,y,z])  => [x*C30+z*S30, y], xc: 0.04, xspan: 0.60 },
}

// ===== Canvas 座標変換（ビューごとに中心・範囲を調整） =====
function makeToCanvas(w, h, xc, xspan, ypad = 0.06) {
  return ([nx, ny]) => ({
    cx: ((nx - xc) / xspan + 0.5) * w,
    cy: (ny + ypad) / (1 + ypad * 2) * h,
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

// ===== 胴体台形（正面・斜めビュー用） =====
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
function drawStickMode(ctx, pj, w, h, viewColor, feedback) {
  const lw = Math.max(2, w/55)
  const jr = Math.max(4, w/40)

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

  // 頭（表情なし）
  const hp = pj['head']
  if (hp) {
    const hr = Math.max(10, w/20)
    ctx.beginPath(); ctx.arc(hp.cx, hp.cy, hr, 0, Math.PI*2)
    ctx.fillStyle = '#1e40af'; ctx.fill()
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = lw*0.8; ctx.stroke()
  }
}

// ===== 1ビュー描画（人体モード） =====
function drawBodyMode(ctx, pj, w, h, viewName) {
  const R = {
    neck:    h * 0.022,
    upperArm:h * 0.030,
    forearm: h * 0.022,
    thigh:   h * 0.042,
    shin:    h * 0.030,
    foot:    h * 0.018,
    spine:   h * 0.052,   // 真横ビュー用の背骨カプセル半径
  }
  const headR = Math.max(h * 0.068, 10)

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
  }

  const g = (name) => pj[name]
  const isSideish = viewName === 'side'

  // ── 奥側（右）を先に描画 ──
  if (!isSideish) {
    if (g('shoulderR')&&g('elbowR'))
      drawCapsule(ctx, g('shoulderR').cx,g('shoulderR').cy, g('elbowR').cx,g('elbowR').cy, R.upperArm, C.bodyFillR, C.strokeR, 1)
    if (g('elbowR')&&g('wristR'))
      drawCapsule(ctx, g('elbowR').cx,g('elbowR').cy, g('wristR').cx,g('wristR').cy, R.forearm, C.bodyFillR, C.strokeR, 1)
    if (g('hipR')&&g('kneeR'))
      drawCapsule(ctx, g('hipR').cx,g('hipR').cy, g('kneeR').cx,g('kneeR').cy, R.thigh, C.legFillR, C.legStrokeR, 1)
    if (g('kneeR')&&g('ankleR'))
      drawCapsule(ctx, g('kneeR').cx,g('kneeR').cy, g('ankleR').cx,g('ankleR').cy, R.shin, C.legFillR, C.legStrokeR, 1)
    if (g('ankleR')&&g('toeR'))
      drawCapsule(ctx, g('ankleR').cx,g('ankleR').cy, g('toeR').cx,g('toeR').cy, R.foot, C.legFillR, C.legStrokeR, 1)
  }

  // ── 胴体 ──
  if (isSideish) {
    // 真横ビュー: 背骨カプセルで胴体を表現（台形は線になるため）
    const neck = g('neck'), hipL = g('hipL'), hipR = g('hipR')
    if (neck && hipL && hipR) {
      const hx = (hipL.cx + hipR.cx) / 2
      const hy = (hipL.cy + hipR.cy) / 2
      drawCapsule(ctx, neck.cx, neck.cy, hx, hy, R.spine, C.torsoFill, C.torsoStroke, 1)
    }
  } else {
    drawTorso(ctx, g('shoulderL'),g('shoulderR'),g('hipL'),g('hipR'), C.torsoFill, C.torsoStroke, 1)
  }

  // 首
  if (g('neck')&&g('shoulderL')&&g('shoulderR')) {
    const mx = (g('shoulderL').cx+g('shoulderR').cx)/2
    const my = (g('shoulderL').cy+g('shoulderR').cy)/2
    drawCapsule(ctx, g('neck').cx,g('neck').cy, mx,my, R.neck, C.bodyFillL, C.strokeL, 1)
  }

  // ── 手前側（左） ──
  if (g('shoulderL')&&g('elbowL'))
    drawCapsule(ctx, g('shoulderL').cx,g('shoulderL').cy, g('elbowL').cx,g('elbowL').cy, R.upperArm, C.bodyFillL, C.strokeL, 1)
  if (g('elbowL')&&g('wristL'))
    drawCapsule(ctx, g('elbowL').cx,g('elbowL').cy, g('wristL').cx,g('wristL').cy, R.forearm, C.bodyFillL, C.strokeL, 1)
  if (g('hipL')&&g('kneeL'))
    drawCapsule(ctx, g('hipL').cx,g('hipL').cy, g('kneeL').cx,g('kneeL').cy, R.thigh, C.legFillL, C.legStrokeL, 1)
  if (g('kneeL')&&g('ankleL'))
    drawCapsule(ctx, g('kneeL').cx,g('kneeL').cy, g('ankleL').cx,g('ankleL').cy, R.shin, C.legFillL, C.legStrokeL, 1)
  if (g('ankleL')&&g('toeL'))
    drawCapsule(ctx, g('ankleL').cx,g('ankleL').cy, g('toeL').cx,g('toeL').cy, R.foot, C.footFillL, C.footStrokeL, 1)

  // ── 頭（表情なし・グラデーション球） ──
  const hp = g('head')
  if (hp) {
    const grad = ctx.createRadialGradient(
      hp.cx - headR*0.3, hp.cy - headR*0.3, headR*0.1,
      hp.cx, hp.cy, headR
    )
    grad.addColorStop(0, '#3b82f6')
    grad.addColorStop(1, '#1e3a8a')
    ctx.beginPath(); ctx.arc(hp.cx, hp.cy, headR, 0, Math.PI*2)
    ctx.fillStyle = grad; ctx.fill()
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // ── 関節（発光点）──
  ;['kneeL','kneeR','elbowL','elbowR','hipL','hipR','ankleL','ankleR','shoulderL','shoulderR'].forEach(n => {
    if (!pj[n]) return
    const isRight = n.includes('R')
    const r2 = Math.max(4, w/48)
    ctx.save()
    ctx.shadowColor = isRight ? '#7c3aed' : '#60a5fa'
    ctx.shadowBlur  = 8
    ctx.beginPath(); ctx.arc(pj[n].cx, pj[n].cy, r2, 0, Math.PI*2)
    ctx.fillStyle = isRight ? '#a78bfa' : '#fbbf24'
    ctx.fill(); ctx.restore()
  })
}

// ===== シルエットモード =====
function drawSilhouetteMode(ctx, pj, w, h, viewName) {
  const R = {
    neck: h*0.028, upperArm: h*0.036, forearm: h*0.028,
    thigh: h*0.050, shin: h*0.036, foot: h*0.022,
    spine: h*0.060,
  }
  const headR = Math.max(h*0.072, 10)
  const fill   = 'rgba(15, 23, 42, 0.92)'
  const stroke = 'rgba(96,165,250,0.7)'
  const g = (n) => pj[n]
  const isSideish = viewName === 'side'

  // 右（奥）
  if (!isSideish) {
    ;[['shoulderR','elbowR',R.upperArm],['elbowR','wristR',R.forearm],
      ['hipR','kneeR',R.thigh],['kneeR','ankleR',R.shin],['ankleR','toeR',R.foot],
    ].forEach(([a,b,r]) => {
      if (g(a)&&g(b)) drawCapsule(ctx,g(a).cx,g(a).cy,g(b).cx,g(b).cy,r,fill,stroke,0.55)
    })
  }

  // 胴体
  if (isSideish) {
    const neck = g('neck'), hipL = g('hipL'), hipR = g('hipR')
    if (neck && hipL && hipR) {
      const hx = (hipL.cx + hipR.cx) / 2
      const hy = (hipL.cy + hipR.cy) / 2
      drawCapsule(ctx, neck.cx, neck.cy, hx, hy, R.spine, fill, stroke, 0.90)
    }
  } else {
    drawTorso(ctx,g('shoulderL'),g('shoulderR'),g('hipL'),g('hipR'),fill,stroke,0.85)
  }

  // 左（手前）
  ;[['shoulderL','elbowL',R.upperArm],['elbowL','wristL',R.forearm],
    ['hipL','kneeL',R.thigh],['kneeL','ankleL',R.shin],['ankleL','toeL',R.foot],
  ].forEach(([a,b,r]) => {
    if (g(a)&&g(b)) drawCapsule(ctx,g(a).cx,g(a).cy,g(b).cx,g(b).cy,r,fill,stroke,1)
  })

  // 頭（表情なし）
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
function drawFeedbackAnnotations(ctx, pj, feedback, w) {
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
    const bubbleW   = Math.min(w*0.45, 150)
    const bubbleH   = 22
    const arrowLen  = 14
    const fillColor = isWarn?'rgba(239,68,68,0.90)':'rgba(34,197,94,0.90)'
    const lineColor = isWarn?'#ef4444':'#22c55e'
    const {cx,cy}   = pt
    const bx = side==='left'
      ? Math.max(2, cx-arrowLen-bubbleW)
      : Math.min(w-bubbleW-2, cx+arrowLen)
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

// ===== 床ライン＋ビューラベル =====
function drawViewCommon(ctx, w, h, label, color, toCanvas) {
  ctx.strokeStyle = 'rgba(96,165,250,0.25)'; ctx.lineWidth=1.5
  ctx.beginPath()
  const floorY = toCanvas([0, 0.94]).cy
  ctx.moveTo(w*0.08, floorY); ctx.lineTo(w*0.92, floorY)
  ctx.stroke()
  ctx.font      = `bold ${Math.max(11, w/28)}px 'Segoe UI', sans-serif`
  ctx.fillStyle = color; ctx.textAlign='center'
  ctx.fillText(label, w/2, h*0.97)
  ctx.textAlign='left'
}

// ===== メイン描画（シングルビュー） =====
function drawAll(ctx, w, h, phase, feedback, drawMode, viewAngle) {
  ctx.clearRect(0,0,w,h)
  ctx.fillStyle='rgba(2,6,23,0.95)'; ctx.fillRect(0,0,w,h)

  // グリッド
  ctx.strokeStyle='rgba(96,165,250,0.05)'; ctx.lineWidth=1
  for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
  for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}

  const view = VIEWS[viewAngle] || VIEWS.front
  const joints = interpJoints(phase)
  const toCanvas = makeToCanvas(w, h, view.xc, view.xspan)

  const pj = {}
  for (const [name, coords] of Object.entries(joints))
    pj[name] = toCanvas(view.proj(coords))

  drawViewCommon(ctx, w, h, view.label, view.color, toCanvas)

  if (drawMode === 'body') {
    drawBodyMode(ctx, pj, w, h, viewAngle)
  } else if (drawMode === 'silhouette') {
    drawSilhouetteMode(ctx, pj, w, h, viewAngle)
  } else {
    drawStickMode(ctx, pj, w, h, view.color, feedback)
  }

  // フィードバック吹き出し
  if (feedback && feedback.length > 0) {
    drawFeedbackAnnotations(ctx, pj, feedback, w)
  }
}

// ===== React コンポーネント =====
export default function StickFigure3D({ phase=0, feedback=[], drawMode='stick', viewAngle='front' }) {
  const canvasRef  = useRef(null)
  const phaseRef   = useRef(phase)
  const feedRef    = useRef(feedback)
  const modeRef    = useRef(drawMode)
  const viewRef    = useRef(viewAngle)

  useEffect(()=>{ phaseRef.current = phase },     [phase])
  useEffect(()=>{ feedRef.current  = feedback },  [feedback])
  useEffect(()=>{ modeRef.current  = drawMode },  [drawMode])
  useEffect(()=>{ viewRef.current  = viewAngle }, [viewAngle])

  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = ()=>{
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width  || 400
      canvas.height = rect.height || 400
      drawAll(ctx, canvas.width, canvas.height, phaseRef.current, feedRef.current, modeRef.current, viewRef.current)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)
    resize()
    return ()=>ro.disconnect()
  }, [])

  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d')
    drawAll(ctx, canvas.width, canvas.height, phase, feedback, drawMode, viewAngle)
  }, [phase, feedback, drawMode, viewAngle])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={400}
      style={{width:'100%', height:'100%', display:'block'}}
    />
  )
}
