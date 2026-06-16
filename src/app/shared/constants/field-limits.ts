/**
 * Maximum input lengths enforced by the backend (OpenAPI `maxLength` on the
 * create/update request DTOs). Kept in one place so the UI stays in sync with
 * the API contract — update these if the spec changes.
 */
export const FIELD_LIMITS = {
  track: {
    /** CreateTrackRequestV2 / UpdateTrackRequestV2 / TrackRequest.trackName */
    name: 40,
    /** TrackRequest.trackLink (create) */
    linkCreate: 2048,
    /** UpdateTrackRequestV2.trackLink (update) */
    linkUpdate: 2048,
  },
  trackWindow: {
    /** TrackWindowRequest.name */
    name: 30,
  },
  trackShare: {
    /** PublishTrackRequest.description */
    description: 100,
  },
  group: {
    /** GroupRequest.listName */
    name: 30,
  },
  board: {
    /** BoardCreateRequest.name / BoardUpdateRequest.name */
    name: 30,
  },
  session: {
    /** SessionRequest.sessionName */
    name: 30,
    /** SessionRequest.sessionDescription */
    description: 100,
  },
  user: {
    /** UserRegisterRequest.name */
    name: 30,
    /** UserRegisterRequest.email */
    email: 100,
    /** UserRegisterRequest.password / change-password / reset-password */
    password: 150,
  },
} as const;
