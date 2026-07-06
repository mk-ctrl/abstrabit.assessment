const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const router = express.Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL; // || 'http://localhost:5173';

// 1. Initiate GitHub OAuth Redirect
router.get('/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GitHub Client ID is not configured on server.' });
  }
  const scope = 'repo,write:repo_hook';
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=${scope}`;
  res.redirect(githubAuthUrl);
});

// 2. OAuth Callback
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/auth-error?error=no_code_provided`);
  }

  try {
    // Exchange temporary code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const { access_token, error, error_description } = tokenResponse.data;

    if (error) {
      console.error('OAuth token exchange error:', error_description || error);
      return res.redirect(`${FRONTEND_URL}/auth-error?error=${encodeURIComponent(error)}`);
    }

    // Get user profile details from GitHub API
    const userProfileResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'User-Agent': 'github-automation-bot-backend',
      },
    });

    const githubUserId = userProfileResponse.data.id.toString();
    const githubUsername = userProfileResponse.data.login;

    // Generate JWT token containing the user identity and the access token (so frontend can pass it or we store it in JWT securely)
    const token = jwt.sign(
      {
        github_user_id: githubUserId,
        github_username: githubUsername,
        github_access_token: access_token, // Store in JWT so frontend holds session, keeping server stateless
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect user back to the frontend application
    res.redirect(`${FRONTEND_URL}/auth-callback?token=${token}&username=${githubUsername}&github_user_id=${githubUserId}`);
  } catch (err) {
    console.error('OAuth callback execution failure:', err.message);
    res.redirect(`${FRONTEND_URL}/auth-error?error=token_exchange_failed`);
  }
});

// 3. Get Authenticated User Repositories
// Route is protected by authenticateUser middleware. We read the access token from the JWT.
const { authenticateUser } = require('../middleware/auth');
router.get('/repos', authenticateUser, async (req, res) => {
  try {
    const accessToken = req.user.github_access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'GitHub access token is missing from session' });
    }

    // Fetch user's active repositories (both public and private)
    const reposResponse = await axios.get('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'github-automation-bot-backend',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    // Extract minimal fields for UI consumption
    const repositories = reposResponse.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
    }));

    res.json({ repositories });
  } catch (err) {
    console.error('Failed to fetch repositories from GitHub:', err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to retrieve GitHub repositories',
      details: err.response?.data?.message || err.message,
    });
  }
});

module.exports = router;
