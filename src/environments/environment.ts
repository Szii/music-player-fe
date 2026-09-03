export const environment = {
  production: true,
  apiUrl: 'api/v1',
  /**
   * Primary search source: a Piped instance. Empty disables it
  */
  pipedApiUrl: 'https://api.piped.private.coffee',
  /** Fallback only, used when the Piped instance fails. Empty disables it. */
  youtubeApiKey: '',
};
