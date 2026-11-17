import mockEvents from './events.mock.json';

export type OfficeEvent = {
  agent_id: string;
  agent_name: string;
  role: string;
  status: 'idle' | 'working' | 'waiting' | 'blocked' | 'done';
  task: string;
  file: string;
  handoff_to: string | null;
  tokens_used: number;
  cost_usd: number;
  timestamp: string;
};

type EventListener = (event: OfficeEvent) => void;

function isOfficeEvent(value: unknown): value is OfficeEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OfficeEvent>;
  return Boolean(
    typeof candidate.agent_id === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.timestamp === 'string' &&
    ['idle', 'working', 'waiting', 'blocked', 'done'].includes(candidate.status),
  );
}

export class EventBridge {
  private readonly url?: string;
  private readonly useMock: boolean;
  private listeners = new Set<EventListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private socket: WebSocket | null = null;
  private mockIndex = 0;

  constructor(url?: string, useMock = true) {
    this.url = url;
    this.useMock = useMock;
  }

  connect() {
    if (this.useMock) {
      this.mockIndex = 0;
      this.scheduleNextMock(0);
      return;
    }
    if (!this.url || typeof WebSocket === 'undefined') return;
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        if (isOfficeEvent(parsed)) this.emit(parsed);
        else console.warn('[EventBridge] Invalid event ignored', parsed);
      } catch (error) {
        console.warn('[EventBridge] Invalid JSON ignored', error);
      }
    };
  }

  disconnect() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }

  onEvent(listener: EventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: OfficeEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private scheduleNextMock(delay: number) {
    this.timer = setTimeout(() => {
      const event = mockEvents[this.mockIndex] as OfficeEvent;
      this.emit(event);
      const previous = mockEvents[this.mockIndex] as OfficeEvent;
      this.mockIndex = (this.mockIndex + 1) % mockEvents.length;
      const next = mockEvents[this.mockIndex] as OfficeEvent;
      const delta = next && previous ? new Date(next.timestamp).getTime() - new Date(previous.timestamp).getTime() : 6000;
      this.scheduleNextMock(Math.max(220, delta / 10));
    }, delay);
  }
}
