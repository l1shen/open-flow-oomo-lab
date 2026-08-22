import styles from './audioPreview.module.scss'
import type { FC } from 'react'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { AudioWave, AudioWaveCanvas } from './audioWave.ts'
import { makeFreshMediaUrl } from './mediaUrl.ts'

export interface AudioPreviewProps {
  src: string
}

export const AudioPreview: FC<AudioPreviewProps> = ({ src }) => {
  const t = useTranslate()
  const waveRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const mediaUrl = useMemo(() => makeFreshMediaUrl(src), [src])

  useEffect(() => {
    const audioElement = audioRef.current
    const waveElement = waveRef.current
    if (audioElement && waveElement) {
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      const wave = new AudioWave(audioElement)
      const canvas = new AudioWaveCanvas(waveElement, wave)

      let ticket = 0
      const update = () => {
        ticket = requestAnimationFrame(update)
        canvas.update()
      }
      update()

      return () => {
        cancelAnimationFrame(ticket)
        wave.dispose()
        canvas.dispose()
      }
    }
  }, [mediaUrl])

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch((error) => console.warn('Failed to play audio preview.', error))
    } else {
      audio.pause()
    }
  }, [])

  const seek = useCallback((value: string) => {
    const audio = audioRef.current
    if (audio) audio.currentTime = Number(value)
  }, [])

  const changeVolume = useCallback((value: string) => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Number(value)
    if (audio.volume > 0) audio.muted = false
  }, [])

  const toggleMuted = useCallback(() => {
    const audio = audioRef.current
    if (audio) audio.muted = !audio.muted
  }, [])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={styles.container}>
      <audio
        ref={audioRef}
        src={mediaUrl}
        crossOrigin="anonymous"
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
      />
      <div ref={waveRef} className={styles.wave}>
        <div className={styles.identity}>
          <i className="i-carbon:music" />
          <span>{t('preview.audio.title')}</span>
        </div>
      </div>
      <div className={styles.controls}>
        <input
          className={styles.timeline}
          type="range"
          aria-label={t('preview.audio.seek')}
          min={0}
          max={Math.max(duration, 0.01)}
          step="any"
          value={Math.min(currentTime, duration || 0)}
          style={{ background: `linear-gradient(to right, var(--audio-accent) ${progress}%, var(--audio-track) ${progress}%)` }}
          onChange={(event) => seek(event.currentTarget.value)}
        />
        <div className={styles.transport}>
          <button type="button" className={styles.playButton} aria-label={t(playing ? 'preview.audio.pause' : 'preview.audio.play')} onClick={togglePlayback}>
            <i className={playing ? 'i-carbon:pause' : 'i-carbon:play'} />
          </button>
          <span className={styles.time}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span className={styles.spacer} />
          <button type="button" className={styles.iconButton} aria-label={t(muted ? 'preview.audio.unmute' : 'preview.audio.mute')} onClick={toggleMuted}>
            <i className={muted || volume == 0 ? 'i-carbon:volume-mute' : 'i-carbon:volume-up'} />
          </button>
          <input
            className={styles.volume}
            type="range"
            aria-label={t('preview.audio.volume')}
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => changeVolume(event.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}
