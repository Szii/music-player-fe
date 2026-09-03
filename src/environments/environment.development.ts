export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api/v1',
  /** Browser key for the YouTube Data API v3. Empty disables YouTube search. */
  /**
   * Primary search source: a Piped instance (no key, no quota). Empty disables it.
    */
  pipedApiUrl: 'https://api.piped.private.coffee',
  /** Fallback only, used when the Piped instance fails. Empty disables it. */
  youtubeApiKey: '',
};
