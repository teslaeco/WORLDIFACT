/** Calm locally synthesized 30-second loops. No remote audio, files or generation API. */
export type WorldAudioTheme = 'meadow' | 'chess' | 'iss' | 'planets' | 'shop' | 'lab'
export const WORLD_AUDIO_LOOP_SECONDS = 30

const CHORDS: Record<WorldAudioTheme, readonly (readonly number[])[]> = {
  meadow: [
    [130.81, 164.81, 196.00],
    [146.83, 174.61, 220.00],
    [130.81, 164.81, 220.00],
    [146.83, 196.00, 246.94],
  ],
  chess: [
    [146.83, 174.61, 220.00],
    [130.81, 164.81, 196.00],
    [146.83, 185.00, 220.00],
    [123.47, 164.81, 220.00],
  ],
  iss: [
    [110.00, 164.81, 220.00],
    [123.47, 185.00, 246.94],
    [110.00, 174.61, 220.00],
    [98.00, 146.83, 196.00],
  ],
  planets: [
    [130.81, 196.00, 293.66],
    [146.83, 220.00, 329.63],
    [164.81, 246.94, 369.99],
    [146.83, 196.00, 293.66],
  ],
  shop: [
    [174.61, 220.00, 261.63],
    [196.00, 246.94, 293.66],
    [174.61, 220.00, 293.66],
    [164.81, 207.65, 261.63],
  ],
  lab: [
    [164.81, 246.94, 329.63],
    [146.83, 220.00, 293.66],
    [164.81, 220.00, 329.63],
    [146.83, 196.00, 293.66],
  ],
}

export function worldAudioTheme(portalId?: string): WorldAudioTheme {
  if (portalId === 'chess-cube-512-ai') return 'chess'
  if (portalId === 'terra-fix-iss') return 'iss'
  if (portalId === '8-planets-in-8-days') return 'planets'
  if (portalId === 'enchanted-ai-shop') return 'shop'
  if (portalId === 'ai-game-lab') return 'lab'
  return 'meadow'
}

export function createWorldAudio(theme: WorldAudioTheme = 'meadow') {
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = 0.22
  master.connect(context.destination)

  const scheduled = new Set<OscillatorNode>()
  let timer: ReturnType<typeof setInterval> | undefined
  let playing = false

  const stopScheduled = () => {
    for (const oscillator of scheduled) {
      try { oscillator.stop() } catch { /* already stopped */ }
    }
    scheduled.clear()
  }

  const scheduleTone = (frequency: number, start: number, duration: number, index: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = index === 0 ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(frequency, start)
    oscillator.detune.setValueAtTime(index === 2 ? 3 : index === 1 ? -2 : 0, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.095 : 0.065, start + 0.9)
    gain.gain.setValueAtTime(index === 0 ? 0.075 : 0.052, start + duration - 1.4)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.05)
    scheduled.add(oscillator)
    oscillator.onended = () => {
      scheduled.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    }
  }

  const scheduleCycle = () => {
    const start = context.currentTime + 0.05
    const chords = CHORDS[theme]
    chords.forEach((chord, chordIndex) => {
      const at = start + chordIndex * 7.5
      chord.forEach((frequency, noteIndex) => scheduleTone(frequency, at, 7.15, noteIndex))
      scheduleTone(chord[1] * 2, at + 3.6, 2.5, 2)
    })
  }

  return {
    async setPlaying(next: boolean) {
      if (next === playing) return
      playing = next
      if (next) {
        await context.resume()
        stopScheduled()
        scheduleCycle()
        timer = setInterval(scheduleCycle, WORLD_AUDIO_LOOP_SECONDS * 1000)
      } else {
        if (timer) clearInterval(timer)
        timer = undefined
        stopScheduled()
        await context.suspend()
      }
    },
    portal() {
      if (context.state !== 'running') return
      const start = context.currentTime
      ;[392, 493.88, 587.33].forEach((frequency, index) => {
        const tone = context.createOscillator()
        const gain = context.createGain()
        tone.type = 'sine'
        tone.frequency.setValueAtTime(frequency, start + index * 0.06)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.09, start + 0.04 + index * 0.06)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55)
        tone.connect(gain)
        gain.connect(master)
        tone.start(start)
        tone.stop(start + 0.6)
        tone.onended = () => { tone.disconnect(); gain.disconnect() }
      })
    },
    dispose() {
      playing = false
      if (timer) clearInterval(timer)
      stopScheduled()
      master.disconnect()
      void context.close()
    },
  }
}
