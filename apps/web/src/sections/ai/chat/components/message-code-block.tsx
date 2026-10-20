import { useHighlightedCode } from "@/hooks/use-highlighted-code";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@/components/icons";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockContent,
  CodeBlockLine,
} from "@/components/ui/shadcn-code-block";

// The frame stays application-owned; highlighting follows the shadcn streaming
// pattern, including incremental grammar state and a plain-text fallback.
export function MessageCodeBlock({ code, language }: { code: string; language: string }) {
  const lines = useHighlightedCode(code, language);
  return (
    <CodeBlock className="my-4 gap-2 rounded-xl bg-surface-secondary p-2" data-language={language}>
      <CodeBlockHeader className="h-8 p-0">
        <CodeBlockTitle className="ml-1 font-mono font-normal text-content-secondary lowercase">
          {language}
        </CodeBlockTitle>
        <CodeBlockActions>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Download code"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([code], { type: "text/plain;charset=utf-8" }),
              );
              try {
                const link = document.createElement("a");
                link.href = url;
                link.download = `code.${language === "text" ? "txt" : language}`;
                link.click();
              } finally {
                URL.revokeObjectURL(url);
              }
            }}
          >
            <DownloadIcon />
          </Button>
          <CodeBlockCopyButton value={code} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent
        lineNumbers
        className="m-0 rounded-md border bg-surface-canvas p-4! text-sm"
      >
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}
