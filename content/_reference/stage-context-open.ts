// Before module 8 there is no auth, so every request runs as Ada.
import { User } from '../server/models/User';

export const stageContext = async () => ({
  currentUser: await User.findOne({ email: 'ada@taskforge.dev' }),
});
