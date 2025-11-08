// Bookworm backend with MongoDB integration
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bookworm';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

// Enable trust proxy for render.com
app.set('trust proxy', 1);

// MongoDB Connection
mongoose.connect(MONGODB_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// MongoDB Models
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ReviewSchema = new mongoose.Schema({
  bookKey: { type: String, required: true },
  userEmail: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5 },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ReadingListSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  bookKey: { type: String, required: true },
  title: String,
  coverId: Number,
  authors: [String],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Review = mongoose.model('Review', ReviewSchema);
const ReadingList = mongoose.model('ReadingList', ReadingListSchema);

// Serve frontend files from current directory (the workspace folder)
app.use(express.static(path.join(__dirname)));

// Serve root explicitly to show the login page when visiting '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Friendly route for the app HTML (filename contains spaces)
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'book recommendation app.html'));
});

// Login/Register combined endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    
    if (!email.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Only Gmail accounts are allowed' });
    }

    // Find or create user
    let user = await User.findOne({ email });
    
    if (!user) {
      // New user - create account
      const passwordHash = await bcrypt.hash(password, 10);
      user = await User.create({ email, passwordHash });
      console.log('Created new user:', email);
    } else {
      // Existing user - verify password
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
    }
    
    // Generate token and respond
    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, email: user.email });
  } catch (err) {
    console.error('Login/Register error:', err);
    res.status(500).json({ error: 'Operation failed' });
  }
});

// Simple auth middleware
function auth(req, res, next){
  const h = req.headers.authorization;
  if(!h) return res.status(401).json({ error: 'No token' });
  const token = (h.split(' ')[1] || '').trim();
  try{ const decoded = jwt.verify(token, JWT_SECRET); req.user = decoded; next(); } catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
}

// Proxy search to OpenLibrary
app.get('/api/books/search', async (req, res) => {
  try{
    const q = req.query.q || 'bestsellers';
    const params = { ...req.query, q };
    const r = await axios.get('https://openlibrary.org/search.json', { params });
    res.json(r.data);
  } catch(err){
    console.error('Search proxy error', err && err.message);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// Reviews API
app.get('/api/reviews/:bookKey', async (req, res) => {
  try {
    const reviews = await Review.find({ bookKey: req.params.bookKey })
      .sort('-createdAt')
      .limit(50);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.post('/api/reviews/:bookKey', auth, async (req, res) => {
  try {
    const { rating, text } = req.body;
    if (!text) return res.status(400).json({ error: 'Review text is required' });
    
    const review = await Review.create({
      bookKey: req.params.bookKey,
      userEmail: req.user.email,
      rating: rating || 0,
      text
    });
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save review' });
  }
});

// Reading List API
app.get('/api/reading', auth, async (req, res) => {
  try {
    const items = await ReadingList.find({ userEmail: req.user.email })
      .sort('-createdAt');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reading list' });
  }
});

app.post('/api/reading', auth, async (req, res) => {
  try {
    const { bookKey, title, coverId, authors } = req.body;
    if (!bookKey) return res.status(400).json({ error: 'Book key is required' });
    
    // Check if already in list
    const existing = await ReadingList.findOne({ 
      userEmail: req.user.email,
      bookKey
    });
    if (existing) {
      return res.status(409).json({ error: 'Already in reading list' });
    }
    
    const item = await ReadingList.create({
      userEmail: req.user.email,
      bookKey,
      title,
      coverId,
      authors
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to reading list' });
  }
});

app.delete('/api/reading/:bookKey', auth, async (req, res) => {
  try {
    await ReadingList.deleteOne({
      userEmail: req.user.email,
      bookKey: req.params.bookKey
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from reading list' });
  }
});

// User profile
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }, { passwordHash: 0 });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.listen(PORT, () => console.log(`✨ Server running on http://localhost:${PORT}`));
