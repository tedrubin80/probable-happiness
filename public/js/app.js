// State
let jobs = [];
let resumes = [];
let currentConversationId = null;

// API Base URL
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadDashboard();
  loadJobs();
  loadResumes();
  checkAIStatus();

  // Set default date for new applications
  document.getElementById('job-date-applied').valueAsDate = new Date();

  // Chat input enter key
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
});

// Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.dataset.view;
      showView(viewId);

      navItems.forEach(ni => ni.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`${viewId}-view`).classList.add('active');

  // Refresh data when switching views
  if (viewId === 'dashboard') loadDashboard();
  if (viewId === 'jobs') loadJobs();
  if (viewId === 'resumes') loadResumes();
  if (viewId === 'ai-assistant') {
    populateAISelects();
    checkAIStatus();
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const [stats, jobsResponse] = await Promise.all([
      fetch(`${API_BASE}/jobs/stats/summary`).then(r => r.json()),
      fetch(`${API_BASE}/jobs`).then(r => r.json())
    ]);

    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-week').textContent = stats.thisWeek || 0;
    document.getElementById('stat-interviews').textContent = stats.upcomingInterviews || 0;

    const active = (stats.byStatus?.applied || 0) + (stats.byStatus?.interviewing || 0);
    document.getElementById('stat-active').textContent = active;

    // Show recent jobs
    const recentJobs = jobsResponse.slice(0, 5);
    const recentList = document.getElementById('recent-jobs-list');
    recentList.innerHTML = recentJobs.length ? recentJobs.map(job => createJobCard(job)).join('') : '<p class="loading">No applications yet</p>';
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

// Jobs
async function loadJobs() {
  try {
    const response = await fetch(`${API_BASE}/jobs`);
    jobs = await response.json();
    renderJobs();
  } catch (error) {
    console.error('Error loading jobs:', error);
    document.getElementById('jobs-list').innerHTML = '<p class="loading">Error loading jobs</p>';
  }
}

function renderJobs() {
  const filtered = filterJobsData();
  const container = document.getElementById('jobs-list');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="loading">No jobs found</p>';
    return;
  }

  container.innerHTML = filtered.map(job => createJobCard(job)).join('');
}

function filterJobsData() {
  const status = document.getElementById('status-filter').value;
  const search = document.getElementById('search-filter').value.toLowerCase();

  return jobs.filter(job => {
    if (status && job.status !== status) return false;
    if (search) {
      const searchText = `${job.company} ${job.job_title} ${job.location || ''}`.toLowerCase();
      if (!searchText.includes(search)) return false;
    }
    return true;
  });
}

function filterJobs() {
  renderJobs();
}

function createJobCard(job) {
  return `
    <div class="job-card" onclick="viewJob(${job.id})">
      <div class="job-card-header">
        <div>
          <div class="job-card-title">${escapeHtml(job.job_title)}</div>
          <div class="job-card-company">${escapeHtml(job.company)}</div>
        </div>
        <span class="status-badge status-${job.status}">${job.status}</span>
      </div>
      <div class="job-card-meta">
        <span>Applied: ${formatDate(job.date_applied)}</span>
        ${job.location ? `<span>${escapeHtml(job.location)}</span>` : ''}
        ${job.interview_date ? `<span>Interview: ${formatDateTime(job.interview_date)}</span>` : ''}
      </div>
      <div class="job-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-secondary btn-small" onclick="editJob(${job.id})">Edit</button>
        <button class="btn btn-danger btn-small" onclick="deleteJob(${job.id})">Delete</button>
      </div>
    </div>
  `;
}

function showJobModal(jobId = null) {
  document.getElementById('job-modal').classList.add('active');
  document.getElementById('job-modal-title').textContent = jobId ? 'Edit Job Application' : 'Add Job Application';
  document.getElementById('job-form').reset();
  document.getElementById('job-id').value = '';
  document.getElementById('job-links-container').innerHTML = '';
  document.getElementById('job-date-applied').valueAsDate = new Date();
}

function closeJobModal() {
  document.getElementById('job-modal').classList.remove('active');
}

async function editJob(id) {
  try {
    const response = await fetch(`${API_BASE}/jobs/${id}`);
    const job = await response.json();

    document.getElementById('job-id').value = job.id;
    document.getElementById('job-company').value = job.company || '';
    document.getElementById('job-title').value = job.job_title || '';
    document.getElementById('job-url').value = job.job_url || '';
    document.getElementById('job-date-applied').value = job.date_applied || '';
    document.getElementById('job-status').value = job.status || 'applied';
    document.getElementById('job-interview-date').value = job.interview_date || '';
    document.getElementById('job-interview-type').value = job.interview_type || '';
    document.getElementById('job-last-communication').value = job.last_communication || '';
    document.getElementById('job-salary').value = job.salary_range || '';
    document.getElementById('job-location').value = job.location || '';
    document.getElementById('job-remote').value = job.remote_type || '';
    document.getElementById('job-contact-name').value = job.contact_name || '';
    document.getElementById('job-contact-email').value = job.contact_email || '';
    document.getElementById('job-contact-phone').value = job.contact_phone || '';
    document.getElementById('job-notes').value = job.notes || '';

    // Load links
    const linksContainer = document.getElementById('job-links-container');
    linksContainer.innerHTML = '';
    if (job.links && job.links.length > 0) {
      job.links.forEach(link => addLinkField(link));
    }

    document.getElementById('job-modal').classList.add('active');
    document.getElementById('job-modal-title').textContent = 'Edit Job Application';
  } catch (error) {
    console.error('Error loading job:', error);
    alert('Failed to load job details');
  }
}

async function saveJob(event) {
  event.preventDefault();

  const jobId = document.getElementById('job-id').value;
  const isNew = !jobId;

  // Gather links
  const linkRows = document.querySelectorAll('.link-row');
  const links = [];
  linkRows.forEach(row => {
    const title = row.querySelector('.link-title').value;
    const url = row.querySelector('.link-url').value;
    const type = row.querySelector('.link-type-select').value;
    if (title && url) {
      links.push({ title, url, link_type: type });
    }
  });

  const jobData = {
    company: document.getElementById('job-company').value,
    job_title: document.getElementById('job-title').value,
    job_url: document.getElementById('job-url').value,
    date_applied: document.getElementById('job-date-applied').value,
    status: document.getElementById('job-status').value,
    interview_date: document.getElementById('job-interview-date').value || null,
    interview_type: document.getElementById('job-interview-type').value,
    last_communication: document.getElementById('job-last-communication').value || null,
    salary_range: document.getElementById('job-salary').value,
    location: document.getElementById('job-location').value,
    remote_type: document.getElementById('job-remote').value,
    contact_name: document.getElementById('job-contact-name').value,
    contact_email: document.getElementById('job-contact-email').value,
    contact_phone: document.getElementById('job-contact-phone').value,
    notes: document.getElementById('job-notes').value,
    links: links
  };

  try {
    const url = isNew ? `${API_BASE}/jobs` : `${API_BASE}/jobs/${jobId}`;
    const method = isNew ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData)
    });

    const result = await response.json();
    const savedJobId = isNew ? result.id : jobId;

    // Upload job posting if provided
    const postingFile = document.getElementById('job-posting-file').files[0];
    if (postingFile) {
      const formData = new FormData();
      formData.append('posting', postingFile);

      await fetch(`${API_BASE}/jobs/${savedJobId}/posting`, {
        method: 'POST',
        body: formData
      });
    }

    closeJobModal();
    loadJobs();
    loadDashboard();
  } catch (error) {
    console.error('Error saving job:', error);
    alert('Failed to save job');
  }
}

async function deleteJob(id) {
  if (!confirm('Are you sure you want to delete this application?')) return;

  try {
    await fetch(`${API_BASE}/jobs/${id}`, { method: 'DELETE' });
    loadJobs();
    loadDashboard();
  } catch (error) {
    console.error('Error deleting job:', error);
    alert('Failed to delete job');
  }
}

async function viewJob(id) {
  try {
    const response = await fetch(`${API_BASE}/jobs/${id}`);
    const job = await response.json();

    document.getElementById('job-detail-title').textContent = `${job.job_title} at ${job.company}`;

    let content = `
      <div class="detail-section">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Status</label>
            <span class="status-badge status-${job.status}">${job.status}</span>
          </div>
          <div class="detail-item">
            <label>Date Applied</label>
            <span>${formatDate(job.date_applied)}</span>
          </div>
          ${job.interview_date ? `
          <div class="detail-item">
            <label>Interview</label>
            <span>${formatDateTime(job.interview_date)}${job.interview_type ? ` (${job.interview_type})` : ''}</span>
          </div>
          ` : ''}
          ${job.last_communication ? `
          <div class="detail-item">
            <label>Last Communication</label>
            <span>${formatDate(job.last_communication)}</span>
          </div>
          ` : ''}
          ${job.salary_range ? `
          <div class="detail-item">
            <label>Salary Range</label>
            <span>${escapeHtml(job.salary_range)}</span>
          </div>
          ` : ''}
          ${job.location ? `
          <div class="detail-item">
            <label>Location</label>
            <span>${escapeHtml(job.location)}${job.remote_type ? ` (${job.remote_type})` : ''}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;

    // Contact info
    if (job.contact_name || job.contact_email || job.contact_phone) {
      content += `
        <div class="detail-section">
          <h4>Contact</h4>
          <div class="detail-grid">
            ${job.contact_name ? `<div class="detail-item"><label>Name</label><span>${escapeHtml(job.contact_name)}</span></div>` : ''}
            ${job.contact_email ? `<div class="detail-item"><label>Email</label><span><a href="mailto:${job.contact_email}">${escapeHtml(job.contact_email)}</a></span></div>` : ''}
            ${job.contact_phone ? `<div class="detail-item"><label>Phone</label><span>${escapeHtml(job.contact_phone)}</span></div>` : ''}
          </div>
        </div>
      `;
    }

    // Links
    if (job.links && job.links.length > 0) {
      content += `
        <div class="detail-section">
          <h4>Links</h4>
          <div class="links-list">
            ${job.links.map(link => `
              <div class="link-item">
                <a href="${escapeHtml(link.url)}" target="_blank">${escapeHtml(link.title)}</a>
                ${link.link_type ? `<span class="link-type">${link.link_type}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Job URL
    if (job.job_url) {
      content += `
        <div class="detail-section">
          <h4>Job Posting URL</h4>
          <a href="${escapeHtml(job.job_url)}" target="_blank">${escapeHtml(job.job_url)}</a>
        </div>
      `;
    }

    // Posting PDF
    if (job.posting) {
      content += `
        <div class="detail-section">
          <h4>Job Posting Document</h4>
          <button class="btn btn-secondary btn-small" onclick="window.open('${API_BASE}/jobs/${id}/posting/download')">
            Download ${escapeHtml(job.posting.file_name)}
          </button>
        </div>
      `;
    }

    // Notes
    if (job.notes) {
      content += `
        <div class="detail-section">
          <h4>Notes</h4>
          <div class="notes-content">${escapeHtml(job.notes)}</div>
        </div>
      `;
    }

    content += `
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeJobDetailModal()">Close</button>
        <button class="btn btn-primary" onclick="closeJobDetailModal(); editJob(${job.id})">Edit</button>
      </div>
    `;

    document.getElementById('job-detail-content').innerHTML = content;
    document.getElementById('job-detail-modal').classList.add('active');
  } catch (error) {
    console.error('Error viewing job:', error);
    alert('Failed to load job details');
  }
}

function closeJobDetailModal() {
  document.getElementById('job-detail-modal').classList.remove('active');
}

function addLinkField(link = null) {
  const container = document.getElementById('job-links-container');
  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `
    <input type="text" class="link-title" placeholder="Title" value="${link ? escapeHtml(link.title) : ''}">
    <input type="url" class="link-url" placeholder="URL" value="${link ? escapeHtml(link.url) : ''}">
    <select class="link-type-select">
      <option value="">Type</option>
      <option value="linkedin" ${link?.link_type === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
      <option value="company" ${link?.link_type === 'company' ? 'selected' : ''}>Company</option>
      <option value="glassdoor" ${link?.link_type === 'glassdoor' ? 'selected' : ''}>Glassdoor</option>
      <option value="other" ${link?.link_type === 'other' ? 'selected' : ''}>Other</option>
    </select>
    <button type="button" class="remove-link-btn" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(row);
}

// Resumes
async function loadResumes() {
  try {
    const response = await fetch(`${API_BASE}/resumes`);
    resumes = await response.json();
    renderResumes();
  } catch (error) {
    console.error('Error loading resumes:', error);
    document.getElementById('resumes-list').innerHTML = '<p class="loading">Error loading resumes</p>';
  }
}

function renderResumes() {
  const container = document.getElementById('resumes-list');

  if (resumes.length === 0) {
    container.innerHTML = '<p class="loading">No resumes uploaded yet</p>';
    return;
  }

  container.innerHTML = resumes.map(resume => `
    <div class="resume-card">
      <div class="resume-card-header">
        <div>
          <div class="resume-card-title">${escapeHtml(resume.name)}</div>
          <div class="resume-card-file">${escapeHtml(resume.file_name)}</div>
        </div>
        ${resume.is_default ? '<span class="default-badge">DEFAULT</span>' : ''}
      </div>
      <div class="resume-card-actions">
        <button class="btn btn-secondary btn-small" onclick="downloadResume(${resume.id})">Download</button>
        ${!resume.is_default ? `<button class="btn btn-secondary btn-small" onclick="setDefaultResume(${resume.id})">Set Default</button>` : ''}
        <button class="btn btn-danger btn-small" onclick="deleteResume(${resume.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function showResumeModal() {
  document.getElementById('resume-modal').classList.add('active');
  document.getElementById('resume-form').reset();
}

function closeResumeModal() {
  document.getElementById('resume-modal').classList.remove('active');
}

async function saveResume(event) {
  event.preventDefault();

  const formData = new FormData();
  formData.append('name', document.getElementById('resume-name').value);
  formData.append('resume', document.getElementById('resume-file').files[0]);
  formData.append('is_default', document.getElementById('resume-default').checked);

  try {
    const response = await fetch(`${API_BASE}/resumes`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');

    closeResumeModal();
    loadResumes();
  } catch (error) {
    console.error('Error uploading resume:', error);
    alert('Failed to upload resume');
  }
}

function downloadResume(id) {
  window.open(`${API_BASE}/resumes/${id}/download`);
}

async function setDefaultResume(id) {
  try {
    await fetch(`${API_BASE}/resumes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: resumes.find(r => r.id === id).name,
        is_default: true
      })
    });
    loadResumes();
  } catch (error) {
    console.error('Error setting default:', error);
    alert('Failed to set default resume');
  }
}

async function deleteResume(id) {
  if (!confirm('Are you sure you want to delete this resume?')) return;

  try {
    await fetch(`${API_BASE}/resumes/${id}`, { method: 'DELETE' });
    loadResumes();
  } catch (error) {
    console.error('Error deleting resume:', error);
    alert('Failed to delete resume');
  }
}

// AI Assistant
async function checkAIStatus() {
  const statusEl = document.getElementById('ai-status');
  try {
    const response = await fetch(`${API_BASE}/ai/status`);
    const data = await response.json();

    if (data.status === 'connected') {
      statusEl.textContent = `Connected (${data.model})`;
      statusEl.className = 'ai-status connected';
    } else {
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'ai-status error';
    }
  } catch (error) {
    statusEl.textContent = 'Error checking status';
    statusEl.className = 'ai-status error';
  }
}

function populateAISelects() {
  const resumeSelect = document.getElementById('ai-resume-select');
  const jobSelect = document.getElementById('ai-job-select');

  // Populate resumes
  resumeSelect.innerHTML = '<option value="">Select a resume...</option>';
  resumes.forEach(resume => {
    resumeSelect.innerHTML += `<option value="${resume.id}">${escapeHtml(resume.name)}${resume.is_default ? ' (default)' : ''}</option>`;
  });

  // Populate jobs
  jobSelect.innerHTML = '<option value="">Select a job...</option>';
  jobs.forEach(job => {
    jobSelect.innerHTML += `<option value="${job.id}">${escapeHtml(job.company)} - ${escapeHtml(job.job_title)}</option>`;
  });
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const resumeId = document.getElementById('ai-resume-select').value;
  const jobId = document.getElementById('ai-job-select').value;

  // Add user message to chat
  addChatMessage(message, 'user');
  input.value = '';

  // Show loading
  const loadingId = addChatMessage('Thinking...', 'assistant');

  try {
    const response = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        resume_id: resumeId || null,
        job_id: jobId || null,
        conversation_id: currentConversationId
      })
    });

    const data = await response.json();

    // Remove loading message
    document.getElementById(loadingId).remove();

    if (data.error) {
      addChatMessage(`Error: ${data.error}`, 'assistant');
    } else {
      addChatMessage(data.response, 'assistant');
      currentConversationId = data.conversation_id;
    }
  } catch (error) {
    document.getElementById(loadingId).remove();
    addChatMessage('Failed to get AI response. Please check the connection.', 'assistant');
  }
}

async function analyzeFit() {
  const resumeId = document.getElementById('ai-resume-select').value;
  const jobId = document.getElementById('ai-job-select').value;

  if (!resumeId || !jobId) {
    alert('Please select both a resume and a job application');
    return;
  }

  addChatMessage('Analyzing job fit...', 'user');
  const loadingId = addChatMessage('Analyzing your resume against the job posting...', 'assistant');

  try {
    const response = await fetch(`${API_BASE}/ai/analyze-fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_id: resumeId, job_id: jobId })
    });

    const data = await response.json();
    document.getElementById(loadingId).remove();

    if (data.error) {
      addChatMessage(`Error: ${data.error}`, 'assistant');
    } else {
      addChatMessage(data.analysis, 'assistant');
      currentConversationId = data.conversation_id;
    }
  } catch (error) {
    document.getElementById(loadingId).remove();
    addChatMessage('Failed to analyze fit. Please check the connection.', 'assistant');
  }
}

async function getResumeSuggestions() {
  const resumeId = document.getElementById('ai-resume-select').value;

  if (!resumeId) {
    alert('Please select a resume');
    return;
  }

  addChatMessage('Get resume suggestions', 'user');
  const loadingId = addChatMessage('Analyzing your resume for improvements...', 'assistant');

  try {
    const response = await fetch(`${API_BASE}/ai/resume-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_id: resumeId })
    });

    const data = await response.json();
    document.getElementById(loadingId).remove();

    if (data.error) {
      addChatMessage(`Error: ${data.error}`, 'assistant');
    } else {
      addChatMessage(data.suggestions, 'assistant');
    }
  } catch (error) {
    document.getElementById(loadingId).remove();
    addChatMessage('Failed to get suggestions. Please check the connection.', 'assistant');
  }
}

function addChatMessage(content, role) {
  const container = document.getElementById('chat-messages');
  const id = 'msg-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = `chat-message ${role}`;
  div.innerHTML = `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}
