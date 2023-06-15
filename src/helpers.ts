const CODE_MARKDOWN = '```';

export const DEFAULT_PROMPTS = [
  'Explain the purpose of this pull-request',
  'Find code enhancement opportunities',
  'Write any missing unit tests',
  'Check the code for SOLID and best practices',
  'Check any security issues with the OWASP Top 10, find any potential security risks',
  'Document the code for this pull-request',
  'Make a code review, with focus on mantainability',
  'Make a code review, with focus on performance',
  'Make a code review, with focus on security',
];

export type Command = {
  command: string;
  value: string | null;
};

export function buildHelpMessage(): string {
  const helpResponse =
    '**Available commands (--help):**' +
    '<br>' +
    `${CODE_MARKDOWN}` +
    '1. --help, list all commands' +
    `${CODE_MARKDOWN}` +
    '<br>' +
    `${CODE_MARKDOWN}` +
    '2. --model, --model string, set the model to use (e.g. --model gpt-4) ' +
    `${CODE_MARKDOWN}` +
    '<br>' +
    `${CODE_MARKDOWN}` +
    '3. --prompts, list of useful prompts' +
    `${CODE_MARKDOWN}` +
    '<br>' +
    `${CODE_MARKDOWN}` +
    '4. --prompt, --prompt integer, set the prompt to use, (e.g. --prompt 1)' +
    `${CODE_MARKDOWN}` +
    '<br>' +
    `${CODE_MARKDOWN}` +
    '5. --exclude, --exclude comma-separated file names, exclude files form diff (e.g. --exclude file1,file2) ' +
    `${CODE_MARKDOWN}` +
    '<br>' +
    `${CODE_MARKDOWN}` +
    '6. --include, --include comma-separated file names, include repository files to the prompt (e.g. --include src/main.ts,src/helper.ts) ' +
    `${CODE_MARKDOWN}` +
    '<br>';

  return helpResponse;
}

export function buildPromptsListMessage(): string {
  return DEFAULT_PROMPTS.map((v: string, i) => {
    return `<br>${CODE_MARKDOWN} ${i + 1}. ${v}${CODE_MARKDOWN}`;
  }).join(' ');
}

/**
 * Processes a given command string and determines the relevant command and its value.
 * @param {string} body - The command string to be processed.
 * @param {string[]} AVAILABLE_COMMANDS - An array of available commands to check against.
 * @returns {Command[]} An array containing the matched commands list and its value (if any).
 */
export const processCommands = (body: string, AVAILABLE_COMMANDS: string[]): Command[] => {
  const result: Command[] = [];
  const commands = AVAILABLE_COMMANDS.filter((v) => {
    return body?.includes(v);
  });

  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];

    if (command === '--help' || command === '--prompts') {
      result.push({ command, value: null });
    } else if (command === '--model') {
      const value = body.split(`${command} `)[1].split(' ')[0];
      result.push({ command, value });
    } else if (command === '--prompt') {
      if (body.includes(`${command} `)) {
        const value = body.split(`${command} `)[1].split(' ')[0];
        result.push({ command, value });
      }
    } else if (command === '--exclude') {
      const value = body.split(`${command} `)[1].split(' ')[0];
      result.push({ command, value });
    } else if (command === '--include') {
      const value = body.split(`${command} `)[1].split(' ')[0];
      result.push({ command, value });
    } else {
      throw new Error(`Could not determine the command in "${body}"`);
    }
  }
  return result;
};
