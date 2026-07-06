const axios = require('axios');
require('dotenv').config();

const openRouterKey = process.env.OPENROUTER_API_KEY;

const openRouterClient = axios.create({
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'Authorization': `Bearer ${openRouterKey}`,
    'HTTP-Referer': 'https://github-automation-bot.local', // Required by OpenRouter rules
    'X-Title': 'GitHub Automation Bot', // Required by OpenRouter rules
    'Content-Type': 'application/json'
  }
});

module.exports = openRouterClient;
