import { Context } from '@actions/github/lib/context';
import {
  getEventTrigger,
  getIssueNumber,
  isIssueCommentEvent,
  isIssueEvent,
  isPullRequestCommentEvent,
  isPullRequestEvent,
  isPullRequestReviewCommentEvent,
  removeOccurrence,
  readRepoFile,
  truncateComments,
  writeSummary,
} from '../utils';

import * as github from '@actions/github';
import { readFileSync } from 'fs';

describe('utils', () => {
  describe('isIssueEvent', () => {
    it('should return true if the event is an issue event', () => {
      const context: Context = { eventName: 'issues', payload: {} } as any;
      expect(isIssueEvent(context)).toBe(true);
    });

    it('should return false if the event is not an issue event', () => {
      const context: Context = { eventName: 'pull_request', payload: {} } as any;
      expect(isIssueEvent(context)).toBe(false);
    });
  });

  describe('isPullRequestEvent', () => {
    it('should return true if the event is a pull request event', () => {
      const context: Context = { eventName: 'pull_request', payload: {} } as any;
      expect(isPullRequestEvent(context)).toBe(true);
    });

    it('should return false if the event is not a pull request event', () => {
      const context: Context = { eventName: 'issues', payload: {} } as any;
      expect(isPullRequestEvent(context)).toBe(false);
    });
  });

  describe('isIssueCommentEvent', () => {
    it('should return true if the event is an issue comment event', () => {
      const context: Context = { eventName: 'issue_comment', payload: { issue: {} } } as any;
      expect(isIssueCommentEvent(context)).toBe(true);
    });

    it('should return false if the event is not an issue comment event', () => {
      const context: Context = { eventName: 'issue_comment', payload: { issue: { pull_request: {} } } } as any;
      expect(isIssueCommentEvent(context)).toBe(false);
    });
  });

  describe('isPullRequestCommentEvent', () => {
    it('should return true if the event is a pull request comment event', () => {
      const context: Context = { eventName: 'issue_comment', payload: { issue: { pull_request: {} } } } as any;
      expect(isPullRequestCommentEvent(context)).toBe(true);
    });

    it('should return false if the event is not a pull request comment event', () => {
      const context: Context = { eventName: 'issue_comment', payload: { issue: {} } } as any;
      expect(isPullRequestCommentEvent(context)).toBe(false);
    });
  });

  describe('isPullRequestReviewCommentEvent', () => {
    it('should return true if the event is a pull request review comment event', () => {
      const context: Context = {
        eventName: 'pull_request_review_comment',
        payload: { comment: {} },
      } as any;
      expect(isPullRequestReviewCommentEvent(context)).toBe(true);
    });

    it('should return false if the event is not a pull request review comment event', () => {
      const context: Context = { eventName: 'pull_request_review_comment', payload: { issue: {} } } as any;
      expect(isPullRequestReviewCommentEvent(context)).toBe(false);
    });
  });

  describe('getEventTrigger', () => {
    it('should return the issue object if the event is an issue event', () => {
      const context: Context = { eventName: 'issues', payload: { issue: {} } } as any;
      expect(getEventTrigger(context)).toEqual({});
    });

    it('should return the pull request object if the event is a pull request event', () => {
      const context: Context = { eventName: 'pull_request', payload: { pull_request: {} } } as any;
      expect(getEventTrigger(context)).toEqual({});
    });

    it('should return the comment object if the event is an issue comment event', () => {
      const context: Context = { eventName: 'issue_comment', payload: { comment: {} } } as any;
      expect(getEventTrigger(context)).toEqual({});
    });

    it('should return the comment object if the event is a pull request review comment event', () => {
      const context: Context = { eventName: 'pull_request_review_comment', payload: { comment: {} } } as any;
      expect(getEventTrigger(context)).toEqual({});
    });

    it('should return undefined if the event is not an issue, pull request, or comment event', () => {
      const context: Context = { eventName: 'unknown', payload: {} } as any;
      expect(getEventTrigger(context)).toBeUndefined();
    });
  });

  describe('getIssueNumber', () => {
    it('should return the issue number if the event is an issue event', () => {
      const context: Context = { eventName: 'issues', payload: { issue: { number: 42 } } } as any;
      expect(getIssueNumber(context)).toEqual(42);
    });

    it('should return the pull request number if the event is a pull request event', () => {
      const context: Context = { eventName: 'pull_request', payload: { pull_request: { number: 42 } } } as any;
      expect(getIssueNumber(context)).toEqual(42);
    });

    it('should return the issue number if the event is an issue comment event', () => {
      const context: Context = { eventName: 'issue_comment', payload: { issue: { number: 42 } } } as any;
      expect(getIssueNumber(context)).toEqual(42);
    });

    it('should return the issue number if the event is a pull request comment event', () => {
      const context: Context = {
        eventName: 'issue_comment',
        payload: { issue: { number: 42, pull_request: {} } },
      } as any;
      expect(getIssueNumber(context)).toEqual(42);
    });

    it('should throw an error if the event is not an issue, pull request, or comment event', () => {
      const context: Context = { eventName: 'unknown', payload: {} } as any;
      expect(() => getIssueNumber(context)).toThrowError();
    });
  });

  describe('removeOccurrence', () => {
    it('should return a shorter string than the original', () => {
      const file = readFileSync('./src/github/__tests__/diff.txt', 'utf-8');
      const regs = `(?<=**FILE_NAME**).*?(diff --git|(?=\n?$(?!\n)))`;
      const files = ['yarn.lock', '.env.EXAMPLE'];
      expect(file.length).toBeGreaterThan(removeOccurrence(file, regs, files).length);
      expect(removeOccurrence(file, regs, files).length).toEqual(11654);
    });

    it('should return a shorter string than the original, other file', () => {
      const file = readFileSync('./src/github/__tests__/new.txt', 'utf-8');
      const regs = `(?<=**FILE_NAME**).*?(diff --git|(?=\n?$(?!\n)))`;
      const files = [
        'yarn.lock',
        'package-lock.json',
        '.env.EXAMPLE',
        'Gemfile.lock',
        'Podfile.lock',
        'Package.resolved',
      ];
      expect(file.length).toBeGreaterThan(removeOccurrence(file, regs, files).length);
      expect(removeOccurrence(file, regs, files).length).toEqual(606);
    });

    it('should return a string with the same length as the original', () => {
      const file = readFileSync('./src/github/__tests__/diff.txt', 'utf-8');
      expect(file.length).toEqual(removeOccurrence(file, '', []).length);
    });
  });
});

// Mock context and getOctokit functions
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'owner',
      repo: 'repo',
    },
  },
  getOctokit: jest.fn(),
}));

describe('readRepoFile', () => {
  const fakeToken = 'fake-token';
  const fakeFileName = 'README.md';
  const fakeContent = 'Hello, world!';

  beforeEach(() => {
    // Mock Octokit instance
    const mockGetContent = jest.fn().mockResolvedValue({
      data: { content: Buffer.from(fakeContent).toString('base64') },
    });
    const mockOctokit = {
      rest: {
        repos: {
          getContent: mockGetContent,
        },
      },
    };
    (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);
  });

  it('should correctly read the content of a file', async () => {
    const content = await readRepoFile(fakeToken, fakeFileName);
    expect(content).toBe(fakeContent);
  });

  it('should handle API errors gracefully', async () => {
    // Mock an API error scenario
    const mockGetContent = jest.fn().mockRejectedValue(new Error('API Error'));
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: {
        repos: {
          getContent: mockGetContent,
        },
      },
    });

    await expect(readRepoFile(fakeToken, fakeFileName)).rejects.toThrow('API Error');
  });
});

describe('truncateComments', () => {
  // Sample comments
  const comments: any[] = [{ body: 'First comment' }, { body: 'Second comment' }, { body: 'Third comment' }];

  it('returns all comments if the total length is within the limit', () => {
    const limit = 50;
    const currentPromptLength = 0;
    const result = truncateComments(comments, currentPromptLength, limit);
    expect(result.length).toBe(3);
    expect(result).toEqual(comments);
  });

  it('truncates comments when the total length exceeds the limit', () => {
    const limit = 25;
    const currentPromptLength = 0;
    const result = truncateComments(comments, currentPromptLength, limit);
    expect(result.length).toBeLessThan(3);
  });

  it('returns an empty array if the limit is exceeded by the current prompt length', () => {
    const limit = 25;
    const currentPromptLength = 26;
    const result = truncateComments(comments, currentPromptLength, limit);
    expect(result.length).toBe(0);
  });
});
