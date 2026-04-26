import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { normalizeTourPath, tourByPath } from "./tourSteps";

const TourContext = createContext(null);

const PANEL_W = 340;
const PADDING = 10;

export function TourProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Core tour state: whether the tour is open, which step is active, and where the
  // highlighted element currently sits on screen.
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState([]);
  const [pendingPath, setPendingPath] = useState(null);
  const [rect, setRect] = useState(null);
  const [stepMissing, setStepMissing] = useState(false);

  const rafRef = useRef(null);
  const currentPath = normalizeTourPath(location.pathname);
  const currentSteps = tourByPath[currentPath] || [];
  const currentStep = active ? steps[stepIndex] : null;

  const hasTourForPath = (path) => !!(tourByPath[normalizeTourPath(path)] || []).length;

  const stop = () => {
    setActive(false);
    setSteps([]);
    setStepIndex(0);
    setRect(null);
    setStepMissing(false);
    setPendingPath(null);
  };

  const startForPath = (path) => { // runs when user starts a tour
    const normalized = normalizeTourPath(path); 
    const nextSteps = tourByPath[normalized] || [];
    if (!nextSteps.length) return false;

    // If the requested tour belongs to another page, navigate there first and
    // remember the path so the tour can begin after routing finishes.
    if (normalizeTourPath(location.pathname) !== normalized) {
      setPendingPath(normalized);
      navigate(path);
      return true;
    }

    setPendingPath(null);
    setSteps(nextSteps);
    setStepIndex(0);
    setActive(true);
    return true;
  };

  const startCurrentTour = () => startForPath(location.pathname);

  useEffect(() => {
    // After route navigation completes, start the tour that was requested from another page.
    if (!pendingPath) return;
    if (currentPath !== pendingPath) return;
    const nextSteps = tourByPath[pendingPath] || [];
    if (!nextSteps.length) {
      setPendingPath(null);
      return;
    }
    setSteps(nextSteps);
    setStepIndex(0);
    setActive(true);
    setPendingPath(null);
  }, [currentPath, pendingPath]);

  useEffect(() => {
    if (!active) return;
    if (!steps.length) {
      stop();
      return;
    }
    if (stepIndex > steps.length - 1) setStepIndex(steps.length - 1);
  }, [active, stepIndex, steps.length]);

  useEffect(() => {
    if (!active || !currentStep) return;

    const computeRect = () => {
      // Find the DOM element for the current step and measure it so the overlay
      // can draw a highlight box around it.
      const target = currentStep.selector
        ? document.querySelector(currentStep.selector)
        : null;

      if (!target) {
        setRect(null);
        setStepMissing(!!currentStep.selector);
        return;
      }

      const box = target.getBoundingClientRect();
      setRect({
        top: Math.max(0, box.top - PADDING),
        left: Math.max(0, box.left - PADDING),
        width: box.width + PADDING * 2,
        height: box.height + PADDING * 2,
      });
      setStepMissing(false);

      // Scroll the target into view so the highlighted element is visible before the user reads the tooltip.
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    };

    const schedule = () => {
      // requestAnimationFrame avoids measuring layout in the middle of React rendering.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(computeRect);
    };

    schedule();
    const onResize = () => schedule();
    const onScroll = () => schedule();

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [active, currentStep, stepIndex]);

  useEffect(() => {
    // Basic keyboard controls make the tour usable without clicking the buttons.
    if (!active) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        setStepIndex((i) => (i < steps.length - 1 ? i + 1 : i));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, steps.length]);

  const tooltipStyle = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth || 1280 : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight || 720 : 720;
    const panelWidth = Math.min(PANEL_W, vw - 24);

    if (!rect) {
      // If no target is visible, center the tooltip and show the step as a general note.
      return {
        top: Math.max(12, vh / 2 - 110),
        left: Math.max(12, (vw - panelWidth) / 2),
        width: panelWidth,
      };
    }

    let top = rect.top + rect.height + 12;
    if (top + 220 > vh) top = Math.max(12, rect.top - 228);

    let left = rect.left;
    if (left + panelWidth > vw - 12) left = vw - panelWidth - 12;
    if (left < 12) left = 12;

    return { top, left, width: panelWidth };
  }, [rect, stepIndex]);

  const value = {
    active,
    startCurrentTour,
    startForPath,
    stop,
    hasTourForPath,
    hasCurrentTour: currentSteps.length > 0,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {active &&
        // Render the overlay at document.body level so it sits above the whole app.
        createPortal(
          <TourOverlay
            rect={rect}
            step={currentStep}
            stepIndex={stepIndex}
            totalSteps={steps.length}
            tooltipStyle={tooltipStyle}
            onPrev={() => setStepIndex((i) => Math.max(0, i - 1))}
            onNext={() =>
              setStepIndex((i) => {
                if (i >= steps.length - 1) {
                  stop();
                  return i;
                }
                return i + 1;
              })
            }
            onClose={stop}
            stepMissing={stepMissing}
          />,
          document.body
        )}
    </TourContext.Provider>
  );
}

export { TourContext };

function TourOverlay({
  rect,
  step,
  stepIndex,
  totalSteps,
  tooltipStyle,
  onPrev,
  onNext,
  onClose,
  stepMissing,
}) {
  if (!step) return null;

  return (
    <div style={overlayStyles.root} aria-live="polite">
      {/* Clicking outside the panel closes the tour. */}
      <div style={overlayStyles.scrim} onClick={onClose} />

      {rect && (
        <div
          style={{
            ...overlayStyles.highlight,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: `0 0 0 9999px rgba(3, 4, 8, 0.72)`,
          }}
        />
      )}

      {/* When there is no target element, dim the full screen instead of cutting out a highlight hole. */}
      {!rect && <div style={overlayStyles.fullMask} />}

      <section
        role="dialog"
        aria-label="Guided tour"
        style={{
          ...overlayStyles.panel,
          ...tooltipStyle,
        }}
      >
        <div style={overlayStyles.kicker}>
          Guided Tour
          <span style={overlayStyles.count}>
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>
        <h3 style={overlayStyles.title}>{step.title}</h3>
        <p style={overlayStyles.body}>{step.body}</p>
        {stepMissing && (
          <div style={overlayStyles.warn}>
            This element is not visible right now, so the step is shown as a general note.
          </div>
        )}

        <div style={overlayStyles.actions}>
          <button type="button" onClick={onClose} style={overlayStyles.ghostBtn}>
            Skip
          </button>
          <button type="button" onClick={onPrev} style={overlayStyles.ghostBtn} disabled={stepIndex === 0}>
            Prev
          </button>
          <button type="button" onClick={onNext} style={overlayStyles.primaryBtn}>
            {stepIndex === totalSteps - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}

const overlayStyles = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    pointerEvents: "none",
  },
  scrim: {
    position: "absolute",
    inset: 0,
    background: "transparent",
    pointerEvents: "auto",
  },
  fullMask: {
    position: "absolute",
    inset: 0,
    background: "rgba(3, 4, 8, 0.72)",
  },
  highlight: {
    position: "fixed",
    borderRadius: 14,
    border: "2px solid rgba(127,223,255,0.95)",
    background: "rgba(127,223,255,0.08)",
    pointerEvents: "none",
    animation: "tourPulse 1.6s ease-in-out infinite",
  },
  panel: {
    position: "fixed",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(14,16,22,0.96)",
    color: "#f5f9ff",
    padding: 14,
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    pointerEvents: "auto",
  },
  kicker: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.35,
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  count: {
    color: "#a8eaff",
    fontWeight: 900,
  },
  title: {
    margin: 0,
    fontSize: 17,
    lineHeight: 1.2,
  },
  body: {
    margin: "8px 0 0 0",
    color: "rgba(236,242,248,0.84)",
    lineHeight: 1.45,
    fontSize: 13,
  },
  warn: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 1.35,
    color: "#ffd693",
    border: "1px solid rgba(255,214,147,0.22)",
    background: "rgba(255,214,147,0.07)",
    borderRadius: 10,
    padding: "7px 9px",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  ghostBtn: {
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    padding: "8px 10px",
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryBtn: {
    borderRadius: 10,
    border: "1px solid rgba(127,223,255,0.28)",
    background: "rgba(127,223,255,0.16)",
    color: "#dff7ff",
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
};
