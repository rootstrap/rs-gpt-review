import { generateCompletion } from '../openai';
import { OpenAIApi } from 'openai';

jest.mock('openai');

describe('generateCompletion', () => {
  const mockOpenAiKey = 'mockOpenAiKey';
  const mockRequest = {
    temperature: 1,
    n: 1,
    stream: false,
    model: '',
    messages: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return the completion content on successful API call', async () => {
    const mockContent = '<!-- rs-gpt-review -->';
    (OpenAIApi.prototype.createChatCompletion as jest.Mock).mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: mockContent,
            },
            finish_reason: 'stop',
          },
        ],
      },
    });

    const result = await generateCompletion(mockOpenAiKey, mockRequest);
    expect(result).toContain(mockContent);
  });

  test('should throw an error on incomplete API response', async () => {
    (OpenAIApi.prototype.createChatCompletion as jest.Mock).mockResolvedValue({
      data: {
        choices: [
          {
            message: null,
            finish_reason: 'incomplete',
          },
        ],
      },
    });

    await expect(generateCompletion(mockOpenAiKey, mockRequest)).rejects.toThrow('API return incomplete');
  });
});
