export class AudioWave {
  readonly context: AudioContext = new AudioContext()
  readonly source: AudioNode
  readonly analyser: AnalyserNode = this.context.createAnalyser()
  readonly data: Float32Array<ArrayBuffer>
  readonly min: number
  readonly max: number

  private readonly onPlay = (): void => {
    void this.context.resume()
  }

  private readonly onPause = (): void => {
    void this.context.suspend()
  }

  constructor(readonly element: HTMLMediaElement) {
    this.source = this.context.createMediaElementSource(element)
    element.addEventListener('play', this.onPlay)
    element.addEventListener('pause', this.onPause)

    this.analyser.smoothingTimeConstant = 0.5
    this.analyser.fftSize = 2048
    this.min = this.analyser.minDecibels
    this.max = this.analyser.maxDecibels
    this.data = new Float32Array(this.analyser.frequencyBinCount)

    this.source.connect(this.analyser)
    this.analyser.connect(this.context.destination)
  }

  update(): Float32Array {
    this.analyser.getFloatFrequencyData(this.data)
    return this.data.subarray(0, Math.floor(this.data.length * 0.2))
  }

  dispose(): void {
    this.element.removeEventListener('play', this.onPlay)
    this.element.removeEventListener('pause', this.onPause)
    this.analyser.disconnect()
    void this.context.close()
  }
}

class Spring {
  stiffness = 0.7
  damping = 0.25
  precision = 0.01
  target_value: Float32Array | null = null
  last_value: Float32Array | null = null
  constructor(public value: Float32Array | null = null) {
    if (value) this.set(value)
  }
  set(target_value: Float32Array): void {
    if (Number.isFinite(target_value[0]) && target_value[0] < 0) {
      this.target_value = target_value
      if (this.value == null) {
        this.value = target_value.slice()
        this.last_value = this.value.slice()
      }
    }
  }
  // Should be called every frame
  update(): Float32Array | null {
    if (this.value && this.target_value && this.last_value) {
      for (let i = 0, len = this.value.length; i < len; i++) {
        let v = this.target_value[i]
        if (!Number.isFinite(v)) v = -800
        const delta = v - this.value[i]
        const velocity = (this.value[i] - this.last_value[i]) / (1 / 60)
        const spring = this.stiffness * delta
        const damper = this.damping * velocity
        const acceleration = spring - damper
        const d = (velocity + acceleration) * (1 / 60)
        this.last_value[i] = this.value[i]
        if (Math.abs(d) < this.precision && Math.abs(delta) < this.precision) {
          this.value[i] = v
        } else {
          this.value[i] += d
        }
      }
    }
    return this.value
  }
}

const AspectRatio = 3

export class AudioWaveCanvas {
  readonly spring: Spring
  readonly canvas: HTMLCanvasElement = document.createElement('canvas')
  readonly context: CanvasRenderingContext2D = this.canvas.getContext('2d', {
    alpha: false,
  })!
  readonly observer: ResizeObserver = new ResizeObserver(this.onResize.bind(this))
  private readonly resizeTimer: ReturnType<typeof setTimeout>

  constructor(
    readonly parent: HTMLElement,
    readonly wave: AudioWave,
  ) {
    this.spring = new Spring()
    this.parent.appendChild(this.canvas)
    this.observer.observe(parent, { box: 'device-pixel-content-box' })

    // Ensure the canvas is always the correct size.
    this.resizeTimer = setTimeout(() => this.onResize(), 200)
  }

  onResize(entries?: ResizeObserverEntry[]): void {
    const width = this.getWidth(entries)
    const height = (width / AspectRatio) | 0
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.width = '100%'
  }

  private getWidth(entries?: ResizeObserverEntry[]) {
    return entries?.[0]?.devicePixelContentBoxSize?.[0]?.inlineSize || this.parent.getBoundingClientRect().width * devicePixelRatio
  }

  update(): void {
    this.spring.set(this.wave.update())
    const data = this.spring.update()
    if (!data) return

    const padding = 10

    // Expand narrow bars proportionally when the available samples do not fill the canvas.
    let barWidth = 2
    let barSpacing = 2
    const spacingDivWidth = barSpacing / barWidth

    const { width, height } = this.canvas
    const { min, max } = this.wave
    const bars = Math.min(Math.floor((width - padding * 2) / (barWidth + barSpacing)), data.length)
    const step = Math.max(Math.floor(data.length / bars), 1)
    barWidth = (width - padding * 2 - barSpacing * (bars - 1)) / bars
    barSpacing = barWidth * spacingDivWidth

    this.context.clearRect(0, 0, width, height)

    for (let i = 0, j = 0; i < data.length; i += step, j++) {
      let value = data[i]
      for (let k = 1; k < step; k++) {
        value = Math.max(value, data[i + k])
      }
      value = (value - min) / (max - min)

      const x = j * (barWidth + barSpacing)
      const y = padding + ((1 - value) * height) / 2
      const hue = (1 - value) * 340
      const alpha = value * 0.3 + 0.7

      this.context.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
      this.context.fillRect(x, y, barWidth, height - y * 2)
    }
  }

  dispose(): void {
    clearTimeout(this.resizeTimer)
    this.observer.disconnect()
    this.canvas.remove()
  }
}
