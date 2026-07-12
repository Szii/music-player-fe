import { TutorialStep } from '../models/tutorial-step';

/**
 * The onboarding tour, in order. Add/remove/reorder freely — the dialog renders
 * however many there are. Screenshots live in `public/tutorial/`.
 *
 * Every text field is a translation key; the dialog resolves them through
 * Transloco, so the copy lives in `public/i18n/<lang>.json`.
 *
 * ponytail: hardcoded content. A fixed tour needs no CMS/backend/config.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: 'tutorial.welcome.title',
    body: 'tutorial.welcome.body',
    image: '/tutorial/tracks-create.webp',
    alt: 'tutorial.welcome.alt',
  },
  {
    title: 'tutorial.addTrack.title',
    body: 'tutorial.addTrack.body',
    image: '/tutorial/track-create-popup.webp',
    alt: 'tutorial.addTrack.alt',
  },
  {
    title: 'tutorial.manageTracks.title',
    body: 'tutorial.manageTracks.body',
    image: '/tutorial/track-create-finish.webp',
    alt: 'tutorial.manageTracks.alt',
  },
  {
    title: 'tutorial.windows.title',
    body: 'tutorial.windows.body',
    image: '/tutorial/tracks-windows.webp',
    alt: 'tutorial.windows.alt',
  },
  {
    title: 'tutorial.groups.title',
    body: 'tutorial.groups.body',
    image: '/tutorial/group-create.webp',
    alt: 'tutorial.groups.alt',
  },
  {
    title: 'tutorial.groupName.title',
    body: 'tutorial.groupName.body',
    image: '/tutorial/groups-create-popup.webp',
    alt: 'tutorial.groupName.alt',
  },
  {
    title: 'tutorial.groupTracks.title',
    body: 'tutorial.groupTracks.body',
    image: '/tutorial/groups-add-track.webp',
    alt: 'tutorial.groupTracks.alt',
  },
  {
    title: 'tutorial.sessions.title',
    body: 'tutorial.sessions.body',
    image: '/tutorial/session-create.webp',
    alt: 'tutorial.sessions.alt',
  },
  {
    title: 'tutorial.stages.title',
    body: 'tutorial.stages.body',
    image: '/tutorial/boards-create.webp',
    alt: 'tutorial.stages.alt',
  },
  {
    title: 'tutorial.createStage.title',
    body: 'tutorial.createStage.body',
    image: '/tutorial/boards-create-popup.webp',
    alt: 'tutorial.createStage.alt',
  },
  {
    title: 'tutorial.playStage.title',
    body: 'tutorial.playStage.body',
    image: '/tutorial/boards-overview.webp',
    alt: 'tutorial.playStage.alt',
  },
  {
    title: 'tutorial.settings.title',
    body: 'tutorial.settings.body',
    image: '/tutorial/boards-settings.webp',
    alt: 'tutorial.settings.alt',
  },
  {
    title: 'tutorial.workshop.title',
    body: 'tutorial.workshop.body',
    image: '/tutorial/workshop-overview.webp',
    alt: 'tutorial.workshop.alt',
  },
  {
    title: 'tutorial.profile.title',
    body: 'tutorial.profile.body',
    image: '/tutorial/profile-overview.webp',
    alt: 'tutorial.profile.alt',
  },
  {
    title: 'tutorial.faq.title',
    body: 'tutorial.faq.body',
    faq: [
      { question: 'tutorial.faq.q1', answer: 'tutorial.faq.a1' },
      { question: 'tutorial.faq.q2', answer: 'tutorial.faq.a2' },
      { question: 'tutorial.faq.q3', answer: 'tutorial.faq.a3' },
      { question: 'tutorial.faq.q4', answer: 'tutorial.faq.a4' },
      { question: 'tutorial.faq.q5', answer: 'tutorial.faq.a5' },
      { question: 'tutorial.faq.q6', answer: 'tutorial.faq.a6' },
      { question: 'tutorial.faq.q7', answer: 'tutorial.faq.a7' },
      { question: 'tutorial.faq.q8', answer: 'tutorial.faq.a8' },
    ],
  },
];
