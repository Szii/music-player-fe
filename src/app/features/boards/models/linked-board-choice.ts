/** A board that another board can hand playback over to when it ends. */
export interface LinkedBoardChoice {
  id: string;
  /** Display name, already falling back to "Stage N" for unnamed boards. */
  name: string;
}
