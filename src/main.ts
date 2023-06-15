import * as core from '@actions/core';
import * as github from '@actions/github';
import type { IssueCommentCreatedEvent, PullRequestReviewComment } from '@octokit/webhooks-types';
import { addComment, listCommentsBefore, getIssue, addReviewCommentReply } from './github/issues';
import { getPullRequestDiff } from './github/pulls';
import { debug, getEventTrigger, writeSummary, removeOccurrence, truncateComments, readRepoFile } from './github/utils';
import { generateCompletion, LLM_MAX_CHARS, LLM_PROPERTIES } from './openai/openai';
import {
  initAssistant,
  initComments,
  initFileContent,
  initIssue,
  initPullRequest,
  initReviewComment,
} from './openai/prompts';
import { removeTextOccurrence } from './openai/utils';
import { buildHelpMessage, buildPromptsListMessage, DEFAULT_PROMPTS, processCommands } from './helpers';

/**
 * The name and handle of the assistant.
 */
const ASSISTANT_NAME = 'rs-gpt-review';
const ASSISTANT_HANDLE = '@rs-gpt-review';
const ASSISTANT_REGEX = /@rs-gpt-review/i;

const GIT_FLAG = '--git ';
const GARBAGE_REGEX = `(?:diff ${GIT_FLAG}\\S***FILE_NAME**).*?(?=diff ${GIT_FLAG}|(?=\n?$(?!\n)))`;
const GARBAGE_FILES = [
  'yarn.lock',
  'package-lock.json',
  '.env.EXAMPLE',
  'Gemfile.lock',
  'Podfile.lock',
  'Package.resolved',
  'dist/',
];

const INCLUDE_FILES: string[] = [];
const AVAILABLE_COMMANDS = ['--help', '--model', '--prompts', '--prompt', '--exclude', '--include'];
const PARAMS: { model: string | '' } = { model: LLM_PROPERTIES.model };

type Inputs = {
  github_token: string;
  openai_key: string;
  openai_temperature?: number;
  openai_top_p?: number;
  openai_max_tokens?: number;
  model?: string;
  files_excluded?: string;
};

/**
 * Returns the inputs for the action.
 * @returns
 */
const getInputs = (): Inputs => ({
  github_token: core.getInput('github_token', { required: true }),
  openai_key: core.getInput('openai_key', { required: true }),
  openai_temperature: parseFloat(core.getInput('openai_temperature')),
  openai_top_p: parseFloat(core.getInput('openai_top_p')),
  openai_max_tokens: parseInt(core.getInput('openai_max_tokens')),
  model: core.getInput('model'),
  files_excluded: core.getInput('files_excluded'),
});

export async function run(): Promise<void> {
  try {
    debug('Context', { context: github.context });

    // get the event object that triggered the workflow
    // this can be an issue, pull request, comment, or review comment
    const trigger = getEventTrigger(github.context);
    debug('Trigger', { trigger });

    // check if the event body contains the assistant handle, otherwise skip
    if (!trigger?.body || !ASSISTANT_REGEX.test(trigger.body)) {
      debug(`Event doesn't contain ${ASSISTANT_HANDLE}. Skipping...`);
      return;
    }

    // get the inputs for the action
    const inputs = getInputs();
    debug('Inputs', { inputs });

    // check if more there are files to exclude from the params
    if (inputs.files_excluded !== '') {
      const exludeFiles: string[] = inputs.files_excluded?.replace(' ', '').split(',') || [];
      GARBAGE_FILES.push(...exludeFiles);
    }

    // check if some command is being called by the user
    if (trigger?.body && new RegExp(AVAILABLE_COMMANDS.join('|')).test(trigger.body)) {
      const commands = processCommands(trigger.body, AVAILABLE_COMMANDS);

      // Check the input command type
      const interactiveCommands = commands.find((c) => {
        return c.command === '--help' || c.command === '--prompts';
      });

      if (interactiveCommands) {
        if (interactiveCommands.command === '--help') {
          const helpResponse: string = buildHelpMessage();
          await addComment(inputs.github_token, github.context.issue.number, helpResponse);
          return;
        } else if (interactiveCommands.command === '--prompts') {
          const promptList: string = buildPromptsListMessage();
          const promptsResponse = `**Available prompts (--prompts):** ${promptList}`;
          await addComment(inputs.github_token, github.context.issue.number, promptsResponse);
          return;
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let index = 0; index < commands.length; index++) {
          const { command, value } = commands[index];

          if (command === '--model') {
            PARAMS.model = value ? value : LLM_PROPERTIES.model;
          }
          if (command === '--prompt') {
            const promptIndex = Number(value) || 1;
            if (!DEFAULT_PROMPTS?.[promptIndex - 1]) {
              throw new Error(`Prompt not available`);
            } else {
              const defaultPrompt = DEFAULT_PROMPTS[promptIndex - 1];
              trigger.body = trigger.body.replace(`--prompt ${promptIndex}`, defaultPrompt);
              await addComment(
                inputs.github_token,
                github.context.issue.number,
                `${ASSISTANT_HANDLE} ${defaultPrompt}`,
              );
            }
          }
          if (command === '--exclude') {
            const exludeFiles: string[] = value?.replace(' ', '').split(',') || [];
            GARBAGE_FILES.push(...exludeFiles);
          }
          if (command === '--include') {
            const includeFiles: string[] = value?.replace(' ', '').split(',') || [];

            for (const fileName of includeFiles) {
              const content = await readRepoFile(inputs.github_token, fileName);
              INCLUDE_FILES.push(content);
            }
          }
        }
      }
    }

    // read the issue or pull request from the GitHub API
    const issue = await getIssue(inputs.github_token, github.context.issue.number);
    debug('Issue', { issue });

    // get the repository information
    const repo = github.context.repo;

    // initialize the prompt with the assistant name and handle
    let prompt = [...initAssistant(ASSISTANT_NAME, ASSISTANT_HANDLE)];

    // the prompt for issues and pull requests is only slightly different
    // but the diff might be very long and we may have to exlude it in the future
    if (issue.pull_request) {
      // get the diff for the pull request
      let diff = await getPullRequestDiff(inputs.github_token, github.context.issue.number);
      debug('Diff before', { before: diff.length });
      // clears the diff string removing garbage to reduce the token amount
      diff = removeOccurrence(diff, GARBAGE_REGEX, GARBAGE_FILES);
      debug('Diff after', { after: diff.length });
      debug('Diff', { diff });

      // add pull request and diff to the prompt
      prompt.push(...initPullRequest(repo, issue, diff));
    } else {
      // add issue to the prompt
      prompt.push(...initIssue(repo, issue));
    }

    // prompt for comments is the same for issues and pull requests
    if (github.context.eventName === 'issue_comment') {
      // get the comment that triggered the workflow and all comments before it
      const { comment } = github.context.payload as IssueCommentCreatedEvent;

      // get the comments before the current one that triggered the workflow
      // the workflow execution may be delayed, so we need to make sure we don't get comments after the current one
      let comments = await listCommentsBefore(inputs.github_token, github.context.issue.number, comment.id);

      // we don't want to exceed half the maxChars limit because the response length also counts
      const limit = LLM_MAX_CHARS / 2;

      comments = truncateComments(comments, prompt.length, limit);

      // add the current comment to the end of the comments
      prompt.push(...initComments([...comments, comment]));
    }

    // prompt for comments is the same for issues and pull requests
    if (github.context.eventName === 'pull_request_review_comment') {
      // get the comment that triggered the workflow and all comments before it
      const { diff_hunk, body } = trigger as PullRequestReviewComment;

      // add the review comment with the diff hunk to the prompt
      prompt.push(...initReviewComment(diff_hunk, body));
    }

    // Clear commands form the prompt
    prompt = removeTextOccurrence(prompt, AVAILABLE_COMMANDS);

    // Add files provided by the user
    if (INCLUDE_FILES.length > 0) {
      prompt.push(...initFileContent(INCLUDE_FILES.toString()));
    }

    debug('Prompt', { prompt });

    // TODO handle max tokens limit
    // generate the completion from the prompt
    const completion = await generateCompletion(inputs.openai_key, {
      model: inputs.model ? inputs.model : PARAMS.model,
      messages: prompt,
      temperature: inputs.openai_temperature,
      top_p: inputs.openai_top_p,
      max_tokens: inputs.openai_max_tokens,
    });

    let response;
    if (github.context.eventName === 'pull_request_review_comment') {
      // add the response as a reply to the review comment
      const { id } = trigger as PullRequestReviewComment;
      response = await addReviewCommentReply(inputs.github_token, github.context.issue.number, completion, id);
    } else {
      // add the response as a comment to the issue or pull request
      response = await addComment(inputs.github_token, github.context.issue.number, completion);
    }
    debug('Response', { response });

    // write a summary of the trigger and response to the job log
    writeSummary(issue, trigger, response, prompt);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error);
  }
}

run();
