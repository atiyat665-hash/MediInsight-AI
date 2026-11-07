'use client'
import React, { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Dot
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { getTrendForTest } from '../utils/trendStore.js'

// Status → dot colour
const STATUS_COLOR = {
  normal:        '#16a34a',
  low:           '#7c3aed',
  high:          '#e11d48',
  borderline:    '#d97706',
  not_available: '#9ca3af',
}

/** Parse "3.5 – 5.0" or "3.5-5.0" into { low, high } */
function parseRange(rangeStr) {
  if (!rangeStr) return null
  const clean = rangeStr.replace(/\s/g, '')
  // Try dash variants: –  —  -
  const m = clean.match(/^(-?[\d.]+)[–—\-](-?[\d.]+)$/)
  if (!m) return null
  const lo = parseFloat(m[1])
  const hi = parseFloat(m[2])
  if (isNaN(lo) || isNaN(hi)) return null
  return { low: lo, high: hi }
}

/** Custom tooltip */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="trend-tooltip">
      <div className="trend-tooltip-date">{d.date}</div>
      <div className="trend-tooltip-value" style={{ color: STATUS_COLOR[d.status] || '#374151' }}>
        {d.value}{d.unit ? ` ${d.unit}` : ''}
      </div>
      <div className="trend-tooltip-status">{d.status}</div>
    </div>
  )
}

/** Custom dot — colour by status */
function StatusDot(props) {
  const { cx, cy, payload } = props
  const color = STATUS_COLOR[payload?.status] || '#9ca3af'
  return (
    <circle
      cx={cx} cy={cy} r={5}
      fill={color} stroke="#fff" strokeWidth={2}
    />
  )
}

export default function BiomarkerTrendChart({ test, abbreviation, referenceRange, unit }) {
  const points = useMemo(
    () => getTrendForTest(test, abbreviation),
    [test, abbreviation]
  )

  // Need at least 2 points to draw a meaningful line
  if (points.length < 2) return null

  const range  = parseRange(referenceRange)

  // Y-axis domain: pad around the data and reference range
  const allValues = points.map(p => p.value)
  if (range) { allValues.push(range.low, range.high) }
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const pad    = (maxVal - minVal) * 0.2 || 1
  const yMin   = Math.floor(minVal - pad)
  const yMax   = Math.ceil(maxVal + pad)

  return (
    <div className="trend-chart-wrap">
      <div className="trend-chart-header">
        <TrendingUp size={14} />
        <span>Trend — {points.length} report{points.length !== 1 ? 's' : ''}</span>
        {unit && <span className="trend-unit-label">{unit}</span>}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Reference range band — top line */}
          {range && (
            <ReferenceLine
              y={range.high}
              stroke="#16a34a"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: 'High', position: 'insideTopRight', fontSize: 10, fill: '#16a34a' }}
            />
          )}
          {/* Reference range band — bottom line */}
          {range && (
            <ReferenceLine
              y={range.low}
              stroke="#16a34a"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: 'Low', position: 'insideBottomRight', fontSize: 10, fill: '#16a34a' }}
            />
          )}

          <Line
            type="monotone"
            dataKey="value"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={<StatusDot />}
            activeDot={{ r: 7 }}
            isAnimationActive={true}
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
