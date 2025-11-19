const express = require('express');
const router = express.Router();

// Ollama API configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama.railway.internal:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'tinyllama';

// Helper function to call Ollama API
async function callOllama(messages, stream = false) {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: messages,
      stream: stream,
      options: {
        temperature: 0.7,
        top_p: 0.9,
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  if (stream) {
    return response;
  }

  const data = await response.json();
  return data.message.content;
}

// Chat endpoint for resume/job analysis
router.post('/chat', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { message, job_id, resume_id, conversation_id } = req.body;

    let systemPrompt = `You are a helpful career advisor and resume expert. Your role is to:
1. Analyze job postings and compare them to resumes
2. Provide specific, actionable suggestions to improve resumes
3. Assess job fit based on skills, experience, and qualifications
4. Give honest, constructive feedback

Be concise but thorough. Focus on practical improvements.`;

    // Get resume content if provided
    let resumeContent = '';
    if (resume_id) {
      const resumeStmt = db.prepare('SELECT content_text, name FROM resumes WHERE id = ?');
      resumeStmt.bind([resume_id]);
      if (resumeStmt.step()) {
        const resume = resumeStmt.getAsObject();
        resumeContent = resume.content_text || '';
        systemPrompt += `\n\nUser's Resume (${resume.name}):\n${resumeContent}`;
      }
      resumeStmt.free();
    }

    // Get job posting content if provided
    let jobContent = '';
    let jobInfo = '';
    if (job_id) {
      // Get job details
      const jobStmt = db.prepare('SELECT company, job_title, notes FROM jobs WHERE id = ?');
      jobStmt.bind([job_id]);
      if (jobStmt.step()) {
        const job = jobStmt.getAsObject();
        jobInfo = `Company: ${job.company}, Position: ${job.job_title}`;
        if (job.notes) {
          jobInfo += `\nJob Notes: ${job.notes}`;
        }
      }
      jobStmt.free();

      // Get job posting PDF content
      const postingStmt = db.prepare('SELECT content_text FROM job_postings WHERE job_id = ?');
      postingStmt.bind([job_id]);
      if (postingStmt.step()) {
        const posting = postingStmt.getAsObject();
        jobContent = posting.content_text || '';
      }
      postingStmt.free();

      if (jobInfo || jobContent) {
        systemPrompt += `\n\nJob Information:\n${jobInfo}`;
        if (jobContent) {
          systemPrompt += `\n\nJob Posting Content:\n${jobContent}`;
        }
      }
    }

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    // Load conversation history if continuing
    if (conversation_id) {
      const convStmt = db.prepare('SELECT messages FROM ai_conversations WHERE id = ?');
      convStmt.bind([conversation_id]);
      if (convStmt.step()) {
        const conv = convStmt.getAsObject();
        const history = JSON.parse(conv.messages || '[]');
        // Insert history after system message
        messages.splice(1, 0, ...history);
      }
      convStmt.free();
    }

    // Call Ollama
    const response = await callOllama(messages);

    // Save conversation
    let savedConversationId = conversation_id;
    const conversationMessages = messages.slice(1); // Exclude system prompt
    conversationMessages.push({ role: 'assistant', content: response });

    if (conversation_id) {
      db.run(`
        UPDATE ai_conversations
        SET messages = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [JSON.stringify(conversationMessages), conversation_id]);
    } else {
      db.run(`
        INSERT INTO ai_conversations (job_id, resume_id, messages)
        VALUES (?, ?, ?)
      `, [job_id || null, resume_id || null, JSON.stringify(conversationMessages)]);
      savedConversationId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    }

    res.json({
      response: response,
      conversation_id: savedConversationId
    });

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      error: 'Failed to get AI response',
      details: error.message
    });
  }
});

// Analyze job fit
router.post('/analyze-fit', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { job_id, resume_id } = req.body;

    if (!job_id || !resume_id) {
      return res.status(400).json({ error: 'Both job_id and resume_id are required' });
    }

    // Get resume content
    const resumeStmt = db.prepare('SELECT content_text, name FROM resumes WHERE id = ?');
    resumeStmt.bind([resume_id]);
    let resumeContent = '';
    let resumeName = '';
    if (resumeStmt.step()) {
      const resume = resumeStmt.getAsObject();
      resumeContent = resume.content_text || '';
      resumeName = resume.name;
    }
    resumeStmt.free();

    // Get job info and posting
    const jobStmt = db.prepare('SELECT company, job_title, notes FROM jobs WHERE id = ?');
    jobStmt.bind([job_id]);
    let jobInfo = {};
    if (jobStmt.step()) {
      jobInfo = jobStmt.getAsObject();
    }
    jobStmt.free();

    const postingStmt = db.prepare('SELECT content_text FROM job_postings WHERE job_id = ?');
    postingStmt.bind([job_id]);
    let jobContent = '';
    if (postingStmt.step()) {
      jobContent = postingStmt.getAsObject().content_text || '';
    }
    postingStmt.free();

    const analysisPrompt = `Analyze the fit between this resume and job posting. Provide:

1. **Fit Score**: Rate 1-10 how well the candidate matches
2. **Matching Qualifications**: List key matches
3. **Gaps**: Identify missing skills or experience
4. **Resume Suggestions**: Specific changes to better match this job
5. **Overall Assessment**: Is this a good fit? Should they apply?

Resume (${resumeName}):
${resumeContent}

Job: ${jobInfo.company} - ${jobInfo.job_title}
${jobInfo.notes ? `Notes: ${jobInfo.notes}` : ''}

Job Posting:
${jobContent}`;

    const messages = [
      {
        role: 'system',
        content: 'You are an expert career advisor and resume analyst. Provide detailed, actionable analysis.'
      },
      {
        role: 'user',
        content: analysisPrompt
      }
    ];

    const response = await callOllama(messages);

    // Save as conversation
    db.run(`
      INSERT INTO ai_conversations (job_id, resume_id, messages)
      VALUES (?, ?, ?)
    `, [job_id, resume_id, JSON.stringify([
      { role: 'user', content: 'Analyze job fit' },
      { role: 'assistant', content: response }
    ])]);

    const conversationId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    res.json({
      analysis: response,
      conversation_id: conversationId
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze fit',
      details: error.message
    });
  }
});

// Get resume suggestions
router.post('/resume-suggestions', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { resume_id, target_role } = req.body;

    if (!resume_id) {
      return res.status(400).json({ error: 'resume_id is required' });
    }

    // Get resume content
    const resumeStmt = db.prepare('SELECT content_text, name FROM resumes WHERE id = ?');
    resumeStmt.bind([resume_id]);
    let resumeContent = '';
    let resumeName = '';
    if (resumeStmt.step()) {
      const resume = resumeStmt.getAsObject();
      resumeContent = resume.content_text || '';
      resumeName = resume.name;
    }
    resumeStmt.free();

    const suggestionPrompt = `Review this resume and provide improvement suggestions${target_role ? ` for targeting ${target_role} positions` : ''}.

Focus on:
1. **Content Improvements**: Better ways to describe experience
2. **Missing Sections**: What should be added
3. **Keywords**: Important terms to include
4. **Formatting Suggestions**: Structure improvements
5. **Action Items**: Prioritized list of changes

Resume (${resumeName}):
${resumeContent}`;

    const messages = [
      {
        role: 'system',
        content: 'You are an expert resume writer and career coach. Provide specific, actionable suggestions.'
      },
      {
        role: 'user',
        content: suggestionPrompt
      }
    ];

    const response = await callOllama(messages);

    res.json({
      suggestions: response
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      error: 'Failed to get suggestions',
      details: error.message
    });
  }
});

// Get conversation history
router.get('/conversations', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { job_id, resume_id } = req.query;

    let query = `
      SELECT c.*, j.company, j.job_title, r.name as resume_name
      FROM ai_conversations c
      LEFT JOIN jobs j ON c.job_id = j.id
      LEFT JOIN resumes r ON c.resume_id = r.id
    `;
    const params = [];

    if (job_id) {
      query += ' WHERE c.job_id = ?';
      params.push(job_id);
    } else if (resume_id) {
      query += ' WHERE c.resume_id = ?';
      params.push(resume_id);
    }

    query += ' ORDER BY c.updated_at DESC';

    const stmt = db.prepare(query);
    if (params.length > 0) {
      stmt.bind(params);
    }

    const conversations = [];
    while (stmt.step()) {
      conversations.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Delete conversation
router.delete('/conversations/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    db.run('DELETE FROM ai_conversations WHERE id = ?', [id]);

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Check Ollama connection
router.get('/status', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      res.json({
        status: 'connected',
        host: OLLAMA_HOST,
        model: OLLAMA_MODEL,
        available_models: data.models || []
      });
    } else {
      res.json({
        status: 'error',
        host: OLLAMA_HOST,
        error: 'Unable to connect to Ollama'
      });
    }
  } catch (error) {
    res.json({
      status: 'disconnected',
      host: OLLAMA_HOST,
      error: error.message
    });
  }
});

module.exports = router;
