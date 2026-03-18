import { useEffect, useRef, useState, useCallback } from 'react'

// Lazy-load TF.js to avoid blocking UI
let poseDetector = null
let isLoading = false

async function loadDetector() {
  if (poseDetector) return poseDetector
  if (isLoading) return null
  isLoading = true
  try {
    const tf = await import('@tensorflow/tfjs')
    await tf.ready()
    const poseDetection = await import('@tensorflow-models/pose-detection')
    poseDetector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      }
    )
    console.log('[PoseDetection] MoveNet loaded')
    return poseDetector
  } catch (e) {
    console.error('[PoseDetection] Load error:', e)
    isLoading = false
    return null
  }
}

export function usePoseDetection(videoRef, isActive) {
  const [keypoints, setKeypoints] = useState(null)
  const [isModelReady, setIsModelReady] = useState(false)
  const animFrameRef = useRef(null)
  const detectorRef = useRef(null)

  // Load model
  useEffect(() => {
    loadDetector().then(det => {
      if (det) {
        detectorRef.current = det
        setIsModelReady(true)
      }
    })
  }, [])

  // Detection loop
  const detect = useCallback(async () => {
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detect)
      return
    }
    try {
      const poses = await detector.estimatePoses(video)
      if (poses && poses.length > 0) {
        setKeypoints(poses[0].keypoints)
      }
    } catch (e) {
      // silent fail on single frame
    }
    animFrameRef.current = requestAnimationFrame(detect)
  }, [videoRef])

  useEffect(() => {
    if (!isActive || !isModelReady) return
    animFrameRef.current = requestAnimationFrame(detect)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isActive, isModelReady, detect])

  return { keypoints, isModelReady }
}

// MoveNet keypoint indices
export const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
}

// Calculate angle at joint B formed by A-B-C
export function calcAngle(A, B, C) {
  if (!A || !B || !C) return null
  const ab = { x: A.x - B.x, y: A.y - B.y }
  const cb = { x: C.x - B.x, y: C.y - B.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const mag = Math.sqrt((ab.x ** 2 + ab.y ** 2) * (cb.x ** 2 + cb.y ** 2))
  if (mag === 0) return null
  return Math.round(Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI))
}

export function getKP(keypoints, index, minScore = 0.3) {
  if (!keypoints) return null
  const kp = keypoints[index]
  if (!kp || kp.score < minScore) return null
  return kp
}
