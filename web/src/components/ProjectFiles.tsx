import { useEffect, useMemo, useState } from 'react';
import type { ProjectFile } from '../api';
import { CodeBlock } from './CodeBlock';
import { lineDiff } from './lineDiff';
import { onLinkClick } from '../router';

type Kind = 'mine' | 'reference';

export interface SourceMode {
  id: string;
  label: string;
  notice: string;
  /** Which version fills the file tree. */
  list: Kind;
  compare?: boolean;
}

function Folder({
  entries,
  prefix,
  selected,
  choose,
}: {
  entries: ProjectFile[];
  prefix: string;
  selected: string;
  choose: (p: string) => void;
}) {
  const groups = new Map<string, ProjectFile[]>(),
    files: ProjectFile[] = [];
  for (const file of entries) {
    const relative = file.path.slice(prefix.length),
      slash = relative.indexOf('/');
    if (slash < 0) files.push(file);
    else {
      const name = relative.slice(0, slash);
      groups.set(name, [...(groups.get(name) ?? []), file]);
    }
  }
  return (
    <ul className="relay-file-list">
      {[...groups].map(([name, children]) => (
        <li key={name}>
          <details open>
            <summary>
              {name}/ <small>{children.length}</small>
            </summary>
            <Folder entries={children} prefix={prefix + name + '/'} selected={selected} choose={choose} />
          </details>
        </li>
      ))}
      {files.map((file) => (
        <li key={file.path}>
          <button
            className={file.path === selected ? 'selected' : ''}
            title={file.path}
            aria-current={file.path === selected ? 'true' : undefined}
            onClick={() => choose(file.path)}
          >
            {file.path.slice(prefix.length)}
            <span>{file.origin === 'saved' ? 'saved' : file.role === 'build' ? 'build' : ''}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Compare({ mine, reference }: { mine: string; reference: string }) {
  const rows = useMemo(() => lineDiff(mine, reference), [mine, reference]);
  if (!rows.length || rows.every((row) => row.kind === 'same' || row.kind === 'gap'))
    return <p className="project-diff-same">Your file matches the reference line for line.</p>;
  return (
    <>
      <p className="project-diff-legend">
        <span className="mine">− yours</span> <span className="reference">+ reference</span>
      </p>
      <pre className="project-diff">
        {rows.map((row, i) => (
          <span key={i} className={row.kind}>
            {row.kind === 'mine' ? '− ' : row.kind === 'reference' ? '+ ' : row.kind === 'gap' ? '⋯ ' : '  '}
            {row.text}
            {'\n'}
          </span>
        ))}
      </pre>
    </>
  );
}

export function ProjectFiles({
  selected,
  choose,
  mode,
  setMode,
  modes,
  listFiles,
  readFile,
  exportSource,
  busy = false,
  ownerLabel,
  emptyText = 'No files match.',
}: {
  selected: string;
  choose: (p: string) => void;
  mode: string;
  setMode: (m: string) => void;
  modes: SourceMode[];
  listFiles: (kind: Kind) => Promise<{ entries: ProjectFile[] }>;
  readFile: (kind: Kind, path: string) => Promise<{ content: string }>;
  exportSource?: () => void;
  busy?: boolean;
  ownerLabel: string;
  emptyText?: string;
}) {
  const current = modes.find((m) => m.id === mode) ?? modes[0];
  const [entries, setEntries] = useState<ProjectFile[]>([]),
    [filter, setFilter] = useState('');
  const [content, setContent] = useState<string | null>(null),
    [theirs, setTheirs] = useState<string | null>(null),
    [error, setError] = useState(''),
    [listing, setListing] = useState(true);
  useEffect(() => {
    let active = true;
    setListing(true);
    setEntries([]);
    setError('');
    listFiles(current.list)
      .then((result) => {
        if (!active) return;
        setEntries(result.entries);
        if (result.entries.length && !result.entries.some((e) => e.path === selected))
          choose(result.entries[0].path);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setListing(false);
      });
    return () => {
      active = false;
    };
  }, [current.list]);
  const info = entries.find((e) => e.path === selected);
  useEffect(() => {
    if (!info) return;
    let active = true;
    setContent(null);
    setTheirs(null);
    setError('');
    readFile(current.compare ? 'mine' : current.list, selected)
      .then((result) => {
        if (active) setContent(result.content);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (current.compare)
      readFile('reference', selected)
        .then((result) => {
          if (active) setTheirs(result.content);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [current.id, selected, !!info]);
  const visible = useMemo(
    () => entries.filter((e) => e.path.toLowerCase().includes(filter.toLowerCase())),
    [entries, filter],
  );
  const extension = selected.split('.').pop() ?? 'text';
  const lang = ['ts', 'tsx', 'js', 'json', 'css', 'graphql', 'yaml', 'md'].includes(extension)
    ? extension
    : 'text';
  return (
    <>
      <div className="relay-source-toolbar">
        <label>
          Source{' '}
          <select aria-label="Source version" value={mode} onChange={(e) => setMode(e.target.value)}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span>{entries.length} files · read-only browser</span>
        {exportSource && (
          <button className="btn small" disabled={busy} onClick={exportSource}>
            Export all files
          </button>
        )}
      </div>
      <p className={'relay-source-notice' + (current.list === 'reference' ? ' reference' : '')}>
        {current.notice}
      </p>
      <div className="relay-source-layout card">
        <aside className="relay-file-tree" aria-label="Project files">
          <label className="relay-file-search">
            Find a file
            <input
              type="search"
              placeholder="e.g. resolvers or .tsx"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          {listing ? (
            <p>Loading project files…</p>
          ) : visible.length ? (
            <Folder key={filter} entries={visible} prefix="" selected={selected} choose={choose} />
          ) : (
            <p>{entries.length ? 'No files match.' : emptyText}</p>
          )}
        </aside>
        <section className="relay-source-content" aria-label="Selected source file">
          {info ? (
            <>
              <header>
                <strong>{selected}</strong>
                <small>
                  {info.origin} ·{' '}
                  {info.role === 'build'
                    ? 'You build'
                    : info.role === 'provided'
                      ? 'Supplied infrastructure'
                      : 'Project tooling'}
                  {' · ' + new Intl.NumberFormat().format(info.bytes) + ' bytes'}
                </small>
              </header>
              {info.purpose && <p className="section-sub">{info.purpose}</p>}
              {info.step && (
                <a className="btn small" href={'/learn/' + info.step} onClick={onLinkClick}>
                  {ownerLabel}
                </a>
              )}
              {error ? (
                <p role="alert">{error}</p>
              ) : content === null || (current.compare && theirs === null) ? (
                <p role="status">Loading source…</p>
              ) : current.compare ? (
                <Compare mine={content} reference={theirs!} />
              ) : content.length > 60000 ? (
                <pre className="relay-plain-source">{content}</pre>
              ) : (
                <CodeBlock code={content} lang={lang} showLang={false} />
              )}
            </>
          ) : (
            !listing && <p>{error || emptyText}</p>
          )}
        </section>
      </div>
    </>
  );
}
