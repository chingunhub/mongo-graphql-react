import ReactMarkdown from 'react-markdown';

/** Renders a short markdown string inline (code spans, bold, links) without wrapping <p>. */
export function InlineMd({ text }: { text: string }) {
  return (
    <span className="prose-inline">
      <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{text}</ReactMarkdown>
    </span>
  );
}
