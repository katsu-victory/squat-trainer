export default function FeedbackPanel({ repCount, angles, feedback, onReset, squatPhase }) {
  const { kneeAngle, hipAngle, backAngle } = angles || {}

  const phaseLabel = squatPhase > 0.6
    ? { label: 'ボトム', color: '#f59e0b' }
    : squatPhase > 0.2
    ? { label: '降下中', color: '#60a5fa' }
    : { label: 'スタンディング', color: '#34d399' }

  return (
    <div className="feedback-panel">
      {/* Rep Counter */}
      <div className="rep-counter">
        <div className="rep-number">{repCount}</div>
        <div className="rep-label">レップ</div>
        <button className="reset-btn" onClick={onReset}>リセット</button>
      </div>

      {/* Phase indicator */}
      <div className="phase-indicator">
        <span className="phase-dot" style={{ background: phaseLabel.color }} />
        <span className="phase-text" style={{ color: phaseLabel.color }}>{phaseLabel.label}</span>
      </div>

      {/* Angle display */}
      <div className="angle-grid">
        <AngleCard
          label="膝の角度"
          value={kneeAngle}
          unit="°"
          good={kneeAngle != null && kneeAngle >= 70 && kneeAngle <= 110}
          target="70–110°"
        />
        <AngleCard
          label="股関節角度"
          value={hipAngle}
          unit="°"
          good={hipAngle != null && hipAngle >= 60 && hipAngle <= 110}
          target="60–110°"
        />
        <AngleCard
          label="背中の傾き"
          value={backAngle}
          unit="°"
          good={backAngle != null && backAngle <= 45}
          target="≤ 45°"
        />
      </div>

      {/* Depth bar */}
      <div className="depth-bar-wrap">
        <div className="depth-bar-label">
          <span>しゃがみ深さ</span>
          <span>{Math.round(squatPhase * 100)}%</span>
        </div>
        <div className="depth-bar-track">
          <div
            className="depth-bar-fill"
            style={{
              width: `${squatPhase * 100}%`,
              background: squatPhase > 0.7
                ? '#22c55e'
                : squatPhase > 0.4
                ? '#f59e0b'
                : '#60a5fa'
            }}
          />
          <div className="depth-bar-marker" style={{ left: '70%' }} title="目標深さ" />
        </div>
        <div className="depth-bar-hint">
          {squatPhase > 0.7 ? '理想的な深さ！' : squatPhase > 0.4 ? 'もう少ししゃがもう' : 'スクワット開始'}
        </div>
      </div>

      {/* Form feedback messages */}
      <div className="feedback-messages">
        {feedback.length === 0
          ? <div className="feedback-item info">カメラに体全体を映してください</div>
          : feedback.map((f, i) => (
            <div key={i} className={`feedback-item ${f.type}`}>
              {f.type === 'good' ? '✓' : f.type === 'warn' ? '!' : 'i'} {f.text}
            </div>
          ))
        }
      </div>

      {/* Coaching tips */}
      <div className="tips-section">
        <div className="tips-title">正しいスクワットのコツ</div>
        <ul className="tips-list">
          <li>足を肩幅より少し広めに</li>
          <li>つま先を30°外向きに</li>
          <li>膝をつま先の方向に向ける</li>
          <li>背筋をまっすぐ保つ</li>
          <li>太ももが床と平行になるまで下げる</li>
        </ul>
      </div>
    </div>
  )
}

function AngleCard({ label, value, unit, good, target }) {
  const hasValue = value !== null && value !== undefined
  return (
    <div className={`angle-card ${hasValue ? (good ? 'good' : 'warn') : 'neutral'}`}>
      <div className="angle-card-label">{label}</div>
      <div className="angle-card-value">
        {hasValue ? `${value}${unit}` : '--'}
      </div>
      <div className="angle-card-target">目標: {target}</div>
    </div>
  )
}
