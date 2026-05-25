import { memo } from "react";
import { Streamdown } from "streamdown";

type Props = {
  children: string;
  /** When true, the trailing token is held back so partial markdown like
   *  unclosed code fences renders cleanly mid-stream. */
  isStreaming?: boolean;
  className?: string;
};

/**
 * Thin wrapper around Streamdown with sensible defaults for chat content.
 * Inline `code`, **bold**, *italic*, headings, lists, and fenced code blocks
 * all render correctly even mid-stream.
 */
function MarkdownImpl({ children, isStreaming, className }: Props) {
  return (
    <div className={"prose prose-sm dark:prose-invert max-w-none " + (className ?? "")}>
      <Streamdown parseIncompleteMarkdown={!!isStreaming}>{children}</Streamdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl, (prev, next) => {
  return prev.children === next.children && prev.isStreaming === next.isStreaming;
});
