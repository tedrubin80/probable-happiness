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

// Get all jobs
router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const stmt = db.prepare(`
      SELECT * FROM jobs
      ORDER BY
        CASE status
          WHEN 'interviewing' THEN 1
          WHEN 'applied' THEN 2
          WHEN 'offer' THEN 3
          WHEN 'rejected' THEN 4
          WHEN 'withdrawn' THEN 5
          ELSE 6
        END,
        date_applied DESC
    `);

    const jobs = [];
    while (stmt.step()) {
      jobs.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job with links and posting
router.get('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Get job
    const jobStmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    jobStmt.bind([id]);
    let job = null;
    if (jobStmt.step()) {
      job = jobStmt.getAsObject();
    }
    jobStmt.free();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get links
    const linksStmt = db.prepare('SELECT * FROM job_links WHERE job_id = ?');
    linksStmt.bind([id]);
    const links = [];
    while (linksStmt.step()) {
      links.push(linksStmt.getAsObject());
    }
    linksStmt.free();

    // Get posting
    const postingStmt = db.prepare('SELECT id, job_id, file_name, content_text, created_at FROM job_postings WHERE job_id = ?');
    postingStmt.bind([id]);
    let posting = null;
    if (postingStmt.step()) {
      posting = postingStmt.getAsObject();
    }
    postingStmt.free();

    res.json({ ...job, links, posting });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Create new job
router.post('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      company, job_title, job_url, date_applied, interview_date, interview_type,
      last_communication, status, salary_range, location, remote_type,
      contact_name, contact_email, contact_phone, notes, links
    } = req.body;

    db.run(`
      INSERT INTO jobs (
        company, job_title, job_url, date_applied, interview_date, interview_type,
        last_communication, status, salary_range, location, remote_type,
        contact_name, contact_email, contact_phone, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company, job_title, job_url, date_applied, interview_date, interview_type,
      last_communication, status || 'applied', salary_range, location, remote_type,
      contact_name, contact_email, contact_phone, notes
    ]);

    const jobId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    // Add links if provided
    if (links && links.length > 0) {
      for (const link of links) {
        db.run(`
          INSERT INTO job_links (job_id, title, url, link_type)
          VALUES (?, ?, ?, ?)
        `, [jobId, link.title, link.url, link.link_type]);
      }
    }

    res.status(201).json({ id: jobId, message: 'Job created successfully' });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Update job
router.put('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      company, job_title, job_url, date_applied, interview_date, interview_type,
      last_communication, status, salary_range, location, remote_type,
      contact_name, contact_email, contact_phone, notes, links
    } = req.body;

    db.run(`
      UPDATE jobs SET
        company = ?, job_title = ?, job_url = ?, date_applied = ?,
        interview_date = ?, interview_type = ?, last_communication = ?,
        status = ?, salary_range = ?, location = ?, remote_type = ?,
        contact_name = ?, contact_email = ?, contact_phone = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      company, job_title, job_url, date_applied, interview_date, interview_type,
      last_communication, status, salary_range, location, remote_type,
      contact_name, contact_email, contact_phone, notes, id
    ]);

    // Update links - delete existing and insert new
    if (links !== undefined) {
      db.run('DELETE FROM job_links WHERE job_id = ?', [id]);
      if (links && links.length > 0) {
        for (const link of links) {
          db.run(`
            INSERT INTO job_links (job_id, title, url, link_type)
            VALUES (?, ?, ?, ?)
          `, [id, link.title, link.url, link.link_type]);
        }
      }
    }

    res.json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    db.run('DELETE FROM job_links WHERE job_id = ?', [id]);
    db.run('DELETE FROM job_postings WHERE job_id = ?', [id]);
    db.run('DELETE FROM jobs WHERE id = ?', [id]);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Upload job posting PDF
router.post('/:id/posting', upload.single('posting'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

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

    // Delete existing posting for this job
    db.run('DELETE FROM job_postings WHERE job_id = ?', [id]);

    // Insert new posting
    db.run(`
      INSERT INTO job_postings (job_id, file_name, file_data, content_text)
      VALUES (?, ?, ?, ?)
    `, [id, req.file.originalname, req.file.buffer, contentText]);

    res.json({ message: 'Job posting uploaded successfully' });
  } catch (error) {
    console.error('Error uploading posting:', error);
    res.status(500).json({ error: 'Failed to upload posting' });
  }
});

// Get job posting PDF
router.get('/:id/posting/download', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const stmt = db.prepare('SELECT file_name, file_data FROM job_postings WHERE job_id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
      const posting = stmt.getAsObject();
      stmt.free();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${posting.file_name}"`);
      res.send(Buffer.from(posting.file_data));
    } else {
      stmt.free();
      res.status(404).json({ error: 'Posting not found' });
    }
  } catch (error) {
    console.error('Error downloading posting:', error);
    res.status(500).json({ error: 'Failed to download posting' });
  }
});

// Add link to job
router.post('/:id/links', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { title, url, link_type } = req.body;

    db.run(`
      INSERT INTO job_links (job_id, title, url, link_type)
      VALUES (?, ?, ?, ?)
    `, [id, title, url, link_type]);

    const linkId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    res.status(201).json({ id: linkId, message: 'Link added successfully' });
  } catch (error) {
    console.error('Error adding link:', error);
    res.status(500).json({ error: 'Failed to add link' });
  }
});

// Delete link
router.delete('/:jobId/links/:linkId', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { linkId } = req.params;

    db.run('DELETE FROM job_links WHERE id = ?', [linkId]);

    res.json({ message: 'Link deleted successfully' });
  } catch (error) {
    console.error('Error deleting link:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Get job statistics
router.get('/stats/summary', (req, res) => {
  try {
    const db = req.app.locals.db;

    const stats = {};

    // Total applications
    const totalResult = db.exec('SELECT COUNT(*) FROM jobs');
    stats.total = totalResult[0]?.values[0][0] || 0;

    // By status
    const statusResult = db.exec(`
      SELECT status, COUNT(*) as count
      FROM jobs
      GROUP BY status
    `);
    stats.byStatus = {};
    if (statusResult[0]) {
      statusResult[0].values.forEach(row => {
        stats.byStatus[row[0]] = row[1];
      });
    }

    // This week applications
    const weekResult = db.exec(`
      SELECT COUNT(*) FROM jobs
      WHERE date_applied >= date('now', '-7 days')
    `);
    stats.thisWeek = weekResult[0]?.values[0][0] || 0;

    // Upcoming interviews
    const interviewsResult = db.exec(`
      SELECT COUNT(*) FROM jobs
      WHERE interview_date >= date('now')
    `);
    stats.upcomingInterviews = interviewsResult[0]?.values[0][0] || 0;

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
