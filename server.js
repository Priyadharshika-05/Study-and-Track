require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Schemas ──────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const nodeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, required: true },
  content: { type: String, default: '' },
  numbering: { type: String, default: '' },
  level: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const testSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testName: { type: String, required: true },
  date: { type: Date, required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, default: null },
  unitName: { type: String, default: '' },
  freeSubject: { type: String, default: '' },
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const scheduleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  topics: [{
    nodeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    numbering: { type: String, default: '' },
    title: { type: String, default: '' }
  }],
  note: { type: String, default: '' },
  done: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Node = mongoose.model('Node', nodeSchema);
const Test = mongoose.model('Test', testSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'study_track_secret_fallback',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
};

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const existing = await User.findOne({ username: username.trim().toLowerCase() });
    if (existing) return res.status(400).json({ error: 'Username already taken' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.trim().toLowerCase(), password: hashed });
    req.session.userId = user._id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.trim().toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid username or password' });
    req.session.userId = user._id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: req.session.username });
});

app.delete('/api/auth/account', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    await Node.deleteMany({ userId });
    await Test.deleteMany({ userId });
    await Schedule.deleteMany({ userId });
    await User.findByIdAndDelete(userId);
    req.session.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Notes/Nodes Routes ───────────────────────────────────────────────────────
app.get('/api/nodes', requireAuth, async (req, res) => {
  try {
    const nodes = await Node.find({ userId: req.session.userId }).sort({ level: 1, order: 1 });
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/nodes', requireAuth, async (req, res) => {
  try {
    const { parentId, title, content, numbering, level, order } = req.body;
    const node = await Node.create({
      userId: req.session.userId,
      parentId: parentId || null,
      title, content, numbering, level, order
    });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/nodes/:id', requireAuth, async (req, res) => {
  try {
    const node = await Node.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!node) return res.status(404).json({ error: 'Not found' });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/nodes/:id', requireAuth, async (req, res) => {
  try {
    const node = await Node.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!node) return res.status(404).json({ error: 'Not found' });
    const deleteRecursive = async (nodeId) => {
      const children = await Node.find({ parentId: nodeId, userId: req.session.userId });
      for (const child of children) await deleteRecursive(child._id);
      await Node.findByIdAndDelete(nodeId);
    };
    await deleteRecursive(node._id);
    await Schedule.updateMany(
      { userId: req.session.userId },
      { $pull: { topics: { nodeId: node._id } } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Schedule Routes ───────────────────────────────────────────────────────────
app.get('/api/schedule', requireAuth, async (req, res) => {
  try {
    const items = await Schedule.find({ userId: req.session.userId }).sort({ date: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/schedule', requireAuth, async (req, res) => {
  try {
    const { date, topics, note } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    const item = await Schedule.create({
      userId: req.session.userId,
      date,
      topics: topics || [],
      note: note || ''
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/schedule/:id', requireAuth, async (req, res) => {
  try {
    const item = await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { ...req.body },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/schedule/:id', requireAuth, async (req, res) => {
  try {
    await Schedule.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Tests Routes ─────────────────────────────────────────────────────────────
app.get('/api/tests', requireAuth, async (req, res) => {
  try {
    const tests = await Test.find({ userId: req.session.userId }).sort({ date: -1 });
    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tests', requireAuth, async (req, res) => {
  try {
    const test = await Test.create({ userId: req.session.userId, ...req.body });
    res.json(test);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/tests/:id', requireAuth, async (req, res) => {
  try {
    await Test.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Serve Frontend ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
