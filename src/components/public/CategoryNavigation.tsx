"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CategoryNavigation({
  children,
  strings,
}: {
  children: ReactNode;
  strings: Record<string, string>;
}) {
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const nav = viewport.current;
    const list = content.current;
    if (!nav || !list) return;
    const update = () => {
      const bounds = nav.getBoundingClientRect();
      const items = list.getBoundingClientRect();
      const left = items.left < bounds.left - 1;
      const right = items.right > bounds.right + 1;
      setEdges((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(list);
    nav.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, []);
  function scroll(direction: number) {
    const nav = viewport.current;
    if (!nav) return;
    nav.scrollBy({
      left: direction * Math.max(160, nav.clientWidth * 0.65),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="category-navigation">
      <nav ref={viewport} aria-label={strings.menu} className="menu-categories">
        <div ref={content} className="menu-category-links">
          {children}
        </div>
      </nav>
      {([-1, 1] as const).map((direction) => {
        const left = direction === -1;
        const available = left ? edges.left : edges.right;
        const Icon = left ? ChevronLeft : ChevronRight;
        return (
          <button
            key={direction}
            type="button"
            className={`category-scroll-arrow ${left ? "left" : "right"}`}
            disabled={!available}
            aria-hidden={!available}
            aria-label={`${left ? strings.previous : strings.next}: ${strings.menu}`}
            onClick={() => scroll(direction)}
          >
            <Icon size={20} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
