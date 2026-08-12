import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const voiceMock = vi.hoisted(() => ({
    config: null as null | {
        onError?: (error: string) => void;
        onListeningChange?: (listening: boolean) => void;
    },
    startListening: vi.fn(),
    stopListening: vi.fn(),
    destroy: vi.fn(),
}));

vi.mock('../../services/voiceService', () => ({
    VoiceService: class {
        constructor(config: typeof voiceMock.config) {
            voiceMock.config = config;
        }

        startListening() {
            voiceMock.startListening();
            voiceMock.config?.onListeningChange?.(true);
        }

        stopListening() {
            voiceMock.stopListening();
            voiceMock.config?.onListeningChange?.(false);
        }

        destroy() {
            voiceMock.destroy();
        }
    },
}));

import { VoiceAssistant } from '../../components/VoiceAssistant';

describe('VoiceAssistant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        voiceMock.config = null;
    });

    it('announces microphone failures and closes with Escape', () => {
        render(<VoiceAssistant />);
        fireEvent.click(screen.getByRole('button', { name: 'Start voice assistant' }));

        act(() => voiceMock.config?.onError?.('permission denied'));

        expect(screen.getByRole('status')).toHaveTextContent(/microphone access/i);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(voiceMock.stopListening).toHaveBeenCalled();
    });
});
