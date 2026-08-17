/**
 * The questions a proprietor asks, answered once.
 *
 * These lived inside the public portal page, which meant they were answered
 * only for a reader who opened the link — and the PDF is what gets forwarded to
 * a board, printed for a meeting and read offline. The document was silent on
 * the five things it is most often asked about, while the web page answered
 * them, which is the wrong way round: the document is the artefact that
 * survives the conversation.
 *
 * Written once, here, so the page and the printed sheet cannot drift. They did:
 * the portal was still promising a report-card QR that plays "a video of their
 * child", a share of "e.g. 30%" to schools on other splits, and hardware
 * allocated "within 48 hours of MoU execution" — none of which were true, and
 * all of which a school would have quoted back at us.
 *
 * The rule these follow is the rule the whole document follows: no figure that
 * belongs to `partnership_terms`, and no claim we cannot keep.
 */
export type ProprietorFaq = { q: string; a: string };

export const PROPRIETOR_FAQS: readonly ProprietorFaq[] = [
  {
    q: 'What if our school has no equipped computer laboratory?',
    a: 'You do not need one. Our facilitators bring the devices and kits to your timetable slot and take them away again. There is nothing for the school to build or buy.',
  },
  {
    q: 'Will this add work for our existing teachers?',
    a: 'No. Our facilitators deliver every session, mark the practical work and write the termly reports. Your staff observe, and co-teach only if they want to.',
  },
  {
    q: 'How is our share worked out and settled?',
    a: 'On the learners who actually enrol each term, at the share set out above — which also states when it is released and what a mid-term withdrawal costs.',
  },
  {
    q: 'What do parents actually receive?',
    a: 'A written progress report each term, and a portfolio of work that runs — a game, an app, a build. The report carries a code to verify it online.',
  },
  {
    q: 'How soon can teaching start?',
    a: 'The term after signing, in the slot you choose. Signing early reserves a facilitator before the roster fills.',
  },
];
