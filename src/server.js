require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./services/database');
const jobRoutes = require('./routes/jobs');
const resumeRoutes = require('./routes/resumes');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database
let db;

async function startServer() {
  try {
    db = await initDatabase();

    // Make db available to routes
    app.locals.db = db;

    // API Routes
    app.use('/api/jobs', jobRoutes);
    app.use('/api/resumes', resumeRoutes);
    app.use('/api/ai', aiRoutes);

    // Serve admin interface
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', database: 'connected' });
    });

    app.listen(PORT, () => {
      console.log(`Resume Tracker running on port ${PORT}`);
      console.log(`Admin interface: http://localhost:${PORT}`);
    });

    // Graceful shutdown - save database
    process.on('SIGINT', () => {
      console.log('Saving database...');
      const data = db.export();
      const fs = require('fs');
      fs.writeFileSync('./data/resume_tracker.db', Buffer.from(data));
      console.log('Database saved. Shutting down.');
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
