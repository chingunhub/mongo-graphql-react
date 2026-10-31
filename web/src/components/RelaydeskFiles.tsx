import { api } from '../api';
import { ProjectFiles, type SourceMode } from './ProjectFiles';

const MODES: SourceMode[] = [
  {
    id: 'mine',
    label: 'My workspace',
    list: 'mine',
    notice:
      'Your saved implementations, unfinished starters and supplied infrastructure. Editing happens in the owning checkpoint, or in a full local export.',
  },
  {
    id: 'reference',
    label: 'Reference answers',
    list: 'reference',
    notice:
      'Reference answers are visible. Viewing them does not copy code into your workspace or award progress.',
  },
];

export function RelaydeskFiles({
  selected,
  choose,
  mode,
  setMode,
  exportSource,
  busy,
}: {
  selected: string;
  choose: (p: string) => void;
  mode: 'mine' | 'reference';
  setMode: (m: 'mine' | 'reference') => void;
  exportSource: () => void;
  busy: boolean;
}) {
  return (
    <ProjectFiles
      selected={selected}
      choose={choose}
      mode={mode}
      setMode={(m) => setMode(m as 'mine' | 'reference')}
      modes={MODES}
      listFiles={api.relaydeskSource}
      readFile={api.relaydeskFile}
      exportSource={exportSource}
      busy={busy}
      ownerLabel="Open owning checkpoint →"
    />
  );
}
