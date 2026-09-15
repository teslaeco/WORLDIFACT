/** Quiet locally synthesized ambient music; no remote audio or generation API. */
export function createWorldAudio() {
  const context = new AudioContext();
  const master = context.createGain(); master.gain.value = .055; master.connect(context.destination);
  const notes = [130.81, 164.81, 196, 261.63];
  const oscillators: OscillatorNode[] = [];
  for (const [i, frequency] of notes.entries()) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.value = .15; oscillator.connect(gain); gain.connect(master); oscillator.start(); oscillators.push(oscillator);
    const lfo = context.createOscillator(), modulation = context.createGain();
    lfo.frequency.value = .06 + i * .019; modulation.gain.value = .07;
    lfo.connect(modulation); modulation.connect(gain.gain); lfo.start(); oscillators.push(lfo);
  }
  return {
    setPlaying(playing: boolean) { return playing ? context.resume() : context.suspend(); },
    portal() {
      const start = context.currentTime;
      for (let i = 0; i < 3; i++) {
        const tone = context.createOscillator(), gain = context.createGain();
        tone.frequency.setValueAtTime(392 * 2 ** (i / 4), start);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.35, start + .04 + i * .05);
        gain.gain.exponentialRampToValueAtTime(.001, start + .5);
        tone.connect(gain); gain.connect(master); tone.start(start); tone.stop(start + .55);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      }
    },
    dispose() { for (const oscillator of oscillators) oscillator.stop(); void context.close(); },
  };
}
