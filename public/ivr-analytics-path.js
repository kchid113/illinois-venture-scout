/*
 * Simple Analytics path redaction.
 * Never send raw company slugs, private workspace pages, query strings, notes,
 * source URLs, user IDs, or authentication paths as analytics dimensions.
 * This public file intentionally contains no credentials or app state.
 */
window.ivrAnalyticsPath = function ivrAnalyticsPath(input) {
  var path = input && typeof input.path === 'string' ? input.path : '';
  if (path === '/' || path === '/overview') return '/overview';
  if (path === '/discover') return '/discover';
  if (path === '/activity') return '/activity';
  if (path === '/sources') return '/sources';
  if (path === '/methodology') return '/methodology';
  return '/private-workspace';
};
