import { expect } from 'expect';
import { CLIENT_PORTAL_HEADER, CP_USER_HEADER, portalIdentity, readHeader, setHeader, type GatewayRequest } from '../gateway';
import { createModels, type Models } from '../models';
import { sign } from '../tokens';

const help = { _id: 'cp-help', name: 'Acme Help' };
const partners = { _id: 'cp-partners', name: 'Acme Partners' };
const mara = { _id: 'u-mara', clientPortalId: 'cp-help', email: 'mara@example.com', erxesCustomerId: 'c-17' };
const otto = { _id: 'u-otto', clientPortalId: 'cp-partners', email: 'otto@example.com' };

const helpToken = sign({ clientPortalId: help._id });
const partnersToken = sign({ clientPortalId: partners._id });
const maraToken = sign({ userId: mara._id }, 60_000);
const ottoToken = sign({ userId: otto._id }, 60_000);

function world() {
  const base = createModels([help, partners], [mara, otto]);
  const calls: { model: string; filter: Record<string, unknown> }[] = [];
  const models: Models = {
    ClientPortals: {
      findOne: (filter) => (calls.push({ model: 'ClientPortals', filter }), base.ClientPortals.findOne(filter)),
    },
    CPUsers: {
      findOne: (filter) => (calls.push({ model: 'CPUsers', filter }), base.CPUsers.findOne(filter)),
    },
  };
  return { models, calls };
}

async function identify(headers: Record<string, string | undefined>, cookies?: Record<string, string>) {
  const { models, calls } = world();
  const req: GatewayRequest = { headers: { ...headers }, cookies };
  await portalIdentity(req, models);
  return { req, calls };
}

test(
  'a header holds base64 JSON, and a broken one reads as undefined',
  () => {
    const headers: Record<string, string | undefined> = {};
    setHeader(headers, 'cpuser', { _id: 'u1', email: 'ünï@example.com' });
    expect(headers.cpuser).toBe(Buffer.from(JSON.stringify({ _id: 'u1', email: 'ünï@example.com' }), 'utf8').toString('base64'));
    expect(readHeader(headers, 'cpuser')).toEqual({ _id: 'u1', email: 'ünï@example.com' });
    expect(readHeader(headers, 'clientportal')).toBeUndefined();
    expect(readHeader({ cpuser: '' }, 'cpuser')).toBeUndefined();
    expect(readHeader({ cpuser: 'not base64 json' }, 'cpuser')).toBeUndefined();
  },
  { hint: 'Buffer.from(text, "utf8").toString("base64") one way, and the reverse with a try/catch the other way.' },
);

test(
  'no app token: nobody, and nothing is looked up',
  async () => {
    const { req, calls } = await identify({});
    expect(req.clientPortal).toBeUndefined();
    expect(req.cpUser).toBeUndefined();
    expect(req.headers[CLIENT_PORTAL_HEADER]).toBeUndefined();
    expect(calls).toEqual([]);
  },
  { hint: 'Return early when there is no x-app-token.' },
);

test(
  'an app token alone names the portal, with nobody signed in',
  async () => {
    const { req, calls } = await identify({ 'x-app-token': helpToken });
    expect(req.clientPortal).toEqual(help);
    expect(readHeader(req.headers, CLIENT_PORTAL_HEADER)).toEqual(help);
    expect(req.cpUser).toBeUndefined();
    expect(req.headers[CP_USER_HEADER]).toBeUndefined();
    expect(calls.map((call) => call.model)).toEqual(['ClientPortals']);
  },
  { hint: 'Verify the token, find the portal by the clientPortalId in its payload, then set req.clientPortal and the header.' },
);

test(
  'both tokens: the portal and its signed-in user',
  async () => {
    const { req } = await identify({ 'x-app-token': helpToken, 'client-auth-token': maraToken });
    expect(req.clientPortal).toEqual(help);
    expect(req.cpUser).toEqual(mara);
    expect(readHeader(req.headers, CP_USER_HEADER)).toEqual(mara);
  },
  { hint: 'The auth token payload has a userId.' },
);

test(
  'the auth token may arrive as a cookie, and a header wins over it',
  async () => {
    const viaCookie = await identify({ 'x-app-token': helpToken }, { 'client-auth-token': maraToken });
    expect(viaCookie.req.cpUser).toEqual(mara);
    const both = await identify(
      { 'x-app-token': helpToken, 'client-auth-token': maraToken },
      { 'client-auth-token': sign({ userId: 'someone-else' }) },
    );
    expect(both.req.cpUser).toEqual(mara);
  },
  { hint: 'Read the header first, then fall back to req.cookies, which may be missing.' },
);

test(
  'a user token from another portal signs nobody in',
  async () => {
    const { req, calls } = await identify({ 'x-app-token': helpToken, 'client-auth-token': ottoToken });
    expect(req.clientPortal).toEqual(help);
    expect(req.cpUser).toBeUndefined();
    expect(req.headers[CP_USER_HEADER]).toBeUndefined();
    expect(calls.at(-1)).toEqual({ model: 'CPUsers', filter: { _id: otto._id, clientPortalId: help._id } });
    const own = await identify({ 'x-app-token': partnersToken, 'client-auth-token': ottoToken });
    expect(own.req.cpUser).toEqual(otto);
  },
  { hint: 'Ask for the user ID and this portal in one findOne filter.' },
);

test(
  'a user token without an app token is never looked at',
  async () => {
    const { req, calls } = await identify({ 'client-auth-token': maraToken });
    expect(req.cpUser).toBeUndefined();
    expect(calls).toEqual([]);
  },
  { hint: 'The user check belongs inside the portal check.' },
);

test(
  'broken, expired and unknown tokens never throw: they attach less',
  async () => {
    const expired = sign({ userId: mara._id }, -1);
    const tampered = maraToken.slice(0, -2) + (maraToken.endsWith('AA') ? 'BB' : 'AA');
    for (const auth of [expired, tampered, 'garbage', sign({ userId: 'u-nobody' })]) {
      const { req } = await identify({ 'x-app-token': helpToken, 'client-auth-token': auth });
      expect(req.clientPortal).toEqual(help);
      expect(req.cpUser).toBeUndefined();
      expect(req.headers[CP_USER_HEADER]).toBeUndefined();
    }
    for (const app of ['garbage', sign({ clientPortalId: 'cp-gone' }), sign({ clientPortalId: help._id }, -1)]) {
      const { req } = await identify({ 'x-app-token': app, 'client-auth-token': maraToken });
      expect(req.clientPortal).toBeUndefined();
      expect(req.cpUser).toBeUndefined();
      expect(req.headers[CLIENT_PORTAL_HEADER]).toBeUndefined();
    }
  },
  { hint: 'verify throws. Catch it for each token separately, so a bad user token still leaves the portal known.' },
);

test(
  "a caller can't supply the identity headers themselves",
  async () => {
    const forged = Buffer.from(JSON.stringify({ _id: 'u-admin', clientPortalId: help._id }), 'utf8').toString('base64');
    const anonymous = await identify({ [CP_USER_HEADER]: forged, [CLIENT_PORTAL_HEADER]: forged });
    expect(anonymous.req.headers[CP_USER_HEADER]).toBeUndefined();
    expect(anonymous.req.headers[CLIENT_PORTAL_HEADER]).toBeUndefined();
    const portalOnly = await identify({ 'x-app-token': helpToken, [CP_USER_HEADER]: forged });
    expect(readHeader(portalOnly.req.headers, CLIENT_PORTAL_HEADER)).toEqual(help);
    expect(portalOnly.req.headers[CP_USER_HEADER]).toBeUndefined();
  },
  { hint: 'Delete both identity headers before doing anything else. Only this function may fill them.' },
);
