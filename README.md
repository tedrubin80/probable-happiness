# Resume Tracker

A personal resume tracker and interview management system with AI-powered job fit analysis.

## Features

- **Job Application Tracking**: Track all your job applications with detailed information
  - Company, job title, application date
  - Interview scheduling and status updates
  - Contact information
  - Salary ranges and location details
  - Long-form notes and multiple links per application

- **Resume Management**: Upload and manage multiple resume versions
  - PDF upload with text extraction
  - Set default resume for quick access
  - Download resumes anytime

- **AI-Powered Analysis**: Uses Ollama with TinyLlama for intelligent insights
  - Compare your resume against job postings
  - Get personalized resume improvement suggestions
  - Analyze job fit scores and recommendations
  - Interactive chat for career advice

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: SQL.js (SQLite in JavaScript) for portable, self-contained storage
- **AI**: Ollama with TinyLlama model
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Deployment**: Railway with persistent volume storage

## Getting Started

### Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd resume-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 in your browser

### Railway Deployment

1. Create a new project on Railway
2. Connect your GitHub repository
3. Add a volume mount at `/volume` for persistent database storage
4. Set environment variables:
   - `NODE_ENV=production`
   - `OLLAMA_HOST=http://ollama.railway.internal:11434`
   - `OLLAMA_MODEL=tinyllama`

5. Deploy the Ollama service (use the official Ollama Docker image)
6. Pull TinyLlama model in the Ollama container:
   ```bash
   ollama pull tinyllama
   ```

## API Endpoints

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs` - Create new job
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/posting` - Upload job posting PDF
- `GET /api/jobs/:id/posting/download` - Download job posting

### Resumes
- `GET /api/resumes` - List all resumes
- `GET /api/resumes/:id` - Get resume details
- `POST /api/resumes` - Upload new resume
- `PUT /api/resumes/:id` - Update resume metadata
- `DELETE /api/resumes/:id` - Delete resume
- `GET /api/resumes/:id/download` - Download resume PDF

### AI Assistant
- `POST /api/ai/chat` - Send chat message
- `POST /api/ai/analyze-fit` - Analyze job fit
- `POST /api/ai/resume-suggestions` - Get resume suggestions
- `GET /api/ai/status` - Check Ollama connection

## Database Schema

The application uses SQL.js with the following tables:

- **jobs**: Job applications with all tracking fields
- **job_links**: Multiple links per job application
- **resumes**: Uploaded resumes with extracted text
- **job_postings**: Uploaded job posting PDFs
- **ai_conversations**: Chat history for AI interactions

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment | development |
| OLLAMA_HOST | Ollama API URL | http://ollama.railway.internal:11434 |
| OLLAMA_MODEL | AI model to use | tinyllama |

## License

MIT
