// Test data seeder for Bookworm app
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bookworm';

// Sample data
const testUsers = [
  { email: 'test1@gmail.com', password: 'test123' },
  { email: 'test2@gmail.com', password: 'test123' }
];

const testReviews = [
  {
    bookKey: '/works/OL45804W',
    text: 'Amazing book! Loved the characters.',
    rating: 5,
    userEmail: 'test1@gmail.com'
  },
  {
    bookKey: '/works/OL45804W',
    text: 'Great story and well written.',
    rating: 4,
    userEmail: 'test2@gmail.com'
  }
];

const testReadingList = [
  {
    userEmail: 'test1@gmail.com',
    bookKey: '/works/OL45804W',
    title: 'The Hobbit',
    coverId: 12345,
    authors: ['J.R.R. Tolkien']
  }
];

// MongoDB Models (copied from server.js)
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

// Seed function
async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected! ✅');

    // Clear existing data
    await User.deleteMany({});
    await Review.deleteMany({});
    await ReadingList.deleteMany({});
    console.log('Cleared existing data');

    // Create users
    for (const userData of testUsers) {
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await User.create({
        email: userData.email,
        passwordHash
      });
    }
    console.log('Created test users');

    // Create reviews
    await Review.insertMany(testReviews);
    console.log('Created test reviews');

    // Create reading list items
    await ReadingList.insertMany(testReadingList);
    console.log('Created test reading list items');

    console.log('\nTest accounts:');
    console.log('- Email: test1@gmail.com / Password: test123');
    console.log('- Email: test2@gmail.com / Password: test123');

    await mongoose.disconnect();
    console.log('\nDone! Database seeded successfully ✨');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Run seeder
seedDatabase();