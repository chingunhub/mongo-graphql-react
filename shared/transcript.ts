// A voice call's transcript, built from GPT-Live's transcript deltas. Shared so the server (which
// saves it) and the panel (which shows it live) build the same turns.

export interface SpokenTurn {
  role: 'user' | 'assistant';
  text: string;
  /** "code": a snippet the mentor put in the panel, not speech. "typed": typed by the learner during the call. */
  kind?: 'code' | 'typed';
  /** Milliseconds from the start of the call. */
  start?: number;
  end?: number;
}

/** Short acknowledgements said while the other side talks. */
const BACKCHANNEL = /^(m+|mm+|hmm+|mhm|uh[- ]?huh|yeah|yep|yes|ok|okay|right|sure|got it|i see|ah|oh)$/i;
/** A backchannel this soon after the mentor's last words counts as said during its sentence. */
const DURING_MS = 1500;

/** Drops transcription notes like "[sigh]" (sometimes cut to "[sigh") and tidies spaces. */
export const cleanSpeech = (s: string) =>
  s
    .replace(/\[[a-z][a-z ]{0,24}(\]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const isBackchannel = (s: string) => BACKCHANNEL.test(cleanSpeech(s).replace(/[.,!?…]+/g, '').trim());

/**
 * Adds one delta. A learner's "mm" or "okay" said while the mentor is mid-sentence doesn't split
 * the mentor's turn in two: when the mentor carries on, the backchannel is dropped and the
 * sentence joined back together. The end of a learner's question that is transcribed late, after
 * the mentor has started answering, goes back into the question.
 */
export function addDelta(turns: SpokenTurn[], role: SpokenTurn['role'], delta: string, start?: number, end?: number) {
  const last = turns.at(-1);
  if (role === 'user' && last?.role === 'assistant' && !last.kind && start !== undefined && last.start !== undefined && start < last.start) {
    const prev = turns.at(-2);
    if (prev?.role === 'user' && !prev.kind) {
      prev.text += delta;
      if (end !== undefined) prev.end = Math.max(prev.end ?? end, end);
      return;
    }
  }
  if (role === 'assistant' && last?.role === 'user' && !last.kind) {
    const prev = turns.at(-2);
    const during =
      prev?.end === undefined || last.start === undefined ? true : last.start - prev.end < DURING_MS;
    if (prev?.role === 'assistant' && !prev.kind && during && isBackchannel(last.text)) {
      turns.pop();
      prev.text += delta;
      if (end !== undefined) prev.end = end;
      return;
    }
  }
  if (last && last.role === role && !last.kind) {
    last.text += delta;
    if (end !== undefined) last.end = end;
    return;
  }
  turns.push({ role, text: delta, start, end });
}

/** The turns worth keeping, cleaned: empty ones (only "[sigh]", say) are dropped. */
export const finalTurns = (turns: SpokenTurn[]) =>
  turns
    .map((t) => (t.kind ? t : { ...t, text: cleanSpeech(t.text) }))
    .filter((t) => t.text.trim());
