import LocalDb from '../localdb';

export default class Timer {
  readonly name: string;
  readonly scriptId: string;
  readonly execSequence: number;
  readonly internal: boolean;
  readonly timeMs: number;
  readonly startedAt: number;
  readonly canceled: boolean = false;

  cached: boolean = false;

  private timer: NodeJS.Timeout | null = null;

  constructor({
    name,
    scriptId,
    execSequence,
    internal = false,
    timeMs,
    startedAt,
  }: {
    name: string;
    scriptId: string;
    execSequence: number;
    internal?: boolean;
    timeMs: number;
    startedAt?: number;
  }) {
    this.name = name;
    this.scriptId = scriptId;
    this.execSequence = execSequence;
    this.timeMs = timeMs;
    this.startedAt = startedAt;
    this.internal = internal;
  }

  public start(callback: () => void) {
    if (!this.canceled) {
      if (this.cached && this.startedAt) {
        const timeRemaining = this.timeMs - (Date.now() - this.startedAt);
        if (timeRemaining > 0) {
          this.timer = setTimeout(callback, timeRemaining);
        } else {
          callback();
        }
      } else {
        LocalDb.getInstance().startTimer(this);
        this.timer = setTimeout(callback, this.timeMs);
      }
    }
  }

  public cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      LocalDb.getInstance().cancelTimer(this);
    }
  }
}
