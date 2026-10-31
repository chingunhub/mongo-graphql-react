import { Team } from './models/Team';
import { Player } from './models/Player';
import { getRoster } from './services/roster';

const hawks = await Team.create({ name: 'Harbor Hawks', city: 'Portside' });
const theo = await Player.create({ name: 'Theo', number: 7, team: hawks._id });
await Player.create({ name: 'Ines', number: 4, team: hawks._id });
hawks.captain = theo._id;
await hawks.save();

// What does the data actually look like? Start here.
console.log('players in DB:', await Player.countDocuments({ team: hawks._id }));

console.log(await getRoster(String(hawks._id)));
