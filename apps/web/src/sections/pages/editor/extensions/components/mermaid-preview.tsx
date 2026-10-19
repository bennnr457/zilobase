import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { mount } from "pele";

export default function MermaidPreview({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !source.trim()) return;
    const diagram = mount(containerRef.current, source, {
      sanitize: (svg) =>
        DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          RETURN_DOM_FRAGMENT: true,
        }),
    });
    return () => diagram.destroy();
  }, [source]);

  return (
    <div
      className="editor-mermaid-preview min-h-24 overflow-x-auto p-4"
      aria-label="Mermaid preview"
    >
      {source.trim() ? (
        <div ref={containerRef} />
      ) : (
        <p className="text-xs text-content-secondary">Write Mermaid code to preview a diagram.</p>
      )}
    </div>
  );
}
