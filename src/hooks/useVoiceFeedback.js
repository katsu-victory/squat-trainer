import { useEffect, useRef } from 'react'

// 同じメッセージを連続して言わないようにするクールダウン（秒）
const COOLDOWN_MS = 5000
// フォーム警告のメッセージだけ読み上げる（goodは黙認）
const SPEAK_TYPES = ['warn', 'danger']

export function useVoiceFeedback(feedback, enabled = true) {
  const lastSpokenRef = useRef({})   // { text: timestamp }
  const synthRef = useRef(null)

  useEffect(() => {
    synthRef.current = window.speechSynthesis
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (!synthRef.current) return
    if (!feedback || feedback.length === 0) return

    const now = Date.now()

    // warn / danger のメッセージのみ抽出
    const targets = feedback.filter(f => SPEAK_TYPES.includes(f.type))
    if (targets.length === 0) return

    // 最初の1件だけ読む（複数同時だとうるさい）
    const msg = targets[0].text

    // クールダウン内なら読まない
    const last = lastSpokenRef.current[msg] || 0
    if (now - last < COOLDOWN_MS) return

    lastSpokenRef.current[msg] = now

    // 既に喋っていたらキャンセル
    synthRef.current.cancel()

    const utterance = new SpeechSynthesisUtterance(msg)
    utterance.lang = 'ja-JP'
    utterance.rate = 1.1   // 少し速め
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // 日本語音声を優先して選択
    const voices = synthRef.current.getVoices()
    const jaVoice = voices.find(v => v.lang === 'ja-JP') ||
                    voices.find(v => v.lang.startsWith('ja'))
    if (jaVoice) utterance.voice = jaVoice

    synthRef.current.speak(utterance)
  }, [feedback, enabled])

  // 音声を止める関数を返す
  const stop = () => synthRef.current?.cancel()

  return { stop }
}
