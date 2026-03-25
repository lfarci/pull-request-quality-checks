const fs = require('fs');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function info(message) {
  console.log(message);
}

function warning(message) {
  console.warn(message);
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function getInput(name, { required = false } = {}) {
  const envName = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const value = process.env[envName];
  if (required && !value) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  return value || '';
}

function parseGitHubContext() {
  const repository = getRequiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
  }

  const eventPath = getRequiredEnv('GITHUB_EVENT_PATH');
  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  return { owner, repo, payload };
}

function parseAgentOutput(outputFile) {
  const agentOutput = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  const items = Array.isArray(agentOutput.items)
    ? agentOutput.items.filter((item) => item.type === 'upsert_pr_quality_comment')
    : [];

  if (items.length === 0) {
    info('No PR quality comment requested.');
    return null;
  }

  if (items.length > 1) {
    throw new Error('Expected at most one upsert_pr_quality_comment item.');
  }

  return items[0];
}

function normalizeCommentBody(body, marker) {
  let commentBody = body.replace(/^\uFEFF/, '').replace(/^\s+/, '');
  if (commentBody.startsWith(marker)) {
    const remainder = commentBody.slice(marker.length).replace(/^\r?\n?/, '').replace(/^\s*/, '');
    return remainder.length > 0 ? `${marker}\n${remainder}` : `${marker}\n`;
  }

  warning(`Comment body did not begin with "${marker}". Prepending the managed marker automatically.`);
  return `${marker}\n${commentBody}`;
}

async function githubRequest(path, { method = 'GET', token, body } = {}) {
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'upsert-pr-quality-comment-action',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  if (response.status === 204) {
    return { data: null, nextLink: null };
  }

  const linkHeader = response.headers.get('link');
  return {
    data: await response.json(),
    nextLink: parseNextLink(linkHeader),
  };
}

function parseNextLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  for (const part of linkHeader.split(',')) {
    const trimmed = part.trim();
    const match = trimmed.match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match && match[2] === 'next') {
      return match[1];
    }
  }

  return null;
}

async function githubRequestAbsolute(url, { token }) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'upsert-pr-quality-comment-action',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API GET ${url} failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  return {
    data: await response.json(),
    nextLink: parseNextLink(response.headers.get('link')),
  };
}

async function listAllComments(owner, repo, issueNumber, token) {
  const comments = [];
  let nextUrl = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;

  while (nextUrl) {
    const response = await githubRequestAbsolute(nextUrl, { token });
    comments.push(...response.data);
    nextUrl = response.nextLink;
  }

  return comments;
}

async function main() {
  const token = getInput('github-token', { required: true });
  const marker = getInput('marker') || '<!-- pr-quality-check-bot -->';
  const outputFile = getRequiredEnv('GH_AW_AGENT_OUTPUT');
  const item = parseAgentOutput(outputFile);
  if (!item) {
    return;
  }

  const { owner, repo, payload } = parseGitHubContext();
  const issueNumber = Number(item.item_number || payload.pull_request?.number || payload.issue?.number);
  const createIfMissing = item.create_if_missing !== false && item.create_if_missing !== 'false';

  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid pull request number: ${item.item_number}`);
  }

  if (typeof item.body !== 'string' || item.body.length === 0) {
    throw new Error('Comment body must be a non-empty string.');
  }

  const commentBody = normalizeCommentBody(item.body, marker);
  const comments = await listAllComments(owner, repo, issueNumber, token);

  const managedComments = comments
    .filter((comment) =>
      typeof comment.body === 'string' &&
      comment.body.startsWith(marker) &&
      comment.user?.type === 'Bot'
    )
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));

  const [primaryComment, ...duplicateComments] = managedComments;

  if (!primaryComment) {
    if (!createIfMissing) {
      info('No managed PR quality comment exists, and create_if_missing is false. Skipping comment creation.');
      return;
    }

    const createdComment = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      token,
      body: { body: commentBody },
    });
    info(`Created PR quality comment ${createdComment.data.id}.`);
    return;
  }

  if (primaryComment.body !== commentBody) {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${primaryComment.id}`, {
      method: 'PATCH',
      token,
      body: { body: commentBody },
    });
    info(`Updated PR quality comment ${primaryComment.id}.`);
  } else {
    info(`PR quality comment ${primaryComment.id} is already up to date.`);
  }

  for (const duplicateComment of duplicateComments) {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${duplicateComment.id}`, {
      method: 'DELETE',
      token,
    });
    info(`Deleted duplicate managed comment ${duplicateComment.id}.`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});