const BASE_URL = 'https://jobs.ams.at';

function buildSearchUrl({ query, location }) {
  const url = new URL('/public/emps/', BASE_URL);
  url.searchParams.set('query', query || 'jobs');
  url.searchParams.set('location', location || 'Tirol');
  return url.toString();
}

export const amsAtSource = {
  id: 'ams-at',
  label: 'AMS alle jobs',
  async search(input) {
    buildSearchUrl(input);

    // The public AMS app uses an authorization layer for its server API.
    // Keep the source registered so it can be switched to an official feed
    // or approved integration without changing the aggregator contract.
    throw new Error('AMS alle jobs blocks unauthenticated server API requests.');
  },
};
