import { TutorialStep } from '../models/tutorial-step';

/**
 * The onboarding tour, in order. Add/remove/reorder freely — the dialog renders
 * however many there are. Screenshots live in `public/tutorial/`.
 *
 * ponytail: hardcoded content. A fixed tour needs no CMS/backend/config.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: 'Welcome to Sound Master’s Lair',
    body: 'Build living soundscapes for your sessions. This quick tour walks through <strong>tracks</strong>, <strong>loop windows</strong>, <strong>groups</strong>, <strong>boards</strong>, and the <strong>workshop</strong>. Start by adding your first track.',
    image: '/tutorial/tracks-create.png',
    alt: 'Empty Tracks page with a "Create your first track" card',
  },
  {
    title: 'Add a track',
    body: 'Start by creating your first track. Give the track a <strong>name</strong> and paste a <strong>YouTube link</strong>. That’s all it takes to bring audio into your library.',
    image: '/tutorial/track-create-popup.png',
    alt: 'Add Track dialog with a name field and a YouTube link field',
  },
  {
    title: 'Manage your tracks',
    body: 'Each track has a <strong>row menu</strong>. From there, you can edit its details, edit its <strong>loop windows</strong>, open the source, or delete it.',
    image: '/tutorial/track-create-finish.png',
    alt: 'Tracks list with an open row menu showing Edit track, Edit windows, Open source, Delete',
  },
  {
    title: 'Loop windows',
    body: 'Do you want to play only a part or some parts of a track? A <strong>window</strong> is a slice of a track that may be looped seamlessly. Set the <strong>from/to</strong> range, a <strong>crossfade</strong> for a clean seam, and preview before saving.',
    image: '/tutorial/tracks-windows.png',
    alt: 'Windows editor showing a loop range, crossfade strength, and a preview player',
  },
  {
    title: 'Groups',
    body: 'Groups let you organise tracks by <strong>mood or scene</strong> — combat, ambient, tavern. Start by creating your first group.',
    image: '/tutorial/group-create.png',
    alt: 'Empty Groups page with a "Create your first group" card',
  },
  {
    title: 'Name the group',
    body: 'Give the group a nice, recognisable name.',
    image: '/tutorial/groups-create-popup.png',
    alt: 'Create Group dialog with a name field',
  },
  {
    title: 'Add tracks to a group',
    body: 'Search and select the tracks that belong in this group. A track can live in <strong>more than one group</strong>.',
    image: '/tutorial/groups-add-track.png',
    alt: 'Edit tracks dialog with a searchable, selectable list of tracks',
  },
  {
    title: 'Sessions',
    body: 'A <strong>session</strong> holds the boards for one game — think of it as your setup, where you control the flow of music. Create your first session to get started. You can of course have <strong>multiple sessions</strong> for different setups.',
    image: '/tutorial/session-create.png',
    alt: 'Boards page with a "Create your first session" card',
  },
  {
    title: 'Boards',
    body: 'Boards are application bread and butter - your <strong>play surface</strong>. Each one plays a track or a playlist independtatly on demand during the session. Start by creating your first board.',
    image: '/tutorial/boards-create.png',
    alt: 'Session with a "Create your first music board" card',
  },
  {
    title: 'Create a board',
    body: 'Name the board and optionally pick the track which should be initially selected.',
    image: '/tutorial/boards-create-popup.png',
    alt: 'Create Board dialog with a name field and a track selector',
  },
  {
    title: 'Play a board',
    body: 'Hit <strong>play</strong> to start the playback for the specific board. Choose a <strong>group</strong>, <strong>track</strong>, and <strong>window</strong>. even in mid-play. Additionaly, switch to playlist mode if you need to play through all tracks in a selected group.',
    image: '/tutorial/boards-overview.png',
    alt: 'Board player with group/track/window selectors, single/playlist toggle, and a seek bar',
  },
  {
    title: 'Playback settings',
    body: 'Per-board options:<ul><li><strong>Loop mode</strong> — controls how track windows repeat: <em>Off</em> plays once, <em>Loop</em> repeats seamlessly, and <em>Sequence</em> cycles through all available windows in order.</li><li><strong>Overplay</strong> — lets this board play in parallel with others. Starting another board won’t mute this one.</li><li><strong>Keyboard shortcut</strong> — toggle the board without clicking.</li></ul>',
    image: '/tutorial/boards-settings.png',
    alt: 'Playback settings popover with loop mode, overplay, and keyboard shortcut options',
  },
  {
    title: 'Workshop',
    body: 'Have a track with nice windows, tight crossfades and want to share it? <strong>Publish</strong> your tracks so other Sound Masters can find and subscribe to them — and discover theirs.',
    image: '/tutorial/workshop-overview.png',
    alt: 'Workshop "My tracks" dialog listing tracks with publish status and subscribers',
  },
  {
    title: 'Your profile',
    body: 'See Your <strong>current limits</strong>, change Your <strong>password</strong>, and re-open this tutorial any time from the <strong>“?”</strong> button here.',
    image: '/tutorial/profile-overview.png',
    alt: 'User profile page showing account details and rank & limits',
  },
  {
    title: 'Questions & answers',
    body: 'A few things that come up often:',
    faq: [
      {
        question: 'What happens when I switch the track / window mid-play?',
        answer: 'The current track stops while board crossfades into the newly selected one.',
      },
      {
        question: 'Will the stopped board starts playing when I pre-select the track?',
        answer: 'No. Board wont play until you hit a start. You can even select a different group to prepare for new track selection while the board is still playing without changing the actual playback.',
      },
      {
        question: 'What happens if I hit play on a board while another board is playing?',
        answer: 'By default the other board stops while playback crossfades into new one, so only one board plays at a time. Enable <strong>Overplay</strong> in a board’s playback settings to let it play <em>in parallel</em> with others instead.',
      },
      {
        question: 'Can other users edit the tracks I publish?',
        answer: 'No. Other Sound Masters can subscribe to and play your published tracks. Only you can edit the original.',
      },
      {
        question: 'My track or window ends too abrubtly and looping does not sounds nice',
        answer: 'Go to <strong>Tracks</strong>, select the <strong>Edit windows</strong> option for the specific track and update the crossfade length for the window or whole track.',
      },
      {
        question: 'Sequence loop mode for board does not allow selection on some tracks',
        answer: 'Sequence mode needs at least two windows for track to be applicable on.',
      },
      {
        question: 'Background looping does not respect crossfades',
        answer: 'Some browsers, for example Safari, simple does not allow to process mutliple audio streams at once. In that case, try different browser. Application was sucessfuly tested on these browsers: <strong>Chrome, Edge, Brave and Firefox</strong>',
      },
      {
        question: 'Background looping does not work at all',
        answer: 'This is mainly problem of usage of IFrame Youtube API on mobile devices. IFrame API does not provide raw audio element, which can be processed by underling OS. But do not worry, there are some workarounds. Try to <strong>minimalize the browser window</strong> to be always in foucs, or <strong>turn on desktop mode</strong>.',
      },
    ],
  },
];
