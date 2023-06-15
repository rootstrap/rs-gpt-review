import type { Issue, IssueComment, PullRequest } from '@octokit/webhooks-types';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { Repo } from '../github/utils';
import { escapeUser, isCommentByAssistant, unescapeComment } from './utils';
import { LLM_MAX_CHARS } from './openai';

export const initAssistant = (name: string, handle: string): ChatCompletionRequestMessage[] => {
  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: [
        `You are a helpful assistant for GitHub issues and pull requests.`,
        `Your name is ${name} and your handle is ${handle}.`,
        `You respond to comments when someone mentions you.`,
      ].join('\n'),
    },
  ];
};

export const initIssue = (repo: Repo, issue: Issue): ChatCompletionRequestMessage[] => {
  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: [
        `The current issue was created by ${escapeUser(issue.user.login)} in repository ${repo.repo}.`,
        `Issue number: ${issue.number}`,
        `Issue title: \`${issue.title}\``,
        `Issue description:`,
        '```',
        issue.body?.substring(0, LLM_MAX_CHARS / 10), // limit the description to 1 tenth of LLM max characters
        '```',
      ].join('\n'),
    },
  ];
};

export const initPullRequest = (
  repo: Repo,
  issue: Issue | PullRequest,
  diff: string,
): ChatCompletionRequestMessage[] => {
  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: [
        `The current pull request was created by ${escapeUser(issue.user.login)} in repository ${repo.repo}.`,
        `Pull request number: ${issue.number}`,
        `Pull request title: \`${issue.title}\``,
        `Pull request description:`,
        '```',
        issue.body?.substring(0, LLM_MAX_CHARS / 10), // limit the description to 1 tenth of LLM max characters
        '```',
      ].join('\n'),
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: [`Git diff:`, diff].join('\n'),
    },
  ];
};

export const initComments = (comments: IssueComment[]): ChatCompletionRequestMessage[] => {
  return comments.length === 0
    ? []
    : [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: `Here are the comments:`,
        },
        ...comments.map((comment) =>
          isCommentByAssistant(comment.body)
            ? {
                role: ChatCompletionRequestMessageRoleEnum.Assistant,
                content: unescapeComment(comment.body),
              }
            : {
                role: ChatCompletionRequestMessageRoleEnum.User,
                name: escapeUser(comment.user.login),
                content: unescapeComment(comment.body),
              },
        ),
      ];
};

export const initReviewComment = (diff_hunk: string, review_comment: string): ChatCompletionRequestMessage[] => {
  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: [`The diff hunk where the comment was made:`, '```', diff_hunk, '```'].join('\n'),
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: unescapeComment(review_comment),
    },
  ];
};

export const initFileContent = (fileContent: string): ChatCompletionRequestMessage[] => {
  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: fileContent,
    },
  ];
};
