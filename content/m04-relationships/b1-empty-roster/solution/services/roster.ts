import { Team } from '../models/Team';
import '../models/Player';

export interface RosterPlayer {
  id: string;
  name: string;
  number: number;
  isCaptain: boolean;
}

export interface Roster {
  id: string;
  name: string;
  players: RosterPlayer[];
}

// Lean for speed: the roster page is read-heavy.
export async function getRoster(teamId: string): Promise<Roster | null> {
  const team: any = await Team.findById(teamId)
    .populate({ path: 'players', options: { sort: { number: 1 } } })
    .lean();
  if (!team) return null;

  return {
    // lean objects have no `id` virtual — build it from `_id`
    id: String(team._id),
    name: team.name,
    players: (team.players ?? []).map((p: any) => ({
      id: String(p._id),
      name: p.name,
      number: p.number,
      // ObjectIds are objects: compare values, not identity
      isCaptain: team.captain != null && String(p._id) === String(team.captain),
    })),
  };
}
