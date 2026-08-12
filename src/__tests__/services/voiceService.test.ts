import { describe, expect, it } from 'vitest';
import { parseVoiceIntent, sanitizeTranscript } from '../../services/voiceService';

describe('voiceService local intent parser', () => {
  it('parses navigation commands without a network model', () => {
    expect(parseVoiceIntent('Next step').command).toBe('next_step');
    expect(parseVoiceIntent('Go back').command).toBe('previous_step');
    expect(parseVoiceIntent('Say that again').command).toBe('repeat');
  });

  it('extracts numeric and spoken timer durations', () => {
    expect(parseVoiceIntent('Set a timer for 15 minutes')).toMatchObject({
      command: 'set_timer',
      parameters: { minutes: 15 },
    });
    expect(parseVoiceIntent('Start a timer for one hour and five minutes')).toMatchObject({
      command: 'set_timer',
      parameters: { minutes: 65 },
    });
  });

  it('extracts a requested cooking step', () => {
    expect(parseVoiceIntent('Skip to step four')).toMatchObject({
      command: 'skip_to_step',
      parameters: { stepNumber: 4 },
    });
  });

  it('extracts inventory item names', () => {
    expect(parseVoiceIntent('Add Greek yogurt to my inventory')).toMatchObject({
      command: 'add_item',
      parameters: { itemName: 'greek yogurt' },
    });
    expect(parseVoiceIntent('When does the milk expire')).toMatchObject({
      command: 'check_expiration',
      parameters: { itemName: 'the milk' },
    });
  });

  it('sanitizes unsupported characters and bounds transcript length', () => {
    const sanitized = sanitizeTranscript('<script>alert(1)</script>' + 'x'.repeat(300));
    expect(sanitized).not.toContain('<');
    expect(sanitized.length).toBeLessThanOrEqual(200);
  });

  it('keeps ambiguous speech reviewable as unknown', () => {
    expect(parseVoiceIntent('purple refrigerator astronomy').command).toBe('unknown');
  });
});
