import * as React from "react";
import { createPortal } from "react-dom";

interface Tip {
  readonly x: number;
  readonly y: number;
  readonly content: React.ReactNode;
}

/** One floating readout per chart. Marks call `show` on pointer move and focus; the tip never gates a value. */
export function useChartTip() {
  const [tip, setTip] = React.useState<Tip | null>(null);
  const show = React.useCallback(
    (e: React.PointerEvent | React.FocusEvent, content: React.ReactNode) => {
      if ("clientX" in e) setTip({ x: e.clientX, y: e.clientY, content });
      else {
        const r = (e.target as Element).getBoundingClientRect();
        setTip({ x: r.right, y: r.top, content });
      }
    },
    [],
  );
  const hide = React.useCallback(() => setTip(null), []);
  const node = tip ? <TipBox tip={tip} /> : null;
  return { show, hide, node };
}

function TipBox({ tip }: { tip: Tip }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ left: tip.x + 14, top: tip.y + 14 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 14;
    let left = tip.x + pad;
    let top = tip.y + pad;
    if (left + r.width > innerWidth - 8) left = tip.x - r.width - pad;
    if (top + r.height > innerHeight - 8) top = tip.y - r.height - pad;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [tip.x, tip.y]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={pos}
      className="pointer-events-none fixed z-50 max-w-72 rounded-lg border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-lg/5"
    >
      {tip.content}
    </div>,
    document.body,
  );
}

/** A tooltip row: value first, then the series it belongs to, keyed by a short line of its colour. */
export function TipRow({
  value,
  label,
  color,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color && (
        <span
          aria-hidden
          className="h-0.5 w-3 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Width of an element, kept current: charts draw to the space they have. */
export function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
