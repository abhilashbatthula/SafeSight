'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  PixelIcon,
  Window,
  WindowControls,
  type IconName,
} from './workspace-ui';

export type DesktopApp = {
  path: string;
  title: string;
  icon: IconName;
  kind: 'human' | 'machinery' | 'history' | 'settings' | 'result';
  inspectionId?: string;
};
const applications: DesktopApp[] = [
  { path: '/human', title: 'Human analysis', icon: 'human', kind: 'human' },
  {
    path: '/machinery',
    title: 'Machinery analysis',
    icon: 'machinery',
    kind: 'machinery',
  },
  {
    path: '/history',
    title: 'Inspection history',
    icon: 'history',
    kind: 'history',
  },
  { path: '/settings', title: 'Settings', icon: 'settings', kind: 'settings' },
];
function appForPath(path: string): DesktopApp | undefined {
  const known = applications.find((app) => app.path === path);
  if (known) return known;
  const result = /^\/inspections\/([\da-f-]{36})$/.exec(path);
  if (result)
    return {
      path,
      title: 'Inspection review',
      icon: 'file',
      kind: 'result',
      inspectionId: result[1],
    };
  if (path === '/inspections') return applications[0];
}
type OpenWindow = DesktopApp & {
  minimized: boolean;
  maximized: boolean;
  x: number;
  y: number;
};
type DesktopState = { windows: OpenWindow[]; active: string | null };
function bringForward(state: DesktopState, app: DesktopApp): DesktopState {
  const existing = state.windows.find((item) => item.path === app.path);
  const offset = (state.windows.length % 5) * 24;
  const width = window.innerWidth;
  const initialWidth = Math.min(
    app.kind === 'settings' ? 520 : 1080,
    Math.max(300, width - (width <= 900 ? 145 : 170)),
  );
  const initialHeight = Math.min(
    app.kind === 'settings' ? 470 : 760,
    window.innerHeight - 114,
  );
  const entry = existing
    ? { ...existing, minimized: false }
    : {
        ...app,
        minimized: false,
        maximized: false,
        x: Math.max(
          4,
          Math.min(
            app.kind === 'settings' ? (width - initialWidth) / 2 : 148 + offset,
            width - initialWidth - 4,
          ),
        ),
        y: Math.max(
          4,
          Math.min(28 + offset, window.innerHeight - 50 - initialHeight),
        ),
      };
  return {
    windows: [...state.windows.filter((item) => item.path !== app.path), entry],
    active: app.path,
  };
}
function lastVisible(windows: OpenWindow[]) {
  return windows.findLast((item) => !item.minimized)?.path ?? null;
}
function DesktopClock({
  timezone,
  onOpen,
}: {
  timezone: string;
  onOpen?: () => void;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const time = now
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(now)
    : '--:--';
  const date = now
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(now)
    : '--/--/----';
  const ClockSurface = onOpen ? 'button' : 'div';
  return (
    <ClockSurface
      className="taskbar-clock"
      onClick={onOpen}
      aria-label={`Date and time: ${time}, ${date}`}
      title={`${date} · ${timezone}`}
    >
      <time dateTime={now?.toISOString()}>
        <span data-testid="taskbar-time">{time}</span>
        <span data-testid="taskbar-date">{date}</span>
      </time>
    </ClockSurface>
  );
}
export function ComputerDesktop({
  timezone,
  ready,
  loading,
  error,
  renderApp,
}: {
  timezone: string;
  ready: boolean;
  loading: boolean;
  error: ReactNode;
  renderApp: (app: DesktopApp) => ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const [state, setState] = useState<DesktopState>({
    windows: [],
    active: null,
  });
  const [startOpen, setStartOpen] = useState(false),
    [clockOpen, setClockOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null),
    startRef = useRef<HTMLButtonElement>(null),
    activeFrame = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDialogElement>(null);
  const dragRef = useRef<{
    path: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    activeFrame.current?.focus({ preventScroll: true });
  }, [state.active]);
  const openApp = useCallback(
    (app: DesktopApp) => {
      setState((previous) => bringForward(previous, app));
      setStartOpen(false);
      router.push(app.path, { scroll: false });
    },
    [router],
  );
  useEffect(() => {
    const app = appForPath(path);
    if (app) setState((previous) => bringForward(previous, app));
    else if (path !== '/') router.replace('/', { scroll: false });
  }, [path, router]);
  useEffect(() => {
    function dismiss(event: globalThis.PointerEvent) {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !startRef.current?.contains(target)
      )
        setStartOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  useEffect(() => {
    if (clockOpen) clockRef.current?.showModal();
    else clockRef.current?.close();
  }, [clockOpen]);
  useEffect(() => {
    function resize() {
      const frames = new Map(
        Array.from(
          document.querySelectorAll<HTMLDivElement>('.application-frame'),
        ).map((frame) => [
          frame.dataset.windowPath,
          frame.getBoundingClientRect(),
        ]),
      );
      setState((previous) => ({
        ...previous,
        windows: previous.windows.map((item) => ({
          ...item,
          x: Math.max(
            0,
            Math.min(
              item.x,
              window.innerWidth - (frames.get(item.path)?.width || 300),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              item.y,
              window.innerHeight - 46 - (frames.get(item.path)?.height || 180),
            ),
          ),
        })),
      }));
    }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const minimize = useCallback((target: string) => {
    setState((previous) => {
      const windows = previous.windows.map((item) =>
        item.path === target ? { ...item, minimized: true } : item,
      );
      return {
        windows,
        active:
          previous.active === target ? lastVisible(windows) : previous.active,
      };
    });
  }, []);
  const close = useCallback(
    (target: string) => {
      const windows = state.windows.filter((item) => item.path !== target);
      const active =
        state.active === target ? lastVisible(windows) : state.active;
      setState({ windows, active });
      if (path === target) router.replace(active ?? '/', { scroll: false });
    },
    [state, path, router],
  );
  const maximize = useCallback((target: string) => {
    setState((previous) => ({
      ...previous,
      windows: previous.windows.map((item) =>
        item.path === target ? { ...item, maximized: !item.maximized } : item,
      ),
    }));
  }, []);
  const renameWindow = useCallback((target: string, title: string) => {
    setState((previous) => {
      if (
        previous.windows.find((item) => item.path === target)?.title === title
      )
        return previous;
      return {
        ...previous,
        windows: previous.windows.map((item) =>
          item.path === target ? { ...item, title } : item,
        ),
      };
    });
  }, []);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.ctrlKey && event.key === 'Escape') {
        event.preventDefault();
        setStartOpen((value) => !value);
      } else if (event.key === 'Escape') {
        setStartOpen(false);
        return;
      }
      if (!event.altKey || !state.active) return;
      if (['F4', 'F9', 'F10'].includes(event.key)) event.preventDefault();
      if (event.key === 'F4') close(state.active);
      if (event.key === 'F9') minimize(state.active);
      if (event.key === 'F10') maximize(state.active);
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [state.active, close, minimize, maximize]);
  function focusApp(app: DesktopApp) {
    if (state.active === app.path) return;
    setState((previous) => bringForward(previous, app));
    router.replace(app.path, { scroll: false });
  }
  function drag(event: PointerEvent<HTMLDivElement>, entry: OpenWindow) {
    if (event.button !== 0 || entry.maximized || window.innerWidth <= 600)
      return;
    const frame = event.currentTarget
      .closest('.application-frame')
      ?.getBoundingClientRect();
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      path: entry.path,
      offsetX: event.clientX - frame.left,
      offsetY: event.clientY - frame.top,
      width: frame.width,
      height: frame.height,
    };
    event.currentTarget.onpointermove = (move) => {
      const moving = dragRef.current;
      if (!moving) return;
      const x = Math.max(
        0,
        Math.min(
          move.clientX - moving.offsetX,
          Math.max(0, window.innerWidth - moving.width),
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          move.clientY - moving.offsetY,
          Math.max(0, window.innerHeight - 48 - moving.height),
        ),
      );
      setState((previous) => ({
        ...previous,
        windows: previous.windows.map((item) =>
          item.path === moving.path ? { ...item, x, y } : item,
        ),
      }));
    };
    event.currentTarget.onpointerup = event.currentTarget.onpointercancel =
      () => {
        dragRef.current = null;
      };
  }
  const taskWindows = [...state.windows].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  return (
    <div className="computer-desktop">
      <main
        id="main"
        className="desktop-surface"
        aria-label="SafeSight desktop"
        tabIndex={-1}
      >
        <nav className="desktop-icons" aria-label="Desktop applications">
          {applications.map((app) => (
            <button
              className="desktop-icon"
              key={app.path}
              onClick={() => openApp(app)}
              aria-label={`Open ${app.title}`}
            >
              <PixelIcon name={app.icon} />
              <span>{app.title}</span>
            </button>
          ))}
        </nav>
        {!!error && <div className="desktop-error">{error}</div>}
        {state.windows.map((entry, index) => (
          <div
            key={entry.path}
            ref={state.active === entry.path ? activeFrame : undefined}
            role="region"
            data-window-path={entry.path}
            tabIndex={-1}
            aria-label={`${entry.title} window`}
            className={`application-frame app-${entry.kind} ${state.active === entry.path ? 'focused' : 'unfocused'} ${entry.maximized ? 'maximized' : ''}`}
            hidden={entry.minimized}
            style={{ left: entry.x, top: entry.y, zIndex: index + 10 }}
            onPointerDown={() => focusApp(entry)}
            onFocusCapture={() => focusApp(entry)}
          >
            <WindowControls.Provider
              value={{
                active: state.active === entry.path,
                maximized: entry.maximized,
                minimize: () => minimize(entry.path),
                maximize: () => maximize(entry.path),
                close: () => close(entry.path),
                setTitle:
                  entry.kind === 'result'
                    ? (title) => renameWindow(entry.path, title)
                    : undefined,
                drag: (event) => drag(event, entry),
              }}
            >
              {loading ? (
                <Window title={entry.title} icon={entry.icon}>
                  <div className="window-body" role="status">
                    Opening application…
                  </div>
                </Window>
              ) : (
                renderApp(entry)
              )}
            </WindowControls.Provider>
          </div>
        ))}
      </main>
      {startOpen && (
        <div className="start-menu" ref={menuRef}>
          <div className="start-menu-brand">
            <span>
              SafeSight <strong>95</strong>
            </span>
          </div>
          <div
            className="start-menu-items"
            id="start-applications"
            aria-label="Start applications"
          >
            {applications.map((app) => (
              <button key={app.path} onClick={() => openApp(app)}>
                <PixelIcon name={app.icon} />
                <span>{app.title}</span>
              </button>
            ))}
            <div className="menu-separator" />
            <button
              onClick={() => {
                setState((previous) => ({
                  windows: previous.windows.map((item) => ({
                    ...item,
                    minimized: true,
                  })),
                  active: null,
                }));
                setStartOpen(false);
                router.replace('/', { scroll: false });
              }}
            >
              <PixelIcon name="start" />
              <span>Show desktop</span>
            </button>
          </div>
        </div>
      )}
      <footer className="taskbar computer-taskbar" aria-label="Taskbar">
        <button
          className="start-button"
          ref={startRef}
          onClick={() => setStartOpen((value) => !value)}
          aria-expanded={startOpen}
          aria-controls="start-applications"
          aria-label="Start"
        >
          <PixelIcon name="start" small />
          <strong>Start</strong>
        </button>
        <div className="taskbar-divider" />
        <nav className="taskbar-applications" aria-label="Open applications">
          {taskWindows.map((entry) => (
            <button
              key={entry.path}
              className="taskbar-task"
              aria-label={`${entry.title}${entry.minimized ? ' (minimized)' : ''}`}
              aria-pressed={state.active === entry.path && !entry.minimized}
              onClick={() => {
                if (state.active === entry.path && !entry.minimized)
                  minimize(entry.path);
                else openApp(entry);
              }}
            >
              <PixelIcon name={entry.icon} small />
              <span>{entry.title}</span>
            </button>
          ))}
        </nav>
        <div className="taskbar-tray">
          <button
            className="tray-status"
            onClick={() => openApp(applications[3])}
            aria-label={
              ready
                ? 'Vision AI configured; open Settings'
                : 'Vision AI setup required; open Settings'
            }
            title={ready ? 'Vision AI configured' : 'Vision AI setup required'}
          >
            <span className={`tray-light ${ready ? 'ready' : ''}`} />
          </button>
          <DesktopClock timezone={timezone} onOpen={() => setClockOpen(true)} />
        </div>
      </footer>
      <dialog
        className="clock-dialog window"
        ref={clockRef}
        onCancel={() => setClockOpen(false)}
        onClose={() => setClockOpen(false)}
        aria-labelledby="clock-title"
      >
        <div className="titlebar">
          <PixelIcon name="settings" small />
          <h2 id="clock-title">Date / Time Properties</h2>
          <div className="window-controls">
            <button
              aria-label="Close date and time"
              onClick={() => setClockOpen(false)}
            >
              <span className="control-close" />
            </button>
          </div>
        </div>
        <div className="window-body">
          <div className="clock-properties">
            <DesktopClock timezone={timezone} />
            <p>
              Time zone: <strong>{timezone}</strong>
            </p>
            <p>The clock follows your computer’s current time.</p>
          </div>
          <div className="dialog-actions">
            <button
              onClick={() => {
                setClockOpen(false);
                openApp(applications[3]);
              }}
            >
              Time zone settings…
            </button>
            <button autoFocus onClick={() => setClockOpen(false)}>
              OK
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
