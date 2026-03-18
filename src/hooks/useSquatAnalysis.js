import { useState, useRef, useEffect } from 'react'
import { calcAngle, getKP, KP } from './usePoseDetection'

// Thresholds for correct squat form
const THRESHOLDS = {
  kneeAngleBottom:    { min: 70,  max: 110 }, // ideal: ~90°
  hipAngleBottom:     { min: 60,  max: 110 }, // ideal: ~80°
  backAngleVertical:  { max: 50  },            // lean forward < 50°
  kneeOverToe:        { max: 30  },            // knee not too far forward (px)
  squat_depth_ratio:  { min: 0.85 },           // hip y / knee y >= 0.85 means parallel
}

// States for rep counting
const SQUAT_STATE = { UP: 'up', DOWN: 'down' }

export function useSquatAnalysis(keypoints) {
  const [repCount, setRepCount] = useState(0)
  const [squatPhase, setSquatPhase] = useState(0)        // 0=standing, 1=squat
  const [feedback, setFeedback] = useState([])
  const [angles, setAngles] = useState({})
  const stateRef = useRef(SQUAT_STATE.UP)
  const phaseHistoryRef = useRef([])

  useEffect(() => {
    if (!keypoints) return

    const lShoulder = getKP(keypoints, KP.LEFT_SHOULDER)
    const rShoulder = getKP(keypoints, KP.RIGHT_SHOULDER)
    const lHip      = getKP(keypoints, KP.LEFT_HIP)
    const rHip      = getKP(keypoints, KP.RIGHT_HIP)
    const lKnee     = getKP(keypoints, KP.LEFT_KNEE)
    const rKnee     = getKP(keypoints, KP.RIGHT_KNEE)
    const lAnkle    = getKP(keypoints, KP.LEFT_ANKLE)
    const rAnkle    = getKP(keypoints, KP.RIGHT_ANKLE)

    // Use best available side (left preferred)
    const shoulder  = lShoulder || rShoulder
    const hip       = lHip || rHip
    const knee      = lKnee || rKnee
    const ankle     = lAnkle || rAnkle

    if (!hip || !knee || !ankle) return

    // --- Angle calculations ---
    const kneeAngle = shoulder && hip && knee && ankle
      ? calcAngle(hip, knee, ankle)
      : null

    const hipAngle = shoulder && hip && knee
      ? calcAngle(shoulder, hip, knee)
      : null

    // Back lean: angle of shoulder-hip vector from vertical
    const backAngle = shoulder && hip
      ? Math.round(Math.abs(Math.atan2(shoulder.x - hip.x, hip.y - shoulder.y) * 180 / Math.PI))
      : null

    const newAngles = { kneeAngle, hipAngle, backAngle }
    setAngles(newAngles)

    // --- Squat phase (0=standing, 1=squat bottom) ---
    // Normalized by how close knee angle is to 90° vs 170°
    let phase = 0
    if (kneeAngle !== null) {
      phase = Math.max(0, Math.min(1, (170 - kneeAngle) / (170 - 90)))
    }

    // Smooth phase with short history
    phaseHistoryRef.current.push(phase)
    if (phaseHistoryRef.current.length > 5) phaseHistoryRef.current.shift()
    const smoothPhase = phaseHistoryRef.current.reduce((a, b) => a + b, 0) / phaseHistoryRef.current.length
    setSquatPhase(smoothPhase)

    // --- Rep counting ---
    if (kneeAngle !== null) {
      const wasUp = stateRef.current === SQUAT_STATE.UP
      const isDown = kneeAngle < 115

      if (wasUp && isDown) {
        stateRef.current = SQUAT_STATE.DOWN
      } else if (!wasUp && kneeAngle > 155) {
        stateRef.current = SQUAT_STATE.UP
        setRepCount(c => c + 1)
      }
    }

    // --- Form feedback ---
    const msgs = []

    if (kneeAngle !== null) {
      if (phase > 0.5) {
        // In squat position — check depth
        if (kneeAngle > THRESHOLDS.kneeAngleBottom.max) {
          msgs.push({ type: 'warn', text: 'もっとしゃがもう！膝をさらに曲げて' })
        } else if (kneeAngle < THRESHOLDS.kneeAngleBottom.min) {
          msgs.push({ type: 'warn', text: '膝の曲げすぎ注意' })
        } else {
          msgs.push({ type: 'good', text: '膝の角度 OK！' })
        }

        if (hipAngle !== null) {
          if (hipAngle < THRESHOLDS.hipAngleBottom.min) {
            msgs.push({ type: 'warn', text: '上体が前傾しすぎ' })
          } else {
            msgs.push({ type: 'good', text: '股関節の深さ OK！' })
          }
        }
      }
    }

    if (backAngle !== null && backAngle > THRESHOLDS.backAngleVertical.max) {
      msgs.push({ type: 'warn', text: `背中を起こして (前傾 ${backAngle}°)` })
    } else if (backAngle !== null && phase > 0.3) {
      msgs.push({ type: 'good', text: '背中のポジション OK！' })
    }

    if (msgs.length === 0 && phase < 0.1) {
      msgs.push({ type: 'info', text: 'スクワット開始！膝を曲げて' })
    }

    setFeedback(msgs)
  }, [keypoints])

  const resetReps = () => setRepCount(0)

  return { repCount, squatPhase, feedback, angles, resetReps }
}
