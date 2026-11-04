import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { tooltipPlacement } from "./tooltipPlacement";

interface Props {
  text?: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  /** Preserve flex shrinking for truncated status messages. */
  className?: string;
}

/** Empty tips leave the element and its layout unchanged. */
export function Tooltip({ text, children, className }: Props) {
  return text?.trim() ? <TooltipContent text={text} className={className}>{children}</TooltipContent> : children;
}

function TooltipContent({ text, children, className }: Props & { text: string }) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<ReturnType<typeof tooltipPlacement> | null>(null);

  const cancelTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const close = useCallback(() => {
    cancelTimer();
    setOpen(false);
    setPosition(null);
  }, [cancelTimer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelTimer();
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, cancelTimer]);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !bubble.current) return;
    const element = trigger.current.firstElementChild ?? trigger.current;
    setPosition(tooltipPlacement(
      element.getBoundingClientRect(),
      bubble.current.getBoundingClientRect(),
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    ));
  }, [open, text, children]);

  const describedBy = [children.props["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <span
        ref={trigger}
        className={`tooltip-trigger${className ? ` ${className}` : ""}`}
        onMouseEnter={() => {
          cancelTimer();
          timer.current = setTimeout(() => setOpen(true), 400);
        }}
        onMouseLeave={close}
        onPointerDownCapture={close}
        onClickCapture={close}
        onFocusCapture={(event) => {
          if (event.target.matches(":focus-visible")) {
            cancelTimer();
            setOpen(true);
          }
        }}
        onBlurCapture={close}
      >
        {cloneElement(children, { "aria-describedby": describedBy })}
      </span>
      {open && createPortal(
        <div
          ref={bubble}
          id={id}
          role="tooltip"
          className="tooltip-bubble"
          style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
