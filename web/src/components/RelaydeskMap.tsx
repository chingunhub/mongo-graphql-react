import { relaydeskLayers, relaydeskJourney, type Journey } from '../../../shared/relaydesk';
import { ProjectMap } from './ProjectMap';

const JOURNEYS: { id: Journey; label: string }[] = [
  { id: 'query', label: 'Read the inbox' },
  { id: 'triage', label: 'Triage a ticket' },
  { id: 'delivery', label: 'Deliver an event' },
  { id: 'recovery', label: 'Recover after an effect' },
];

export function RelaydeskMap({ openFile }: { openFile: (path: string) => void }) {
  return (
    <ProjectMap
      name="Relaydesk"
      workspace="relaydesk"
      layers={relaydeskLayers}
      journeys={JOURNEYS}
      framesFor={(id) => relaydeskJourney(id as Journey)}
      firstPiece="inbox"
      intro="Every checkpoint owns real files. Select a piece to see its responsibility, source and lesson."
      openFile={openFile}
    />
  );
}
