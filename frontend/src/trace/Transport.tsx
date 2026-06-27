/** Bottom transport: play / pause / step / scrub over the recorded frames. */

interface Props {
  count: number;
  playhead: number;
  playing: boolean;
  onSeek: (i: number) => void;
  onTogglePlay: () => void;
}

export function Transport({ count, playhead, playing, onSeek, onTogglePlay }: Props) {
  const max = Math.max(0, count - 1);
  return (
    <div className="trace-transport">
      <button className="btn" onClick={onTogglePlay}>{playing ? "❚❚" : "▶"}</button>
      <button className="btn" onClick={() => onSeek(Math.max(0, playhead - 1))}>‹ step</button>
      <input
        className="trace-scrub"
        type="range"
        min={0}
        max={max}
        value={Math.min(playhead, max)}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <button className="btn" onClick={() => onSeek(Math.min(max, playhead + 1))}>step ›</button>
      <span className="trace-frame-count">{Math.min(playhead, max) + 1} / {count}</span>
    </div>
  );
}
