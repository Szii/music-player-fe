import { LinkedBoardMode } from '../../../api/generated';

/** A board that another board can hand playback over to when it ends. */
export interface LinkedBoardChoice {
  id: string;
  /** Display name, already falling back to "Stage N" for unnamed boards. */
  name: string;
}

/** The After-playback choice emitted by a board card (board null = do nothing). */
export interface LinkedBoardSelection {
  boardId: string | null;
  mode: LinkedBoardMode;
}
