import * as core from '@actions/core';
import * as github from '@actions/github';
import { Context } from '@actions/github/lib/context';
import type {
  Issue,
  IssueComment,
  IssueCommentCreatedEvent,
  IssuesOpenedEvent,
  PullRequest,
  PullRequestOpenedEvent,
  PullRequestReviewComment,
  PullRequestReviewCommentCreatedEvent,
} from '@octokit/webhooks-types';

export type Repo = Context['repo'];

/**
 * Reads the content of a file from a GitHub repository.
 * @param {string} github_token - The GitHub authentication token.
 * @param {string} fileName - The name of the file to be read.
 * @returns {Promise<string>} - A promise that resolves to the content of the file.
 */

export async function readRepoFile(github_token: string, fileName: string): Promise<string> {
  const octokit = github.getOctokit(github_token);
  const { owner, repo } = github.context.repo;

  type FileContent = { data: { content: string } };
  const fileBuffer = (await octokit.rest.repos.getContent({
    owner,
    repo,
    path: fileName,
  })) as FileContent;

  return Buffer.from(fileBuffer.data.content, 'base64').toString();
}

/**
 * Returns true if the event originated from an issue event.
 * @see https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#issues
 * @param context
 * @returns
 */
export const isIssueEvent = (context: Context): boolean => {
  return context.eventName === 'issues';
};

/**
 * Returns true if the event originated from a pull request event.
 * @see https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request
 * @param context
 * @returns
 */
export const isPullRequestEvent = (context: Context): boolean => {
  return context.eventName === 'pull_request';
};

/**
 * Returns true if the event originated from an issue comment.
 * @see https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#issue_comment
 * @see https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#issue_comment
 * @param context
 * @returns
 */
export const isIssueCommentEvent = (context: Context): boolean => {
  return context.eventName === 'issue_comment' && context.payload.issue?.pull_request === undefined;
};

/**
 * Returns true if the event originated from a pull request comment.
 * @see https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#issue_comment
 * @see https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#issue_comment
 * @param context
 * @returns
 */
export const isPullRequestCommentEvent = (context: Context): boolean => {
  return context.eventName === 'issue_comment' && context.payload.issue?.pull_request !== undefined;
};

/**
 * Returns true if the event originated from a pull request review comment.
 * @see https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_review_comment
 * @see https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#pull_request_review_comment
 * @param context
 * @returns
 */
export const isPullRequestReviewCommentEvent = (context: Context): boolean => {
  return context.eventName === 'pull_request_review_comment' && context.payload.comment !== undefined;
};

/**
 * Returns the object that triggered the event.
 * If it's an issue event, returns the issue.
 * If it's a pull request event, returns the pull request.
 * If it's a comment event, returns the comment.
 * If it's none of the above, returns undefined.
 * @param context
 * @returns
 */
export const getEventTrigger = (
  context: Context,
): Issue | PullRequest | IssueComment | PullRequestReviewComment | undefined => {
  if (isIssueEvent(context)) {
    const payload = context.payload as IssuesOpenedEvent;
    return payload.issue;
  }

  if (isPullRequestEvent(context)) {
    const payload = context.payload as PullRequestOpenedEvent;
    return payload.pull_request;
  }

  if (isIssueCommentEvent(context) || isPullRequestCommentEvent(context)) {
    const payload = context.payload as IssueCommentCreatedEvent;
    return payload.comment;
  }

  if (isPullRequestReviewCommentEvent(context)) {
    const payload = context.payload as PullRequestReviewCommentCreatedEvent;
    return payload.comment;
  }

  return undefined;
};

/**
 * Returns the issue number from the event payload.
 * Throws an error if the event is not an issue, pull request, or comment.
 * @param context
 * @returns
 */
export const getIssueNumber = (context: Context): number => {
  if (isIssueEvent(context)) {
    const payload = context.payload as IssuesOpenedEvent;
    return payload.issue.number;
  }

  if (isPullRequestEvent(context)) {
    const payload = context.payload as PullRequestOpenedEvent;
    return payload.pull_request.number;
  }

  if (isIssueCommentEvent(context) || isPullRequestCommentEvent(context)) {
    const payload = context.payload as IssueCommentCreatedEvent;
    return payload.issue.number;
  }

  throw new Error(`Could not determine issue number from event "${context.eventName}"`);
};

/**
 * Writes a summary of the request and response to the job log.
 * @see https://github.blog/2022-05-09-supercharging-github-actions-with-job-summaries/
 */
export const writeSummary = async (
  issue: Issue | PullRequest,
  request: Issue | PullRequest | IssueComment | PullRequestReviewComment,
  response: IssueComment | PullRequestReviewComment,
  prompt: unknown,
): Promise<void> => {
  await core.summary
    .addLink('Issue', issue.html_url)
    .addHeading('Request', 3)
    .addRaw(request.body ?? '', true)
    .addBreak()
    .addLink('Comment', request.html_url)
    .addHeading('Response', 3)
    .addRaw(response.body ?? '', true)
    .addBreak()
    .addLink('Comment', response.html_url)
    .addBreak()
    .addHeading('GitHub Context', 3)
    .addCodeBlock(JSON.stringify(github.context.payload, null, 2), 'json')
    .addBreak()
    .addHeading('Prompt', 3)
    .addCodeBlock(JSON.stringify(prompt, null, 2), 'json')
    .write();
};

/**
 * Print a debug message with optional an object.
 * @param message
 * @param obj
 */
export const debug = (message: string, obj?: Record<string, unknown>): void => {
  core.debug(message);
  if (obj !== undefined) core.debug(JSON.stringify(obj, null, 2));
};

/**
 * Remove ocurrence of a string based on a regex
 * @param str
 * @param reg
 * @param fileNames
 */
export const removeOccurrence = (str: string, reg: string, fileNames: string[]): string => {
  for (const f of fileNames) {
    const exp = `${reg.replace('**FILE_NAME**', f)}`;
    str = str.replace(new RegExp(exp, 'gsm'), '');
  }
  return str;
};

export const truncateComments = (
  comments: IssueComment[],
  currentPromptLength: number,
  limit: number,
): IssueComment[] => {
  let totalChars = currentPromptLength;
  const truncatedComments: IssueComment[] = [];

  // Iterate over comments in reverse order
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    const commentChars = comment.body.length;

    // Check if adding the current comment exceeds the threshold limit
    if (totalChars + commentChars <= limit) {
      truncatedComments.unshift(comment); // Add comment to the beginning of the array
      totalChars += commentChars;
    } else {
      break; // Stop iterating if adding the comment would exceed the limit
    }
  }

  return truncatedComments;
};
