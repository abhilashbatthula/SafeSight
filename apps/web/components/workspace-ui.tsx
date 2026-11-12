'use client';
import {
  createContext,
  useEffect,
  useContext,
  type PointerEvent,
  type ReactNode,
} from 'react';
export type Workspace = {
  zoneId: string | null;
  inference: {
    ready: boolean;
    reason: string | null;
    modelVersion?: string;
    provider?: string;
    analysisType?: string;
    readinessScope?: string;
  };
};
export type IconName =
  | 'inspect'
  | 'human'
  | 'machinery'
  | 'history'
  | 'settings'
  | 'file'
  | 'start';
export const WindowControls = createContext<{
  active: boolean;
  maximized: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  setTitle?: (title: string) => void;
  drag: (event: PointerEvent<HTMLDivElement>) => void;
} | null>(null);
export function PixelIcon({
  name = 'inspect',
  small = false,
}: {
  name?: IconName;
  small?: boolean;
}) {
  return (
    <svg
      className={`pixel-icon ${small ? 'small' : ''}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {name === 'start' ? (
        <>
          <path
            fill="#000"
            d="M3 6l12-3v12H3zM17 3l12 3v9H17zM3 17h12v12L3 26zM17 17h12v9l-12 3z"
          />
          <path fill="#ff0000" d="M5 7l8-2v8H5z" />
          <path fill="#00a000" d="M19 5l8 2v6h-8z" />
          <path fill="#0000ff" d="M5 19h8v8l-8-2z" />
          <path fill="#ffff00" d="M19 19h8v6l-8 2z" />
        </>
      ) : name === 'human' ? (
        <>
          <path
            fill="#000"
            d="M11 3h10v3h3v9h-3v3h5v3h3v9H3v-9h3v-3h5v-3H8V6h3z"
          />
          <path fill="#ffff00" d="M12 4h8v3h3v4H9V7h3z" />
          <path fill="#808000" d="M9 10h14v3H9z" />
          <path fill="#ffcf9f" d="M12 13h8v4h-8z" />
          <path fill="#000080" d="M7 19h6v3h6v-3h6v3h3v6H4v-6h3z" />
          <path fill="#ffff00" d="M10 19h3v9h-3zM19 19h3v9h-3zM7 24h18v2H7z" />
          <path fill="#fff" d="M5 22h2v5H5z" />
        </>
      ) : name === 'machinery' ? (
        <>
          <path fill="#000" d="M3 6h21v5h5v17H3zM7 3h10v3H7z" />
          <path fill="#808080" d="M4 7h19v7H4zM4 16h24v10H4z" />
          <path fill="#fff" d="M4 7h18v2H4zM4 16h23v2H4z" />
          <path fill="#c0c0c0" d="M8 10h14v3H8zM7 18h16v6H7z" />
          <path fill="#000080" d="M9 19h12v4H9z" />
          <path fill="#000" d="M6 27h4v4H6zM23 27h4v4h-4zM24 10h4v5h-4z" />
          <path fill="#ffff00" d="M25 18h2v3h-2z" />
          <path fill="#ff0000" d="M25 23h2v2h-2z" />
        </>
      ) : name === 'inspect' ? (
        <>
          <path fill="#000" d="M6 12h3V7h5V4h5v3h5v5h3v8H6z" />
          <path fill="#ffff00" d="M8 13h3V8h4V6h3v2h4v5h3v5H8z" />
          <path fill="#808000" d="M8 16h17v2H8zM16 7h2v8h-2z" />
          <path fill="#000" d="M5 21h23v3H5z" />
          <path fill="#fff" d="M6 21h20v1H6z" />
          <path fill="#008080" d="M8 26h16v3H8z" />
        </>
      ) : name === 'history' ? (
        <>
          <path fill="#000" d="M3 8h11l3 4h12v16H3z" />
          <path fill="#ffff80" d="M4 9h9l3 4h12v13H4z" />
          <path fill="#808000" d="M6 15h24l-4 13H3z" />
          <path fill="#ffff00" d="M7 16h21l-3 10H4z" />
          <path fill="#fff" d="M7 16h21v1H7z" />
        </>
      ) : name === 'settings' ? (
        <>
          <path fill="#000" d="M4 4h24v24H4z" />
          <path fill="#fff" d="M5 5h22v22H5z" />
          <path fill="#000080" d="M5 5h22v5H5z" />
          <path fill="#808080" d="M9 14h14v2H9zM9 22h14v2H9z" />
          <path fill="#000" d="M13 12h4v6h-4zM19 20h4v6h-4z" />
          <path fill="#c0c0c0" d="M14 13h2v4h-2zM20 21h2v4h-2z" />
        </>
      ) : (
        <>
          <path fill="#000" d="M7 3h13l6 6v21H7z" />
          <path fill="#fff" d="M8 4h11v6h6v19H8z" />
          <path fill="#c0c0c0" d="M20 5l4 4h-4z" />
          <path fill="#008080" d="M10 14h13v10H10z" />
          <path fill="#ffff80" d="M11 15h3v3h-3z" />
          <path fill="#00ffff" d="M11 22l4-4 3 3 3-2 2 4H11z" />
        </>
      )}
    </svg>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? 'error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="notice-icon">
        {error ? '!' : 'i'}
      </span>
      <div>{children}</div>
    </div>
  );
}
export function Window({
  title,
  icon = 'inspect',
  children,
  className = '',
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  const controls = useContext(WindowControls);
  useEffect(() => {
    controls?.setTitle?.(title);
  }, [title, controls?.setTitle]);
  return (
    <section className={`window ${className}`}>
      <div
        className="titlebar"
        onPointerDown={controls?.drag}
        onDoubleClick={controls?.maximize}
      >
        <PixelIcon name={icon} small />
        <h1>{title}</h1>
        {controls && (
          <div
            className="window-controls"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Minimize window"
              title="Minimize"
              onClick={controls.minimize}
            >
              <span className="control-minimize" />
            </button>
            <button
              aria-label={
                controls.maximized ? 'Restore window' : 'Maximize window'
              }
              title={controls.maximized ? 'Restore' : 'Maximize'}
              onClick={controls.maximize}
            >
              <span
                className={
                  controls.maximized ? 'control-restore' : 'control-maximize'
                }
              />
            </button>
            <button
              aria-label="Close window"
              title="Close"
              onClick={controls.close}
            >
              <span className="control-close" />
            </button>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
