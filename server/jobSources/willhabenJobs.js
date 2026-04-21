export const willhabenJobsSource = {
  id: 'willhaben-jobs',
  label: 'willhaben Jobs',
  async search() {
    // willhaben.at explicitly forbids automated access in robots.txt and
    // disallows /jobs/suche?... plus /jobs/webapi/. Keep this source as an
    // integration placeholder until there is approved API/feed access.
    throw new Error('willhaben Jobs disallows automated scraping without explicit permission.');
  },
};
