const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/services/dbService.js');
let content = fs.readFileSync(filePath, 'utf8');

const marker = 'getRevenueAnalytics: async (params = {}) => {';
if (!content.includes(marker)) {
  console.error('Marker not found!');
  process.exit(1);
}

const reviewsCode = `
  // ─── Reviews & Reputation ──────────────────────────────────────────────
  getReviews: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    if (params.provider) query.append('provider', params.provider);
    if (params.rating) query.append('rating', params.rating);
    if (params.sentiment) query.append('sentiment', params.sentiment);
    if (params.responseStatus) query.append('responseStatus', params.responseStatus);
    if (params.status) query.append('status', params.status);
    if (params.isDemo !== undefined && params.isDemo !== null) query.append('isDemo', params.isDemo);
    if (params.search) query.append('search', params.search);
    const queryStr = query.toString();
    const res = await apiClient.get(\`/reviews\${queryStr ? \`?\${queryStr}\` : ''}\`);
    return res.data;
  },

  getReviewStats: async (includeDemo = false) => {
    const res = await apiClient.get(\`/reviews/stats?includeDemo=\${includeDemo}\`);
    return res.data;
  },

  createReview: async (reviewData) => {
    const res = await apiClient.post('/reviews', reviewData);
    return res.data;
  },

  respondToReview: async (id, responseText) => {
    const res = await apiClient.post(\`/reviews/\${id}/respond\`, { responseText });
    return res.data;
  },

  updateReviewStatus: async (id, status) => {
    const res = await apiClient.patch(\`/reviews/\${id}/status\`, { status });
    return res.data;
  },

  getReviewProviders: async () => {
    const res = await apiClient.get('/reviews/providers');
    return res.data;
  },

  syncReviewProvider: async (provider) => {
    const res = await apiClient.post(\`/reviews/providers/\${provider}/sync\`);
    return res.data;
  },

  updateReviewProviderConfig: async (provider, config) => {
    const res = await apiClient.post(\`/reviews/providers/\${provider}/config\`, config);
    return res.data;
  },
};`;

// Replace the closing "};" at the end of the dbService object
const lastClosingBrace = content.lastIndexOf('};');
if (lastClosingBrace === -1) {
  console.error('Closing brace not found!');
  process.exit(1);
}

const updated = content.slice(0, lastClosingBrace) + reviewsCode + content.slice(lastClosingBrace + 2);
fs.writeFileSync(filePath, updated, 'utf8');
console.log('dbService.js updated successfully!');

