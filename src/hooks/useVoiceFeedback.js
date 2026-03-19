import { useEffect, useRef } from 'react'

const COOLDOWN_MS = 5000
const SPEAK_TYPES = ['warn', 'danger']

// ブラウザによってはgetVoices()が非同期で読み込まれるため、
// voiceschangedイベントを待ってキャッシュする
let cachedVoices = []
if (typeof window !== 'undefined' && window.speechSynthesis) {
  const load = () => { cachedVoices = window.speechSynthesis.getVoices() }
  load()
  window.speechSynthesis.addEventListener('voiceschanged', load)
}

function getJaVoice() {
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices()
  return voices.find(v => v.lang === 'ja-JP') ||
         voices.find(v => v.lang.startsWith('ja')) ||
         null
}

export function useVoiceFeedback(feedback, enabled = true) {
  const lastSpokenRef = useRef({})

  useEffect(() => {
    if (!enabled) return
    if (!window.speechSynthesis) return
    if (!feedback || feedback.length === 0) return

    const now = Date.now()
    const targets = feedback.filter(f => SPEAK_TYPES.includes(f.type))
    if (targets.length === 0) return

    const msg = targets[0].text
    const last = lastSpokenRef.current[msg] || 0
    if (now - last < COOLDOWN_MS) return

    lastSpokenRef.current[msg] = now
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(msg)
    utterance.lang = 'ja-JP'
    utterance.rate = 1.05
    utterance.pitch = 1.0
    utterance.volume = 1.0

    const jaVoice = getJaVoice()
    if (jaVoice) utterance.voice = jaVoice

    window.speechSynthesis.speak(utterance)
  }, [feedback, enabled])

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  const stop = () => window.speechSynthesis?.cancel()
  return { stop }
}
