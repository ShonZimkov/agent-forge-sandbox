const OWNER = 'ShonZimkov';
const REPO = 'agent-forge-sandbox';
const BASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}`;
const USER_AGENT = 'agent-forge-dashboard';
const TIMEOUT_MS = 10_000;

/**
 * Makes an authenticated (if token available) request to the GitHub API.
 * @param {string} url - Full GitHub API URL
 * @returns {Promise<any>} Parsed JSON response
 */
async function githubFetch(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/vnd.github+json',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`GitHub API request timed out after ${TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText} for ${url}`
    );
  }

  return response.json();
}

/**
 * Fetches open and closed issues (up to 100, sorted by updated).
 * Filters out pull requests (GitHub includes PRs in the issues endpoint).
 * @returns {Promise<Array>} Array of issue objects
 */
export async function fetchIssues() {
  const url = `${BASE_URL}/issues?state=all&per_page=100&sort=updated`;
  const data = await githubFetch(url);
  return data.filter(item => !item.pull_request);
}

/**
 * Fetches open and recently closed/merged PRs (up to 30, sorted by updated).
 * @returns {Promise<Array>} Array of pull request objects
 */
export async function fetchPullRequests() {
  const url = `${BASE_URL}/pulls?state=all&per_page=30&sort=updated`;
  return githubFetch(url);
}

/**
 * Fetches the last 15 repo events.
 * @returns {Promise<Array>} Array of event objects
 */
export async function fetchRecentEvents() {
  const url = `${BASE_URL}/events?per_page=15`;
  return githubFetch(url);
}
