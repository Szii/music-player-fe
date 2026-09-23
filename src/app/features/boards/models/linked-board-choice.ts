/** A board that another board can hand playback over to when it ends. */
export interface LinkedBoardChoice {
  id: string;
  /** Display name, already falling back to "Stage N" for unnamed boards. */
  name: string;
}

/**
 * What a board does with its linked board when its own playback ends:
 *  - `start`  — start the linked board from the beginning,
 *  - `resume` — the linked board is paused while this one plays and resumes
 *               from where it was paused.
 */
export type LinkedBoardAction = 'start' | 'resume';

/** The After-playback choice emitted by a board card. */
export interface LinkedBoardSelection {
  boardId: string | null;
  action: LinkedBoardAction;
}
