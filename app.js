/* ─────────────────────────────────────────────────────────────
   AI Implementation Scoping Tool
   Built by Roman Martins · romanmartins.com
   Uses the Anthropic Claude API (claude-sonnet-4-6)
───────────────────────────────────────────────────────────── */

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const TOTAL_QUESTIONS = 3;

/* ─── State ───────────────────────────────────────────────── */
let state = {
  apiKey: null,
  problem: '',
  questions: [],       // array of question strings (pre-generated)
  answers: [],         // array of user answer strings
  currentQ: 0,         // index of next question to show
};

/* ─── DOM refs ────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const apiGate          = $('api-gate');
const apiKeyInput      = $('api-key-input');
const apiKeySubmit     = $('api-key-submit');
const apiKeyError      = $('api-key-error');

const problemSection   = $('problem-section');
const problemInput     = $('problem-input');
const problemSubmit    = $('problem-submit');
const problemError     = $('problem-error');

const conversationSection = $('conversation-section');
const conversationThread  = $('conversation-thread');
const answerSection    = $('answer-section');
const answerLabel      = $('answer-label');
const answerInput      = $('answer-input');
const answerSubmit     = $('answer-submit');
const generateSection  = $('generate-section');
const generateBtn      = $('generate-btn');

const loading          = $('loading');
const loadingText      = $('loading-text');

const outputSection    = $('output-section');
const outputContent    = $('output-content');
const copyBtn          = $('copy-btn');
const restartBtn       = $('restart-btn');

/* ─── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Restore API key from sessionStorage
  const savedKey = sessionStorage.getItem('anthropic_api_key');
  if (savedKey) {
    state.apiKey = savedKey;
    showProblemSection();
  }

  // Bind events
  apiKeySubmit.addEventListener('click', handleApiKeySubmit);
  apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleApiKeySubmit(); });

  problemSubmit.addEventListener('click', handleProblemSubmit);

  answerSubmit.addEventListener('click', handleAnswerSubmit);
  answerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAnswerSubmit();
  });

  generateBtn.addEventListener('click', handleGenerate);
  copyBtn.addEventListener('click', handleCopy);
  restartBtn.addEventListener('click', handleRestart);
});

/* ─── Step 1: API Key ─────────────────────────────────────── */
function handleApiKeySubmit() {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('sk-ant-')) {
    apiKeyError.classList.remove('hidden');
    return;
  }
  apiKeyError.classList.add('hidden');
  state.apiKey = key;
  sessionStorage.setItem('anthropic_api_key', key);
  showProblemSection();
}

function showProblemSection() {
  apiGate.classList.add('hidden');
  problemSection.classList.remove('hidden');
  problemInput.focus();
}

/* ─── Step 2: Problem ─────────────────────────────────────── */
async function handleProblemSubmit() {
  const problem = problemInput.value.trim();
  if (problem.length < 20) {
    problemError.classList.remove('hidden');
    return;
  }
  problemError.classList.add('hidden');
  state.problem = problem;

  problemSection.classList.add('hidden');
  showLoading('Preparing discovery questions...');

  try {
    state.questions = await generateQuestions(problem);
    hideLoading();
    startConversation();
  } catch (err) {
    hideLoading();
    showError(err.message);
  }
}

/* ─── Step 3: Conversation ────────────────────────────────── */
function startConversation() {
  conversationSection.classList.remove('hidden');

  // Show the problem as first bubble
  appendBubble('ai', `**Problem received:**\n\n${state.problem}`);

  // Show first question
  showNextQuestion();
}

function showNextQuestion() {
  const q = state.questions[state.currentQ];
  const qNum = state.currentQ + 1;

  appendBubble('ai', `**Question ${qNum} of ${TOTAL_QUESTIONS}**\n\n${q}`);

  answerLabel.textContent = `Your answer to question ${qNum}`;
  answerInput.value = '';
  answerSection.classList.remove('hidden');
  answerInput.focus();
}

function handleAnswerSubmit() {
  const answer = answerInput.value.trim();
  if (!answer) return;

  // Record answer
  state.answers.push(answer);
  answerSection.classList.add('hidden');

  // Show user answer bubble
  appendBubble('user', answer);

  state.currentQ++;

  if (state.currentQ < TOTAL_QUESTIONS) {
    // More questions
    showNextQuestion();
  } else {
    // All done — show generate button
    generateSection.classList.remove('hidden');
  }
}

/* ─── Step 4: Generate Scope ──────────────────────────────── */
async function handleGenerate() {
  generateSection.classList.add('hidden');
  showLoading('Generating your implementation scope...');

  try {
    const scopeDoc = await generateScopingDocument();
    hideLoading();
    showOutput(scopeDoc);
  } catch (err) {
    hideLoading();
    showError(err.message);
  }
}

/* ─── Output ──────────────────────────────────────────────── */
function showOutput(markdown) {
  outputContent.innerHTML = marked.parse(markdown);
  outputSection.classList.remove('hidden');
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleCopy() {
  const rawMarkdown = buildOutputMarkdown();
  navigator.clipboard.writeText(rawMarkdown).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
  });
}

function buildOutputMarkdown() {
  // Reconstruct from state for clean copy
  const qaContext = state.questions.map((q, i) =>
    `**Q: ${q}**\nA: ${state.answers[i] || ''}`
  ).join('\n\n');
  return `# AI Implementation Scope\n\nProblem: ${state.problem}\n\n${qaContext}\n\n---\n\n${outputContent.innerText}`;
}

function handleRestart() {
  state = {
    apiKey: state.apiKey,
    problem: '',
    questions: [],
    answers: [],
    currentQ: 0,
  };

  conversationThread.innerHTML = '';
  conversationSection.classList.add('hidden');
  answerSection.classList.add('hidden');
  generateSection.classList.add('hidden');
  outputSection.classList.add('hidden');

  problemInput.value = '';
  problemSection.classList.remove('hidden');
  problemInput.focus();
}

/* ─── Claude API Calls ────────────────────────────────────── */

async function generateQuestions(problem) {
  const systemPrompt = `You are an expert AI Implementation Lead conducting an initial discovery session with a client. Your goal is to ask the ${TOTAL_QUESTIONS} most important clarifying questions to fully understand the business problem before recommending an AI implementation approach.

Focus your questions on understanding:
1. The current step-by-step process and who performs it
2. The systems, tools, and data involved
3. The specific pain points, bottlenecks, and what success would look like

Return ONLY a valid JSON array of exactly ${TOTAL_QUESTIONS} question strings. No preamble, no explanation — just the JSON array.

Example format:
["Question one?", "Question two?", "Question three?"]`;

  const response = await callClaude([
    {
      role: 'user',
      content: `Business problem: ${problem}`
    }
  ], systemPrompt, 512);

  // Extract JSON from response
  const text = response.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Unexpected response format from Claude. Please try again.');

  const questions = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(questions) || questions.length !== TOTAL_QUESTIONS) {
    throw new Error('Could not generate questions. Please try again.');
  }

  return questions;
}

async function generateScopingDocument() {
  const qaContext = state.questions.map((q, i) =>
    `Question: ${q}\nAnswer: ${state.answers[i] || 'No answer provided'}`
  ).join('\n\n');

  const systemPrompt = `You are a senior AI Implementation Lead producing a professional scoping document for a client. Based on the business problem and discovery Q&A below, generate a comprehensive, actionable implementation scope in markdown.

Use this exact structure:

## AI Implementation Scope: [concise problem title]

### Problem Summary
[2-3 sentence synthesis of the core problem and opportunity]

### Recommended AI Approach
[Describe the specific type of AI to apply: text classification, information extraction, generative AI, RAG, agentic workflow, etc. Explain why this approach fits.]

**Recommended tools/stack:**
- [Tool 1 with brief reason]
- [Tool 2 with brief reason]

### Process Steps to Automate

| Step | Currently Manual? | Automatable? | AI Approach | Confidence |
|------|------------------|--------------|-------------|------------|
| [step] | Yes/No | Yes/Partial/No | [approach] | High/Med/Low |

### Effort vs. Impact

| Factor | Rating | Notes |
|--------|--------|-------|
| Implementation Effort | Low / Medium / High | [explanation] |
| Business Impact | Low / Medium / High | [explanation] |
| Time to First Value | [X weeks/months] | [explanation] |
| Ongoing Maintenance | Low / Medium / High | [explanation] |

### Phased Rollout Plan

**Phase 1 — Proof of Concept (Weeks 1–3)**
[What to build, what to validate]

**Phase 2 — Pilot (Month 2)**
[Limited rollout, what to measure]

**Phase 3 — Scale (Month 3+)**
[Full deployment, optimisation]

### Key Risks & Mitigations

- **Risk:** [risk] → **Mitigation:** [mitigation]

### Success Metrics

- [Specific, measurable metric]

### Recommended Next Steps

1. [Concrete first action]
2. [Second action]
3. [Third action]

---
*Generated by AI Implementation Scoping Tool · [romanmartins.com](https://romanmartins.com)*

---

Write in a professional, direct tone. Be specific — avoid generic AI buzzwords. All tables must be properly formatted markdown.`;

  const messages = [
    {
      role: 'user',
      content: `Business problem:\n${state.problem}\n\nDiscovery Q&A:\n${qaContext}`
    }
  ];

  return await callClaude(messages, systemPrompt, 2048);
}

async function callClaude(messages, systemPrompt, maxTokens = 1024) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Invalid API key. Please reload and enter a valid Anthropic API key.');
    if (response.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
    throw new Error(err?.error?.message || `API error ${response.status}. Please try again.`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

/* ─── UI Helpers ──────────────────────────────────────────── */

function appendBubble(role, markdown) {
  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${role}`;

  const roleLabel = document.createElement('span');
  roleLabel.className = 'bubble-role';
  roleLabel.textContent = role === 'ai' ? 'AI Implementation Lead' : 'You';

  const body = document.createElement('div');
  body.className = 'bubble-body';
  body.innerHTML = marked.parse(markdown);

  bubble.appendChild(roleLabel);
  bubble.appendChild(body);
  conversationThread.appendChild(bubble);
  bubble.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showLoading(text) {
  loadingText.textContent = text;
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

function showError(message) {
  conversationSection.classList.remove('hidden');
  appendBubble('ai', `**Error:** ${message}\n\nPlease [reload the page](javascript:location.reload()) and try again.`);
}
