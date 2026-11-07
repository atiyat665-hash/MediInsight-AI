'use client'
import { Check } from 'lucide-react'

const STEPS = [{ label: 'Upload' }, { label: 'Verify Text' }, { label: 'Results' }]

export default function StepsBar({ current }) {
  return (
    <div className="steps-bar" role="navigation" aria-label="Progress steps">
      {STEPS.map((step, i) => {
        const done = i < current; const active = i === current
        return (
          <div key={i} style={{ display: 'contents' }}>
            <div className={`step-item${active ? ' active' : ''}${done ? ' done' : ''}`} aria-current={active ? 'step' : undefined}>
              <span className="step-num" aria-hidden="true">{done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
              <span>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="step-divider" aria-hidden="true" />}
          </div>
        )
      })}
    </div>
  )
}
