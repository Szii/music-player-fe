/** A collapsible question/answer shown on a Q&A step. */
export interface TutorialFaq {
  question: string;
  /** May contain the same simple inline HTML as `TutorialStep.body`. */
  answer: string;
}

/** One page of the onboarding tour. Content is hardcoded in `tutorial-steps.ts`. */
export interface TutorialStep {
  title: string;
  /**
   * Short explanation of the feature. May contain simple inline HTML
   * (`<strong>`, `<em>`, `<br>`, `<ul>/<li>`) — it's trusted, hardcoded content
   * rendered via Angular's sanitizing `[innerHTML]`.
   */
  body: string;
  /**
   * Screenshot for wide viewports. Path under /public, e.g. '/tutorial/01-search.png'.
   * Omit on a Q&A step (provide `faq` instead).
   */
  image?: string;
  /** Accessible description of the screenshot. Required when `image` is set. */
  alt?: string;
  /** Optional narrow-viewport screenshot (a mobile-UI shot). Falls back to `image`. */
  imageMobile?: string;
  /** When set, the step renders this Q&A list instead of a screenshot. */
  faq?: readonly TutorialFaq[];
}
