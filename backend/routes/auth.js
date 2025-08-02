import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

const CLIENT_ID = process.env.ZOOM_BOT_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOOM_BOT_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const REDIRECT_URI = process.env.ZOOM_REDIRECT_URI || `https://aizoomai.com/api/auth/zoom/callback`;

if (!CLIENT_ID || !CLIENT_SECRET || !JWT_SECRET) {
  console.error("FATAL ERROR: Missing environment variables in auth.js");
  process.exit(1);
}

router.get("/zoom", (req, res) => {
  const authUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.redirect(authUrl);
});

router.get("/zoom/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ message: "Authorization code is missing." });
  }

  try {
    const tokenResponse = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      },
      headers: {
        "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
    });

    const { access_token, refresh_token } = tokenResponse.data;

    const userProfileResponse = await axios.get("https://api.zoom.us/v2/users/me", {
      headers: { "Authorization": `Bearer ${access_token}` },
    });
    
    const { id: zoomId, email, first_name, last_name } = userProfileResponse.data;

    const user = await User.findOneAndUpdate(
      { zoomId: zoomId },
      {
        zoomId: zoomId,
        email: email,
        firstName: first_name,
        lastName: last_name,
        accessToken: access_token,
        refreshToken: refresh_token,
      },
      { upsert: true, new: true, runValidators: true }
    );

    const appToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    const frontendUrl = process.env.FRONTEND_URL || 'https://aizoomai.com';
    console.log('DEBUG: FRONTEND_URL env var:', process.env.FRONTEND_URL);
    console.log('DEBUG: Final frontendUrl:', frontendUrl);
    const redirectUrl = `${frontendUrl}?token=${appToken}&user=${encodeURIComponent(JSON.stringify({
      id: user._id, 
      email: user.email, 
      firstName: user.firstName 
    }))}`;
    
    res.redirect(redirectUrl);

  } catch (error) {
    console.error("Error during OAuth flow:", error);
    res.status(500).send("Authentication failed due to an internal error.");
  }
});

router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId).select('-accessToken -refreshToken');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        zoomId: user.zoomId
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
});

router.get("/debug-users", async (req, res) => {
  try {
    const users = await User.find({}, 'email firstName zoomId').limit(10);
    res.json({
      success: true,
      users: users,
      totalUsers: users.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
