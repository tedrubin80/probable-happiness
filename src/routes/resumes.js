const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');

// Configure multer for PDF uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Get all resumes
router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const stmt = db.prepare(`
      SELECT id, name, file_name, is_default, created_at, updated_at
      FROM resumes
      ORDER BY is_default DESC, updated_at DESC
    `);

    const resumes = [];
    while (stmt.step()) {
      resumes.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(resumes);
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
});

// Get single resume
router.get('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const stmt = db.prepare(`
      SELECT id, name, file_name, content_text, is_default, created_at, updated_at
      FROM resumes
      WHERE id = ?
    `);
    stmt.bind([id]);

    if (stmt.step()) {
      const resume = stmt.getAsObject();
      stmt.free();
      res.json(resume);
    } else {
      stmt.free();
      res.status(404).json({ error: 'Resume not found' });
    }
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// Upload new resume
router.post('/', upload.single('resume'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, is_default } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse PDF to extract text
    let contentText = '';
    try {
      const pdfData = await pdfParse(req.file.buffer);
      contentText = pdfData.text;
    } catch (parseError) {
      console.error('Error parsing PDF:', parseError);
    }

    // If setting as default, unset other defaults
    if (is_default === 'true' || is_default === true) {
      db.run('UPDATE resumes SET is_default = 0');
    }

    // Insert resume
    db.run(`
      INSERT INTO resumes (name, file_name, file_data, content_text, is_default)
      VALUES (?, ?, ?, ?, ?)
    `, [
      name || req.file.originalname,
      req.file.originalname,
      req.file.buffer,
      contentText,
      is_default === 'true' || is_default === true ? 1 : 0
    ]);

    const resumeId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    res.status(201).json({ id: resumeId, message: 'Resume uploaded successfully' });
  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({ error: 'Failed to upload resume' });
  }
});

// Update resume metadata
router.put('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, is_default } = req.body;

    // If setting as default, unset other defaults
    if (is_default === true || is_default === 1) {
      db.run('UPDATE resumes SET is_default = 0');
    }

    db.run(`
      UPDATE resumes SET
        name = ?,
        is_default = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, is_default ? 1 : 0, id]);

    res.json({ message: 'Resume updated successfully' });
  } catch (error) {
    console.error('Error updating resume:', error);
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

// Delete resume
router.delete('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    db.run('DELETE FROM resumes WHERE id = ?', [id]);

    res.json({ message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

// Download resume PDF
router.get('/:id/download', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const stmt = db.prepare('SELECT file_name, file_data FROM resumes WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const resume = stmt.getAsObject();
      stmt.free();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resume.file_name}"`);
      res.send(Buffer.from(resume.file_data));
    } else {
      stmt.free();
      res.status(404).json({ error: 'Resume not found' });
    }
  } catch (error) {
    console.error('Error downloading resume:', error);
    res.status(500).json({ error: 'Failed to download resume' });
  }
});

// Get default resume
router.get('/default/current', (req, res) => {
  try {
    const db = req.app.locals.db;

    const stmt = db.prepare(`
      SELECT id, name, file_name, content_text, is_default, created_at
      FROM resumes
      WHERE is_default = 1
    `);

    if (stmt.step()) {
      const resume = stmt.getAsObject();
      stmt.free();
      res.json(resume);
    } else {
      stmt.free();
      res.status(404).json({ error: 'No default resume set' });
    }
  } catch (error) {
    console.error('Error fetching default resume:', error);
    res.status(500).json({ error: 'Failed to fetch default resume' });
  }
});

module.exports = router;
