// Shim for @mediapipe/pose — wraps the CJS IIFE into proper ES named exports
// The original pose.js attaches to globalThis via G("Pose", ...)

// Load the script in browser context (it sets window.Pose etc.)
import '/node_modules/@mediapipe/pose/pose.js'

export const Pose = globalThis.Pose
export const POSE_CONNECTIONS = globalThis.POSE_CONNECTIONS
export const POSE_LANDMARKS = globalThis.POSE_LANDMARKS
export const VERSION = globalThis.VERSION
