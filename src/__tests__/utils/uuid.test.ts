import { describe, it, expect } from 'vitest';
import { generateUUID } from '../../utils/uuid';

describe('generateUUID', () => {
  it('should generate a string', () => {
    const uuid = generateUUID();
    expect(typeof uuid).toBe('string');
  });

  it('should generate a valid UUID v4 format', () => {
    const uuid = generateUUID();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is 8, 9, a, or b
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidV4Regex);
  });

  it('should have the correct length (36 characters)', () => {
    const uuid = generateUUID();
    expect(uuid.length).toBe(36);
  });

  it('should have hyphens at correct positions', () => {
    const uuid = generateUUID();
    expect(uuid[8]).toBe('-');
    expect(uuid[13]).toBe('-');
    expect(uuid[18]).toBe('-');
    expect(uuid[23]).toBe('-');
  });

  it('should have version 4 indicator', () => {
    const uuid = generateUUID();
    // The 13th character (index 14 after first hyphen) should be '4'
    expect(uuid[14]).toBe('4');
  });

  it('should have valid variant bits', () => {
    const uuid = generateUUID();
    // The 17th character (index 19 after second hyphen) should be 8, 9, a, or b
    const variantChar = uuid[19].toLowerCase();
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set<string>();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      uuids.add(generateUUID());
    }

    // All UUIDs should be unique
    expect(uuids.size).toBe(count);
  });

  it('should generate different UUIDs on consecutive calls', () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    const uuid3 = generateUUID();

    expect(uuid1).not.toBe(uuid2);
    expect(uuid2).not.toBe(uuid3);
    expect(uuid1).not.toBe(uuid3);
  });

  it('should only contain valid hexadecimal characters and hyphens', () => {
    const uuid = generateUUID();
    const validChars = /^[0-9a-f-]+$/i;
    expect(uuid).toMatch(validChars);
  });

  it('should be case-insensitive valid', () => {
    // Run multiple times to ensure consistent behavior
    for (let i = 0; i < 10; i++) {
      const uuid = generateUUID();
      // Convert to lowercase and check format
      const lowerUuid = uuid.toLowerCase();
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(lowerUuid).toMatch(uuidV4Regex);
    }
  });
});
