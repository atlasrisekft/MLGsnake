import { useState, useEffect, useCallback, useRef } from 'react'

const GRID = 20
const CELL = 22
const W = GRID * CELL
const H = GRID * CELL
const BASE_SPEED = 140

const MLG_TEXTS = [
  '360 NOSCOPE!', 'GET REKT', 'MLG PRO', 'YOLO', 'SWAG',
  '420 BLAZE IT 🔥', 'HEADSHOT!', 'SICK MOVE BRO', 'EZ CLAP',
  'NO SCOPE!!!', 'DORITOS!!!', 'MTN DEW', '🔺 ILLUMINATI', 'HACKER',
  'PENTAKILL', 'BEAST MODE', 'CLUTCH!!!', 'REKT SCRUB', 'OPTIC',
  'MONTAGE CLIP', 'OMG WTF BBQ', 'TRIPLE KILL', 'DOMINATED!',
  'QUICKSCOPE', 'FAZE UP', 'GIT GUD', '1v1 ME IRL', 'EZ GG',
]

const MLG_EMOJIS = ['🕶️', '💰', '🔺', '💥', '⭐', '🎮', '🏆', '🔥', '💯', '💨', '🎵', '🌿']
const RAINBOW = ['#ff0000', '#ff7700', '#ffff00', '#00ff00', '#00aaff', '#8b00ff', '#ff00ff']

function rndFood(snake) {
  let pos
  do {
    pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }
  } while (snake.some(s => s.x === pos.x && s.y === pos.y))
  return pos
}

function createAudioCtx() {
  try { return new (window.AudioContext || window.webkitAudioContext)() } catch { return null }
}

function playAirhorn(actx) {
  if (!actx) return
  try {
    const now = actx.currentTime
    ;[230, 460, 345, 690].forEach(f => {
      const osc = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(f, now)
      osc.frequency.linearRampToValueAtTime(f * 0.85, now + 0.6)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02)
      gain.gain.setValueAtTime(0.08, now + 0.5)
      gain.gain.linearRampToValueAtTime(0, now + 0.65)
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.start(now); osc.stop(now + 0.65)
    })
  } catch(e) {}
}

function playHitmarker(actx) {
  if (!actx) return
  try {
    const now = actx.currentTime
    const osc = actx.createOscillator()
    const gain = actx.createGain()
    osc.type = 'square'
    osc.frequency.value = 1200
    gain.gain.setValueAtTime(0.2, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    osc.connect(gain); gain.connect(actx.destination)
    osc.start(now); osc.stop(now + 0.1)
  } catch(e) {}
}

function playDeathSound(actx) {
  if (!actx) return
  try {
    const now = actx.currentTime
    const osc = actx.createOscillator()
    const gain = actx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(100, now)
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.8)
    gain.gain.setValueAtTime(0.4, now)
    gain.gain.linearRampToValueAtTime(0, now + 0.8)
    osc.connect(gain); gain.connect(actx.destination)
    osc.start(now); osc.stop(now + 0.8)
    const osc2 = actx.createOscillator()
    const gain2 = actx.createGain()
    osc2.type = 'sawtooth'
    osc2.frequency.setValueAtTime(440, now)
    osc2.frequency.exponentialRampToValueAtTime(55, now + 0.4)
    gain2.gain.setValueAtTime(0.2, now)
    gain2.gain.linearRampToValueAtTime(0, now + 0.4)
    osc2.connect(gain2); gain2.connect(actx.destination)
    osc2.start(now); osc2.stop(now + 0.4)
  } catch(e) {}
}

const INIT_SNAKE = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
const INIT_DIR = { x: 1, y: 0 }

export default function SnakeGame() {
  const canvasRef = useRef(null)
  const gs = useRef({
    snake: INIT_SNAKE, dir: INIT_DIR, nextDir: INIT_DIR,
    food: { x: 15, y: 10 }, score: 0, running: false,
  })
  const rafRef = useRef(null)
  const lastRef = useRef(0)
  const speedRef = useRef(BASE_SPEED)
  const flashRef = useRef(0)
  const audioCtxRef = useRef(null)
  const shakeRef = useRef(0)
  const rainbowHueRef = useRef(0)
  const hitmarkerRef = useRef(null)
  const particlesRef = useRef([])
  const strobeRef = useRef(0)

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => +localStorage.getItem('snakeBest') || 0)
  const [phase, setPhase] = useState('start')
  const [popups, setPopups] = useState([])

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx()
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume()
  }, [])

  const addPopup = useCallback((text, x, y, color) => {
    const id = Date.now() + Math.random()
    setPopups(prev => [...prev, { id, text, x, y, color }])
    setTimeout(() => setPopups(prev => prev.filter(p => p.id !== id)), 1500)
  }, [])

  const spawnParticles = useCallback((cx, cy) => {
    const count = 8 + Math.floor(Math.random() * 8)
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        emoji: MLG_EMOJIS[Math.floor(Math.random() * MLG_EMOJIS.length)],
        x: cx, y: cy,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 7 - 1,
        vr: (Math.random() - 0.5) * 0.5,
        rotation: Math.random() * Math.PI * 2,
        size: 14 + Math.random() * 20,
        life: 1,
      })
    }
  }, [])

  const draw = useCallback((ts = 0) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { snake, food } = gs.current
    const isPlaying = gs.current.running

    ctx.save()
    if (shakeRef.current > 0) {
      ctx.translate(
        (Math.random() - 0.5) * shakeRef.current * 14,
        (Math.random() - 0.5) * shakeRef.current * 14
      )
      shakeRef.current = Math.max(0, shakeRef.current - 0.07)
    }

    rainbowHueRef.current = (rainbowHueRef.current + 0.8) % 360
    const hue = rainbowHueRef.current

    ctx.fillStyle = isPlaying ? `hsl(${hue}, 70%, 4%)` : '#0a0e17'
    ctx.fillRect(0, 0, W, H)

    if (strobeRef.current > 0) {
      const si = Math.floor(ts / 40) % RAINBOW.length
      const alpha = Math.floor(strobeRef.current * 100).toString(16).padStart(2, '0')
      ctx.fillStyle = RAINBOW[si] + alpha
      ctx.fillRect(0, 0, W, H)
      strobeRef.current = Math.max(0, strobeRef.current - 0.025)
    }

    for (let x = 0; x <= GRID; x++) {
      ctx.strokeStyle = isPlaying
        ? `hsla(${(hue + x * 18) % 360}, 90%, 50%, 0.07)`
        : 'rgba(0,255,100,0.04)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke()
    }
    for (let y = 0; y <= GRID; y++) {
      ctx.strokeStyle = isPlaying
        ? `hsla(${(hue + y * 18) % 360}, 90%, 50%, 0.07)`
        : 'rgba(0,255,100,0.04)'
      ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke()
    }

    // Food — spinning rainbow Dorito
    const foodHue = (hue + 120) % 360
    const pulse = Math.sin(ts / 200) * 2
    ctx.save()
    ctx.shadowColor = `hsl(${foodHue}, 100%, 60%)`
    ctx.shadowBlur = 22 + pulse
    ctx.fillStyle = `hsl(${foodHue}, 100%, 60%)`
    ctx.translate(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2)
    ctx.rotate(ts / 350)
    const r = CELL / 2 - 2 + pulse * 0.3
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.866, r * 0.5)
    ctx.lineTo(-r * 0.866, r * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(-3, -3, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Hitmarker crosshair
    if (hitmarkerRef.current?.life > 0) {
      const hm = hitmarkerRef.current
      const hx = hm.x * CELL + CELL / 2
      const hy = hm.y * CELL + CELL / 2
      const hs = 14 * (1 + (1 - hm.life) * 0.6)
      const g = hs * 0.35
      ctx.strokeStyle = `rgba(255,255,255,${hm.life})`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(hx - hs, hy); ctx.lineTo(hx - g, hy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(hx + g, hy); ctx.lineTo(hx + hs, hy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(hx, hy - hs); ctx.lineTo(hx, hy - g); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(hx, hy + g); ctx.lineTo(hx, hy + hs); ctx.stroke()
      hm.life = Math.max(0, hm.life - 0.05)
    }

    // Emoji particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0)
    for (const p of particlesRef.current) {
      ctx.save()
      ctx.globalAlpha = p.life
      ctx.font = `${Math.floor(p.size)}px serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillText(p.emoji, 0, 0)
      ctx.restore()
      p.x += p.vx; p.y += p.vy; p.vy += 0.2
      p.rotation += p.vr
      p.life -= 0.02
    }

    // Rainbow snake
    snake.forEach((seg, i) => {
      const t = 1 - i / (snake.length + 1)
      const segHue = isPlaying ? (hue + i * 15) % 360 : (i === 0 ? 140 : 120)

      if (i === 0) {
        ctx.save()
        ctx.shadowColor = `hsl(${segHue}, 100%, 60%)`
        ctx.shadowBlur = 18
        ctx.fillStyle = `hsl(${segHue}, 100%, 60%)`
        ctx.beginPath()
        ctx.roundRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4, 5)
        ctx.fill()
        ctx.restore()
        const d = gs.current.dir
        ctx.fillStyle = '#000'
        const cx = seg.x * CELL + CELL / 2, cy = seg.y * CELL + CELL / 2
        if (d.x !== 0) {
          ctx.beginPath(); ctx.arc(cx + d.x * 3, cy - 3.5, 2.5, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(cx + d.x * 3, cy + 3.5, 2.5, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.beginPath(); ctx.arc(cx - 3.5, cy + d.y * 3, 2.5, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(cx + 3.5, cy + d.y * 3, 2.5, 0, Math.PI * 2); ctx.fill()
        }
      } else {
        ctx.fillStyle = isPlaying
          ? `hsl(${segHue}, 90%, ${35 + t * 25}%)`
          : `rgb(${Math.floor(t * 10)},${Math.floor(160 + t * 95)},${Math.floor(40 + t * 48)})`
        ctx.beginPath()
        ctx.roundRect(seg.x * CELL + 3, seg.y * CELL + 3, CELL - 6, CELL - 6, 4)
        ctx.fill()
      }
    })

    if (flashRef.current > 0) {
      ctx.fillStyle = `hsla(${(ts / 30) % 360}, 100%, 50%, ${flashRef.current * 0.35})`
      ctx.fillRect(0, 0, W, H)
      flashRef.current = Math.max(0, flashRef.current - 0.06)
    }

    // MLG watermarks
    ctx.globalAlpha = 0.22
    ctx.font = 'bold 9px "Comic Sans MS", cursive'
    ctx.fillStyle = isPlaying ? `hsl(${hue}, 100%, 70%)` : '#00ff88'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('420BLAZEIT', 4, 4)
    ctx.textAlign = 'right'
    ctx.fillText('MLG OFFICIAL 2014', W - 4, 4)
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('SPONSORED BY DORITOS & MTN DEW', 4, H - 2)
    ctx.globalAlpha = 1

    ctx.restore()
  }, [])

  const endGame = useCallback(() => {
    gs.current.running = false
    cancelAnimationFrame(rafRef.current)
    flashRef.current = 1
    strobeRef.current = 1
    shakeRef.current = 1.2
    ensureAudio()
    playDeathSound(audioCtxRef.current)
    const s = gs.current.score
    if (s > best) { localStorage.setItem('snakeBest', s); setBest(s) }
    setPhase('over')
    let n = 0
    const flash = (ts) => { draw(ts); if (++n < 80) rafRef.current = requestAnimationFrame(flash) }
    rafRef.current = requestAnimationFrame(flash)
  }, [best, draw, ensureAudio])

  const tick = useCallback((ts) => {
    if (!gs.current.running) return
    draw(ts)
    rafRef.current = requestAnimationFrame(tick)

    if (ts - lastRef.current < speedRef.current) return
    lastRef.current = ts
    gs.current.dir = gs.current.nextDir

    const { snake, dir, food } = gs.current
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y }

    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID || snake.some(s => s.x === head.x && s.y === head.y)) {
      cancelAnimationFrame(rafRef.current)
      endGame(); return
    }

    const next = [head, ...snake]
    if (head.x === food.x && head.y === food.y) {
      const s = gs.current.score + 10
      gs.current.score = s
      gs.current.food = rndFood(next)
      speedRef.current = Math.max(55, BASE_SPEED - Math.floor(s / 40) * 10)
      setScore(s)
      ensureAudio()
      playAirhorn(audioCtxRef.current)
      playHitmarker(audioCtxRef.current)
      shakeRef.current = 0.6
      hitmarkerRef.current = { x: food.x, y: food.y, life: 1 }
      spawnParticles(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2)
      const text = MLG_TEXTS[Math.floor(Math.random() * MLG_TEXTS.length)]
      addPopup(text, food.x * CELL + CELL / 2, food.y * CELL, RAINBOW[Math.floor(Math.random() * RAINBOW.length)])
    } else {
      next.pop()
    }
    gs.current.snake = next
  }, [draw, endGame, ensureAudio, addPopup, spawnParticles])

  const startGame = useCallback(() => {
    ensureAudio()
    cancelAnimationFrame(rafRef.current)
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
    gs.current = { snake, dir: INIT_DIR, nextDir: INIT_DIR, food: rndFood(snake), score: 0, running: true }
    speedRef.current = BASE_SPEED
    flashRef.current = strobeRef.current = shakeRef.current = 0
    lastRef.current = 0
    particlesRef.current = []
    hitmarkerRef.current = null
    setScore(0)
    setPopups([])
    setPhase('playing')
    rafRef.current = requestAnimationFrame(tick)
  }, [tick, ensureAudio])

  useEffect(() => {
    if (phase !== 'playing') {
      let raf
      const idle = (ts) => { draw(ts); raf = requestAnimationFrame(idle) }
      raf = requestAnimationFrame(idle)
      return () => cancelAnimationFrame(raf)
    }
  }, [phase, draw])

  useEffect(() => {
    const onKey = (e) => {
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
      if (e.key === ' ' || e.key === 'Enter') { if (!gs.current.running) { startGame(); return } }
      if (!gs.current.running) return
      const map = {
        ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
      }
      const nd = map[e.key]
      if (!nd) return
      const cur = gs.current.dir
      if (nd.x === -cur.x && nd.y === -cur.y) return
      gs.current.nextDir = nd
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(rafRef.current) }
  }, [startGame])

  useEffect(() => {
    let sx, sy
    const onStart = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const onEnd = (e) => {
      if (!gs.current.running) { startGame(); return }
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      const cur = gs.current.dir
      const nd = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 })
        : (dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 })
      if (nd.x === -cur.x && nd.y === -cur.y) return
      gs.current.nextDir = nd
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [startGame])

  return (
    <div className="sg-root mlg-root">
      <div className="sg-panel">
        <div className="sg-header mlg-header">
          <div className="sg-scorebox">
            <span className="sg-label mlg-label">KILLS</span>
            <span className="sg-val mlg-val">{score}</span>
          </div>
          <div className="sg-title">
            <span className="mlg-title-header">🎮 MLG SNAKE 360 🎮</span>
          </div>
          <div className="sg-scorebox">
            <span className="sg-label mlg-label">MLG BEST</span>
            <span className="sg-val mlg-val">{best}</span>
          </div>
        </div>

        <div className="sg-canvas-wrap">
          <canvas ref={canvasRef} width={W} height={H} className="sg-canvas" />

          {popups.map(p => (
            <div key={p.id} className="mlg-popup" style={{ left: p.x, top: p.y, color: p.color }}>
              {p.text}
            </div>
          ))}

          {phase === 'start' && (
            <div className="sg-overlay mlg-overlay-start">
              <div className="sg-overlay-inner">
                <div className="mlg-icon-spin">🕶️</div>
                <h2 className="mlg-title-big">MLG SNAKE 360</h2>
                <p className="mlg-sub">360 NOSCOPE THE DORITOS</p>
                <p className="mlg-sub2">DON&apos;T HIT DA WALLS SCRUB</p>
                <button className="sg-btn mlg-btn" onClick={startGame}>▶ PLAY MLG MODE ◀</button>
                <div className="sg-keys mlg-keys">
                  <span>↑ ↓ ← → or WASD to move</span>
                  <span>Space / Enter to start</span>
                </div>
              </div>
            </div>
          )}

          {phase === 'over' && (
            <div className="sg-overlay sg-over-red mlg-overlay-over">
              <div className="sg-overlay-inner">
                <div className="mlg-icon-spin">💀</div>
                <h2 className="mlg-rekt-title">GET REKT NOOB</h2>
                <p className="mlg-rekt-sub">U JUST GOT 360 NOSCOPED</p>
                <div className="sg-final">
                  <div className="sg-final-row mlg-final-row">
                    <span>KILLS</span><strong>{score}</strong>
                  </div>
                  <div className="sg-final-row mlg-final-row">
                    <span>MLG BEST</span><strong>{best}</strong>
                  </div>
                </div>
                {score > 0 && score >= best && (
                  <div className="sg-newbest mlg-newbest">🏆 MLG PRO GAMER 🏆</div>
                )}
                <button className="sg-btn mlg-btn mlg-rekt-btn" onClick={startGame}>▶ TRY AGAIN NOOB ◀</button>
              </div>
            </div>
          )}
        </div>

        <div className="sg-footer mlg-footer">
          <span>WASD / Arrows · Space to restart · 420BLAZEIT 🔥 · YOLO · SWAG · MLG OFFICIAL</span>
        </div>
      </div>
    </div>
  )
}
