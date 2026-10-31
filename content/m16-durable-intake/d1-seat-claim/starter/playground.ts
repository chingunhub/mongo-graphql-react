import { Seat } from './model';
import { claimSeat } from './claim';
const seat = await Seat.create({});
console.log(await Promise.all([claimSeat(String(seat._id), 0), claimSeat(String(seat._id), 0)]));
console.log(await Seat.findById(seat._id).lean());
